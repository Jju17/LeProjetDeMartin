/**
 * EODHD ETF enrichment script.
 *
 * Usage:
 *   cd scripts && node enrich-eodhd.mjs
 *
 * What it does:
 *   1. Fetches all ETFs from European exchanges via EODHD API
 *   2. De-duplicates by ISIN, merges with existing justETF data if available
 *   3. Fetches latest closing price for each ETF via EODHD EOD endpoint
 *   4. Uploads everything to Firestore
 *
 * Note: The EODHD free plan only provides EOD price data, not fundamentals.
 *       TER, fund size, distribution policy, and replication come from
 *       the existing justETF screener data (matched by ISIN).
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { writeFileSync, readFileSync, existsSync } from "fs";

// -- Config -------------------------------------------------------------------
const API_TOKEN = "6999b5d8748e30.09532451";
const BASE_URL = "https://eodhd.com/api";
const OUTPUT_FILE = "etfs-eodhd.json";
const JUSTEFT_FILE = "etfs-scraped.json";

// European exchanges to scan (most ETFs are listed on XETRA and LSE)
const EXCHANGES = ["XETRA", "LSE", "AS", "PA", "SW"];

const PRICE_CONCURRENCY = 20;
const PRICE_DELAY = 200; // ms between batches

// -- Helpers ------------------------------------------------------------------

async function apiFetch(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}/${endpoint}${sep}api_token=${API_TOKEN}&fmt=json`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

function formatFundSize(totalAssets) {
  if (!totalAssets || totalAssets <= 0) return "";
  const m = totalAssets / 1_000_000;
  if (m >= 1000) return `${Math.round(m / 1000)} Mrd EUR`;
  if (m >= 1) return `${Math.round(m)} M EUR`;
  return "";
}

// -- Step 1: List all ETFs from European exchanges ----------------------------

async function listAllETFs() {
  console.log("📋 Fetching ETF lists from European exchanges...");
  const allETFs = new Map(); // ISIN -> ETF data

  for (const exchange of EXCHANGES) {
    try {
      const symbols = await apiFetch(`exchange-symbol-list/${exchange}?type=etf`);
      let added = 0;

      for (const s of symbols) {
        const isin = s.Isin || "";
        if (!isin || isin.length !== 12) continue;

        // Keep the first listing we find (prefer XETRA for EUR pricing)
        if (!allETFs.has(isin)) {
          allETFs.set(isin, {
            name: s.Name || "",
            isin,
            ticker: s.Code || "",
            exchange,
            currency: s.Currency || "EUR",
            // These will be enriched from justETF data or profile fetches
            index: "",
            type: "accumulating",
            ter: 0,
            fundSize: "",
            domicile: "",
            provider: "",
            replication: "",
          });
          added++;
        }
      }

      console.log(`   ${exchange}: ${symbols.length} ETFs listed, ${added} new ISINs added`);
    } catch (err) {
      console.error(`   ⚠️  ${exchange}: ${err.message}`);
    }
  }

  console.log(`   📊 Total unique ETFs: ${allETFs.size}`);
  return allETFs;
}

// -- Step 2: Merge with existing justETF data ---------------------------------

function mergeWithJustETFData(etfMap) {
  if (!existsSync(JUSTEFT_FILE)) {
    console.log("\n⚠️  No justETF data found, skipping merge.");
    return;
  }

  console.log("\n🔗 Merging with existing justETF data...");
  const justETFs = JSON.parse(readFileSync(JUSTEFT_FILE, "utf-8"));
  let merged = 0;

  for (const je of justETFs) {
    const existing = etfMap.get(je.isin);
    if (existing) {
      // Enrich EODHD data with justETF fields
      if (je.index) existing.index = je.index;
      if (je.provider) existing.provider = je.provider;
      if (je.ter) existing.ter = je.ter;
      if (je.fundSize) existing.fundSize = je.fundSize;
      if (je.domicile) existing.domicile = je.domicile;
      if (je.replication) existing.replication = je.replication;
      if (je.type) existing.type = je.type;
      merged++;
    } else {
      // ETF exists in justETF but not on EODHD exchanges — add it anyway
      etfMap.set(je.isin, {
        name: je.name,
        isin: je.isin,
        ticker: je.ticker || "",
        exchange: "",
        currency: je.currency || "EUR",
        index: je.index || "",
        type: je.type || "accumulating",
        ter: je.ter || 0,
        fundSize: je.fundSize || "",
        domicile: je.domicile || "",
        provider: je.provider || "",
        replication: je.replication || "",
      });
    }
  }

  console.log(`   ✅ Merged ${merged} ETFs with justETF data`);
  console.log(`   📊 Total after merge: ${etfMap.size}`);
}

// -- Step 3: Guess distribution type from name --------------------------------

function guessTypeFromName(name) {
  const n = name.toLowerCase();
  if (n.includes("dist") || n.includes("(d)") || n.includes("distributing")) return "distributing";
  if (n.includes("acc") || n.includes("(a)") || n.includes("accumulating")) return "accumulating";
  return "accumulating";
}

function guessDomicile(isin) {
  if (isin.startsWith("IE")) return "Ireland";
  if (isin.startsWith("LU")) return "Luxembourg";
  if (isin.startsWith("DE")) return "Germany";
  if (isin.startsWith("FR")) return "France";
  if (isin.startsWith("CH")) return "Switzerland";
  if (isin.startsWith("GB")) return "UK";
  return "";
}

// -- Step 4: Fetch latest prices from EODHD -----------------------------------

async function fetchLatestPrices(etfs) {
  console.log(`\n💰 Fetching latest prices for ${etfs.length} ETFs...`);
  let fetched = 0;
  let failures = 0;

  for (let i = 0; i < etfs.length; i += PRICE_CONCURRENCY) {
    const batch = etfs.slice(i, i + PRICE_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (etf) => {
        const exchange = etf.exchange || guessExchange(etf.isin);
        if (!exchange) return null;
        try {
          const data = await apiFetch(
            `eod/${etf.ticker}.${exchange}?period=d&order=d&from=2026-02-10`
          );
          if (Array.isArray(data) && data.length > 0) {
            return {
              isin: etf.isin,
              close: data[0].adjusted_close || data[0].close,
              date: data[0].date,
            };
          }
        } catch {}
        return null;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const etf = etfs.find((e) => e.isin === r.value.isin);
        if (etf) {
          etf.latestQuote = r.value.close;
          etf.quoteDate = r.value.date;
        }
        fetched++;
      } else {
        failures++;
      }
    }

    const done = Math.min(i + PRICE_CONCURRENCY, etfs.length);
    if (done % 200 === 0 || done === etfs.length) {
      console.log(`   📈 ${done}/${etfs.length} — ${fetched} prices, ${failures} failures`);
    }

    if (i + PRICE_CONCURRENCY < etfs.length) {
      await new Promise((r) => setTimeout(r, PRICE_DELAY));
    }
  }

  console.log(`   ✅ Prices fetched: ${fetched} success, ${failures} failed`);
}

function guessExchange(isin) {
  if (isin.startsWith("IE") || isin.startsWith("LU") || isin.startsWith("DE") || isin.startsWith("FR")) return "XETRA";
  if (isin.startsWith("GB")) return "LSE";
  return "XETRA";
}

// -- Firestore upload ---------------------------------------------------------

async function uploadToFirestore(etfs) {
  try {
    initializeApp({
      credential: applicationDefault(),
      projectId: "leprojetdemartin",
    });
    const db = getFirestore();

    // Clear existing collection
    const existing = await db.collection("etfs").listDocuments();
    if (existing.length > 0) {
      for (let i = 0; i < existing.length; i += 500) {
        const batch = db.batch();
        const slice = existing.slice(i, i + 500);
        for (const doc of slice) batch.delete(doc);
        await batch.commit();
      }
    }
    console.log(`   🗑️  Cleared ${existing.length} existing documents`);

    // Write new ETFs
    for (let i = 0; i < etfs.length; i += 500) {
      const batch = db.batch();
      const slice = etfs.slice(i, i + 500);
      for (const etf of slice) {
        // Clean up fields before saving
        const doc = {
          name: etf.name,
          isin: etf.isin,
          ticker: etf.ticker,
          index: etf.index,
          type: etf.type,
          ter: etf.ter,
          fundSize: etf.fundSize,
          domicile: etf.domicile,
          provider: etf.provider,
          currency: etf.currency,
          replication: etf.replication,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (etf.latestQuote) doc.latestQuote = etf.latestQuote;
        if (etf.quoteDate) doc.quoteDate = etf.quoteDate;
        batch.set(db.collection("etfs").doc(etf.isin), doc);
      }
      await batch.commit();
      console.log(`   💾 Batch ${Math.floor(i / 500) + 1}: wrote ${slice.length} ETFs`);
    }

    console.log(`✅ Uploaded ${etfs.length} ETFs to Firestore`);
  } catch (err) {
    console.error("⚠️  Firestore upload failed:", err.message);
    console.log("   The JSON file was still saved locally.");
  }
}

// -- Main ---------------------------------------------------------------------

async function main() {
  // Step 1: List all ETFs from European exchanges
  const etfMap = await listAllETFs();

  // Step 2: Merge with justETF data (TER, fund size, index, provider, etc.)
  mergeWithJustETFData(etfMap);

  // Step 3: Fill in missing data from name/ISIN heuristics
  for (const [, etf] of etfMap) {
    if (!etf.type || etf.type === "accumulating") {
      etf.type = guessTypeFromName(etf.name);
    }
    if (!etf.domicile) {
      etf.domicile = guessDomicile(etf.isin);
    }
  }

  const etfs = [...etfMap.values()];

  // Step 4: Fetch latest prices
  await fetchLatestPrices(etfs);

  // Sort by name
  etfs.sort((a, b) => a.name.localeCompare(b.name));

  // Save locally
  writeFileSync(OUTPUT_FILE, JSON.stringify(etfs, null, 2));
  console.log(`\n📄 Saved ${etfs.length} ETFs to ${OUTPUT_FILE}`);

  // Stats
  const withIndex = etfs.filter((e) => e.index).length;
  const withProvider = etfs.filter((e) => e.provider).length;
  const withTER = etfs.filter((e) => e.ter > 0).length;
  const withPrice = etfs.filter((e) => e.latestQuote).length;
  console.log(`\n── Stats ──`);
  console.log(`  Total:      ${etfs.length}`);
  console.log(`  With index: ${withIndex}`);
  console.log(`  With prov:  ${withProvider}`);
  console.log(`  With TER:   ${withTER}`);
  console.log(`  With price: ${withPrice}`);

  // Upload to Firestore
  console.log("\n🔥 Uploading to Firestore...");
  await uploadToFirestore(etfs);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
