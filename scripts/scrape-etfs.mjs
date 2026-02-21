/**
 * One-time justETF scraper.
 *
 * Usage:
 *   cd scripts && npm install && npm run scrape
 *
 * What it does:
 *   1. Opens justETF screener with Puppeteer, paginates through all pages
 *   2. For each ETF, fetches the profile page to get the real index name & provider
 *   3. Writes etfs-scraped.json locally
 *   4. Uploads to Firestore (needs GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
 */

import puppeteer from "puppeteer";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { writeFileSync, readFileSync, existsSync } from "fs";

// -- Config -------------------------------------------------------------------
const SCREENER_URL = "https://www.justetf.com/en/search.html?search=ETFS";
const PROFILE_URL = "https://www.justetf.com/en/etf-profile.html?isin=";
const OUTPUT_FILE = "etfs-scraped.json";
const CONCURRENCY = 2; // parallel profile page fetches
const FETCH_DELAY = 3000; // ms between batches to avoid 429
const MAX_RETRIES = 4; // retries per profile fetch on 429

// -- Helpers ------------------------------------------------------------------

function stripHTML(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Fetch the justETF profile page for an ISIN and extract real index + provider.
 * Retries on 429 with exponential backoff.
 */
async function fetchProfileDetails(isin) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(PROFILE_URL + isin, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (resp.status === 429) {
        const wait = 10000 * (attempt + 1); // 10s, 20s, 30s, 40s
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        return { index: "", provider: "" };
      }

      const html = await resp.text();

      const extract = (testId) => {
        const re = new RegExp(
          'data-testid="' + testId + '">([^<]+)<',
          "i"
        );
        const m = html.match(re);
        return m
          ? m[1]
              .replace(/&amp;/g, "&")
              .replace(/&reg;/g, "")
              .replace(/&#039;/g, "'")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .trim()
          : "";
      };

      return {
        index: extract("tl_etf-basics_value_index-name"),
        provider: extract("tl_etf-basics_value_fund-provider"),
      };
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return { index: "", provider: "" };
    }
  }
  return { index: "", provider: "" };
}

/**
 * Fetch profile details for multiple ISINs with concurrency limit.
 * Only fetches ETFs that don't already have index data (supports resume).
 */
async function fetchAllProfiles(etfs) {
  // Only fetch profiles for ETFs missing index data
  const toFetch = etfs.filter((e) => e.index === "");
  const alreadyDone = etfs.length - toFetch.length;
  if (alreadyDone > 0) {
    console.log(`\n   ✅ ${alreadyDone} ETFs already have profile data`);
  }
  if (toFetch.length === 0) {
    console.log("   ✅ All ETFs already have profile data, skipping.");
    return;
  }

  const total = toFetch.length;
  console.log(`\n🔎 Fetching profile details for ${total} ETFs (concurrency: ${CONCURRENCY}, delay: ${FETCH_DELAY}ms)...`);
  let fetched = 0;
  let failures = 0;

  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((etf) => fetchProfileDetails(etf.isin))
    );

    for (let j = 0; j < batch.length; j++) {
      if (results[j].index) batch[j].index = results[j].index;
      if (results[j].provider) batch[j].provider = results[j].provider;
      if (results[j].index === "") failures++;
    }

    fetched += batch.length;
    if (fetched % 100 < CONCURRENCY || fetched === total) {
      const pct = Math.round((fetched / total) * 100);
      console.log(`   📄 ${fetched}/${total} (${pct}%) — ${failures} failures so far`);
    }

    // Save progress every 500
    if (fetched % 500 < CONCURRENCY) {
      writeFileSync(OUTPUT_FILE, JSON.stringify(etfs, null, 2));
    }

    if (i + CONCURRENCY < total) {
      await new Promise((r) => setTimeout(r, FETCH_DELAY));
    }
  }

  console.log(`   📊 Profile fetch complete: ${total - failures} succeeded, ${failures} failed`);
}

/**
 * Parse a structured DataTables JSON row into our ETF format.
 */
function parseRow(row) {
  const isin = row.isin || "";
  if (!isin || isin.length !== 12) return null;

  const name = (row.name || "").trim();

  // Fund size: "113,739" -> 113739 (millions)
  const fundSizeRaw = String(row.fundSize || "0");
  const fundSizeM = parseInt(fundSizeRaw.replace(/,/g, ""), 10) || 0;

  // Readable fund size string
  let fundSizeText;
  if (fundSizeM >= 1000) {
    fundSizeText = `${Math.round(fundSizeM / 1000)} Mrd EUR`;
  } else {
    fundSizeText = `${fundSizeM} M EUR`;
  }

  // TER: "0.07%" -> 0.07
  const terRaw = String(row.ter || "0");
  const ter = parseFloat(terRaw.replace("%", "").replace(",", ".")) || 0;

  // Distribution policy
  const distPolicy = (row.distributionPolicy || "").toLowerCase();
  const type = distPolicy.includes("dist") ? "distributing" : "accumulating";

  // Replication
  const replicationRaw = stripHTML(row.replicationMethod || "Physical");
  let replication = "Physical";
  if (/swap|synthetic/i.test(replicationRaw)) replication = "Synthetic";
  else if (/optimized|optimised|sampling/i.test(replicationRaw))
    replication = "Optimized sampling";
  else if (/full/i.test(replicationRaw)) replication = "Full replication";

  return {
    name: name.substring(0, 120),
    isin,
    ticker: row.ticker || "",
    index: "", // will be filled by profile fetch
    type,
    ter,
    fundSize: fundSizeText,
    fundSizeM,
    domicile: row.domicileCountry || "Unknown",
    provider: "", // will be filled by profile fetch
    currency: row.fundCurrency || "EUR",
    replication,
  };
}

// -- Scraping (screener) ------------------------------------------------------

async function scrapeScreener() {
  console.log("🚀 Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  const allCapturedRows = [];

  page.on("response", async (response) => {
    const ct = response.headers()["content-type"] || "";
    if (ct.includes("json") || ct.includes("wicket")) {
      try {
        const json = await response.json();
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          allCapturedRows.push(...json.data);
        }
      } catch {}
    }
  });

  console.log("🌐 Navigating to justETF screener...");
  await page.goto(SCREENER_URL, { waitUntil: "networkidle2", timeout: 90_000 });

  // Accept cookie consent
  try {
    const consentBtn = await page.waitForSelector(
      'button[data-testid="uc-accept-all-button"], #uc-btn-accept-banner',
      { timeout: 5_000 }
    );
    if (consentBtn) {
      await consentBtn.click();
      console.log("   🍪 Accepted cookie consent");
      await new Promise((r) => setTimeout(r, 1_000));
    }
  } catch {}

  // Paginate through all pages
  console.log("📄 Navigating through pages...");
  let pageNum = 1;

  while (true) {
    await new Promise((r) => setTimeout(r, 2_000));

    const hasNext = await page.evaluate(() => {
      const nextBtn = document.querySelector(
        ".dataTables_paginate .next:not(.disabled), a.paginate_button.next:not(.disabled)"
      );
      if (nextBtn) {
        nextBtn.click();
        return true;
      }
      const nextLink = document.querySelector('[aria-label="Next"]');
      if (nextLink && !nextLink.closest(".disabled")) {
        nextLink.click();
        return true;
      }
      return false;
    });

    if (!hasNext) {
      console.log(`   📋 Reached last page (page ${pageNum})`);
      break;
    }

    pageNum++;
    if (pageNum % 25 === 0) console.log(`   ➡️  Page ${pageNum}...`);
    await new Promise((r) => setTimeout(r, 3_000));
  }

  await new Promise((r) => setTimeout(r, 2_000));
  await browser.close();

  console.log(`\n📊 Total captured rows: ${allCapturedRows.length}`);

  const etfs = [];
  for (const row of allCapturedRows) {
    const parsed = parseRow(row);
    if (parsed) etfs.push(parsed);
  }

  return etfs;
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
        const { fundSizeM, ...data } = etf;
        batch.set(db.collection("etfs").doc(etf.isin), {
          ...data,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      console.log(
        `   💾 Batch ${Math.floor(i / 500) + 1}: wrote ${slice.length} ETFs`
      );
    }

    console.log(`✅ Uploaded ${etfs.length} ETFs to Firestore`);
  } catch (err) {
    console.error(
      "⚠️  Firestore upload failed (credentials missing?):",
      err.message
    );
    console.log("   The JSON file was still saved locally.");
  }
}

// -- Main ---------------------------------------------------------------------

async function main() {
  const resumeMode = process.argv.includes("--resume");
  let unique;

  if (resumeMode && existsSync(OUTPUT_FILE)) {
    // Resume: reload previously scraped data and only fetch missing profiles
    console.log("🔄 Resume mode: loading existing data from " + OUTPUT_FILE);
    unique = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    console.log(`   📊 Loaded ${unique.length} ETFs`);
  } else {
    // Step 1: Scrape screener for all ETFs (basic data)
    const etfs = await scrapeScreener();
    console.log(`\n📈 Total parsed: ${etfs.length} ETFs`);

    // De-duplicate by ISIN
    unique = [...new Map(etfs.map((e) => [e.isin, e])).values()];
    console.log(`🧹 After de-duplication: ${unique.length} ETFs`);
  }

  // Step 2: Fetch real index & provider from profile pages
  await fetchAllProfiles(unique);

  // Sort by fund size descending
  unique.sort((a, b) => b.fundSizeM - a.fundSizeM);

  // Save JSON locally
  writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));
  console.log(`\n📄 Saved to ${OUTPUT_FILE}`);

  // Preview top 15
  console.log("\n── Top 15 by fund size ──");
  for (const e of unique.slice(0, 15)) {
    console.log(
      `  ${e.isin}  ${e.fundSize.padEnd(14)} ${String(e.ter).padEnd(5)}%  ${e.provider.padEnd(20)} ${e.index}`
    );
  }

  // Show index distribution
  const indexCounts = {};
  for (const e of unique) {
    const idx = e.index || "(unknown)";
    indexCounts[idx] = (indexCounts[idx] || 0) + 1;
  }
  console.log("\n── Index distribution (top 20) ──");
  for (const [idx, count] of Object.entries(indexCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)) {
    console.log(`  ${idx.padEnd(40)} ${count}`);
  }

  // Show provider distribution
  const provCounts = {};
  for (const e of unique) {
    const p = e.provider || "(unknown)";
    provCounts[p] = (provCounts[p] || 0) + 1;
  }
  console.log("\n── Provider distribution ──");
  for (const [p, count] of Object.entries(provCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${p.padEnd(30)} ${count}`);
  }

  // Upload to Firestore
  console.log("\n🔥 Uploading to Firestore...");
  await uploadToFirestore(unique);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
