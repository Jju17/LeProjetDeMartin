/**
 * FSMA Cross-check script.
 *
 * Reads the official FSMA list of registered compartments (sub-funds),
 * compares with ETFs in Firestore (via etfs-eodhd.json),
 * and stores the FSMA compartment code on matched ETFs.
 *
 * Matching strategy (conservative):
 *   1. Name match: compartment FR/NL name matches ETF name
 *      (exact after stripping suffixes, or prefix with >= 3 words)
 *   2. Provider verification: the ETF provider or name must share a
 *      brand keyword with the FSMA management company / CIS name.
 *      This eliminates false positives from coincidental name overlaps.
 *
 * Usage:
 *   cd scripts && node fsma-crosscheck.mjs
 */

import pkg from "xlsx";
const { readFile, utils } = pkg;
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, writeFileSync, existsSync } from "fs";

// -- Config -------------------------------------------------------------------
const FSMA_FILE = "/Users/julien/Downloads/official_lists_fo_FR.xlsx";
const ETF_FILE = "etfs-eodhd.json";
const OUTPUT_FILE = "fsma-matches.json";

// Generic words to ignore when comparing provider vs management company
const GENERIC_WORDS = new Set([
  "fund", "funds", "asset", "management", "global", "ireland", "luxembourg",
  "limited", "ltd", "the", "company", "managers", "international", "group",
  "europe", "investment", "investments", "capital", "advisors", "solutions",
  "partners", "sicav", "icav", "plc", "ucits", "etf", "etfs", "index",
  "markets", "advisers", "services",
]);

// -- Step 1: Parse the FSMA Excel file ----------------------------------------

function parseFSMA() {
  console.log("📄 Reading FSMA file...");
  const wb = readFile(FSMA_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = utils.sheet_to_json(ws, { header: 1 });

  const rows = data.slice(3);
  console.log(`   ${rows.length} rows`);

  // Col 0: CIS FSMA CODE
  // Col 2: CIS FRENCH OFFICIAL NAME
  // Col 4: CIS DUTCH OFFICIAL NAME
  // Col 11: CIS FRENCH MANAGEMENT COMPANY
  // Col 12: CIS DUTCH MANAGEMENT COMPANY
  // Col 21: COMPARTMENT FSMA CODE
  // Col 22: COMPARTMENT FRENCH OFFICIAL NAME
  // Col 23: COMPARTMENT DUTCH OFFICIAL NAME
  const compartments = new Map();

  for (const r of rows) {
    const code = String(r[21] || "").trim();
    if (!code) continue;

    if (compartments.has(code)) {
      const entry = compartments.get(code);
      const nameFR = String(r[22] || "").trim();
      const nameNL = String(r[23] || "").trim();
      if (nameFR) entry.names.add(nameFR);
      if (nameNL) entry.names.add(nameNL);
    } else {
      const names = new Set();
      const nameFR = String(r[22] || "").trim();
      const nameNL = String(r[23] || "").trim();
      if (nameFR) names.add(nameFR);
      if (nameNL) names.add(nameNL);

      compartments.set(code, {
        code,
        names,
        cisNameFR: String(r[2] || "").trim(),
        cisNameNL: String(r[4] || "").trim(),
        mgmtCompanyFR: String(r[11] || "").trim(),
        mgmtCompanyNL: String(r[12] || "").trim(),
      });
    }
  }

  console.log(`   ${compartments.size} unique compartments`);
  return compartments;
}

// -- Step 2: Matching functions -----------------------------------------------

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function generateKeys(name) {
  const norm = normalize(name);
  const keys = [norm];

  const stripped = norm
    .replace(/\s*\(acc\)|\s*\(dist\)|\s*\(c\)|\s*\(d\)/gi, "")
    .replace(/\s+(usd|eur|gbp|chf|jpy)\s*$/i, "")
    .replace(/\s+(1c|1d|2c|2d|3c)\s*$/i, "")
    .replace(/\s+(acc|dist|distributing|accumulating)\s*$/i, "")
    .trim();
  if (stripped !== norm) keys.push(stripped);

  const noUcits = stripped.replace(/\s+ucits\s+etf.*$/i, "").trim();
  if (noUcits !== stripped) keys.push(noUcits);

  const noETF = stripped.replace(/\s+etf.*$/i, "").trim();
  if (noETF !== stripped && noETF !== noUcits) keys.push(noETF);

  return keys;
}

/**
 * Extract brand keywords from management company and CIS names.
 * These are non-generic words that identify the fund provider.
 */
function extractBrandWords(mgmtFR, mgmtNL, cisNameFR, cisNameNL) {
  const allText = [mgmtFR, mgmtNL, cisNameFR, cisNameNL].join(" ");
  const words = normalize(allText).split(/[\s,()]+/).filter((w) => w.length >= 3);
  return words.filter((w) => !GENERIC_WORDS.has(w));
}

/**
 * Verify that the ETF provider/name shares a brand keyword
 * with the FSMA management company / CIS name.
 */
function verifyProvider(etfName, etfProvider, brandWords) {
  const source = normalize(etfProvider || etfName);
  return brandWords.some((w) => source.includes(w));
}

function buildFSMALookup(compartments) {
  const exactMap = new Map();
  const prefixList = [];

  for (const [, entry] of compartments) {
    const brandWords = extractBrandWords(
      entry.mgmtCompanyFR, entry.mgmtCompanyNL,
      entry.cisNameFR, entry.cisNameNL
    );

    for (const name of entry.names) {
      const norm = normalize(name);
      if (norm.length >= 4) {
        const data = { original: name, code: entry.code, brandWords };
        exactMap.set(norm, data);
        prefixList.push({ norm, ...data });
      }
    }
  }

  prefixList.sort((a, b) => b.norm.length - a.norm.length);
  return { exactMap, prefixList };
}

function findFSMAMatch(etfName, etfProvider, lookup) {
  const keys = generateKeys(etfName);

  // 1) Exact match
  for (const key of keys) {
    if (lookup.exactMap.has(key)) {
      const m = lookup.exactMap.get(key);
      if (verifyProvider(etfName, etfProvider, m.brandWords)) {
        return { type: "exact", fsmaCode: m.code, fsmaName: m.original };
      }
    }
  }

  // 2) Prefix match (>= 3 words)
  const normETF = normalize(etfName);
  for (const { norm, original, code, brandWords } of lookup.prefixList) {
    if (norm.split(" ").length < 3) continue;
    if (normETF.startsWith(norm + " ") || normETF === norm) {
      if (verifyProvider(etfName, etfProvider, brandWords)) {
        return { type: "prefix", fsmaCode: code, fsmaName: original };
      }
    }
  }

  return null;
}

// -- Step 3: Cross-check ------------------------------------------------------

function crossCheck(etfs, compartments) {
  console.log("\n🔍 Cross-checking ETFs with FSMA compartments...");

  const lookup = buildFSMALookup(compartments);
  console.log(`   ${lookup.exactMap.size} normalized compartment names`);

  let exactMatches = 0;
  let prefixMatches = 0;

  for (const etf of etfs) {
    const match = findFSMAMatch(etf.name, etf.provider, lookup);
    if (match) {
      etf.fsmaCode = match.fsmaCode;
      etf.fsmaMatchType = match.type;
      etf.fsmaMatchedName = match.fsmaName;
      if (match.type === "exact") exactMatches++;
      else prefixMatches++;
    } else {
      delete etf.fsmaCode;
      delete etf.fsmaRegistered;
    }
  }

  const noMatch = etfs.length - exactMatches - prefixMatches;

  console.log(`   ✅ Exact matches:   ${exactMatches}`);
  console.log(`   🔗 Prefix matches:  ${prefixMatches}`);
  console.log(`   ❌ No match:        ${noMatch}`);
  console.log(`   📊 Total flagged:   ${exactMatches + prefixMatches} / ${etfs.length}`);

  return etfs;
}

// -- Step 4: Upload to Firestore ----------------------------------------------

async function updateFirestore(etfs) {
  const flagged = etfs.filter((e) => e.fsmaCode);
  const unflagged = etfs.filter((e) => !e.fsmaCode);

  try {
    initializeApp({
      credential: applicationDefault(),
      projectId: "leprojetdemartin",
    });
    const db = getFirestore();

    let updated = 0;
    for (let i = 0; i < flagged.length; i += 500) {
      const batch = db.batch();
      const slice = flagged.slice(i, i + 500);
      for (const etf of slice) {
        const ref = db.collection("etfs").doc(etf.isin);
        batch.update(ref, {
          fsmaCode: etf.fsmaCode,
          fsmaRegistered: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      updated += slice.length;
      console.log(`   💾 Flagged: ${updated}/${flagged.length}`);
    }

    let cleared = 0;
    for (let i = 0; i < unflagged.length; i += 500) {
      const batch = db.batch();
      const slice = unflagged.slice(i, i + 500);
      for (const etf of slice) {
        const ref = db.collection("etfs").doc(etf.isin);
        batch.update(ref, {
          fsmaCode: FieldValue.delete(),
          fsmaRegistered: FieldValue.delete(),
        });
      }
      await batch.commit();
      cleared += slice.length;
    }

    console.log(`✅ Set fsmaCode on ${flagged.length} ETFs, cleared ${cleared} ETFs`);
  } catch (err) {
    console.error("⚠️  Firestore update failed:", err.message);
  }
}

// -- Main ---------------------------------------------------------------------

async function main() {
  const compartments = parseFSMA();

  if (!existsSync(ETF_FILE)) {
    console.error("❌ ETF file not found:", ETF_FILE);
    process.exit(1);
  }
  const etfs = JSON.parse(readFileSync(ETF_FILE, "utf-8"));
  console.log(`\n📊 Loaded ${etfs.length} ETFs from ${ETF_FILE}`);

  crossCheck(etfs, compartments);

  // Save matches report
  const matches = etfs
    .filter((e) => e.fsmaCode)
    .map((e) => ({
      isin: e.isin,
      name: e.name,
      fsmaCode: e.fsmaCode,
      matchType: e.fsmaMatchType,
      fsmaName: e.fsmaMatchedName,
    }));
  writeFileSync(OUTPUT_FILE, JSON.stringify(matches, null, 2));
  console.log(`\n📄 Saved ${matches.length} matches to ${OUTPUT_FILE}`);

  // Show samples
  console.log("\n── Sample exact matches ──");
  for (const m of matches.filter((m) => m.matchType === "exact").slice(0, 10)) {
    console.log(`  [${m.fsmaCode}]  ${m.name.substring(0, 55).padEnd(55)}  = ${m.fsmaName.substring(0, 50)}`);
  }
  console.log("\n── Sample prefix matches ──");
  for (const m of matches.filter((m) => m.matchType === "prefix").slice(0, 10)) {
    console.log(`  [${m.fsmaCode}]  ${m.name.substring(0, 55).padEnd(55)}  ← ${m.fsmaName.substring(0, 50)}`);
  }

  // Unmatched stats
  const unmatched = etfs.filter((e) => !e.fsmaCode);
  const unmatchedByProvider = {};
  for (const e of unmatched) {
    const p = e.provider || e.name.split(" ")[0] || "Unknown";
    unmatchedByProvider[p] = (unmatchedByProvider[p] || 0) + 1;
  }
  console.log("\n── Top unmatched providers ──");
  Object.entries(unmatchedByProvider)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([prov, count]) => console.log(`  ${String(count).padStart(4)}  ${prov}`));

  console.log("\n🔥 Updating Firestore...");
  await updateFirestore(etfs);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
