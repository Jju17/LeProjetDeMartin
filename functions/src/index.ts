import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ETFData {
  name: string;
  isin: string;
  ticker: string;
  index: string;
  type: "accumulating" | "distributing";
  ter: number;
  fundSize: string;
  domicile: string;
  provider: string;
  currency: string;
  replication: string;
  latestQuote?: number;
  quoteDate?: string;
  fsmaCode?: string;
}

// ---------------------------------------------------------------------------
// justETF Quote API – lightweight REST call, no scraping needed
// ---------------------------------------------------------------------------

async function fetchQuote(isin: string): Promise<{ price: number; date: string } | null> {
  try {
    const url = `https://www.justetf.com/api/etfs/${isin}/quote?locale=en&currency=EUR&isin=${isin}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      latestQuote?: { raw?: number };
      latestQuoteDate?: string;
    };
    return {
      price: json.latestQuote?.raw ?? 0,
      date: json.latestQuoteDate ?? "",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Firestore operations
// ---------------------------------------------------------------------------

async function saveETFsToFirestore(etfs: ETFData[]): Promise<void> {
  for (let i = 0; i < etfs.length; i += 500) {
    const batch = db.batch();
    const slice = etfs.slice(i, i + 500);
    for (const etf of slice) {
      const ref = db.collection("etfs").doc(etf.isin);
      batch.set(ref, { ...etf, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
}

async function getETFsFromFirestore(): Promise<ETFData[]> {
  const snapshot = await db.collection("etfs").get();
  return snapshot.docs.map((doc) => doc.data() as ETFData);
}

async function enrichWithQuotes(etfs: ETFData[]): Promise<ETFData[]> {
  const batchSize = 5;
  const enriched = [...etfs];

  for (let i = 0; i < enriched.length; i += batchSize) {
    const slice = enriched.slice(i, i + batchSize);
    const quotes = await Promise.all(slice.map((etf) => fetchQuote(etf.isin)));

    quotes.forEach((quote, j) => {
      if (quote) {
        enriched[i + j] = {
          ...enriched[i + j],
          latestQuote: quote.price,
          quoteDate: quote.date,
        };
      }
    });
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// In-memory cache (persists across warm invocations)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let etfCache: CacheEntry<ETFData[]> | null = null;
let fsmaCache: CacheEntry<FSMACompartment[]> | null = null;

// ---------------------------------------------------------------------------
// Cloud Functions
// ---------------------------------------------------------------------------

/**
 * GET /getETFs
 * Returns all ETFs from Firestore. Data is seeded by the local scraper script.
 */
export const getETFs = onRequest(
  { cors: true, memory: "128MiB", timeoutSeconds: 15, region: "europe-west1" },
  async (_req, res) => {
    try {
      const now = Date.now();
      if (!etfCache || now - etfCache.timestamp > CACHE_TTL_MS) {
        etfCache = { data: await getETFsFromFirestore(), timestamp: now };
      }
      res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.json({ etfs: etfCache.data, count: etfCache.data.length });
    } catch (error) {
      console.error("Error fetching ETFs:", error);
      res.status(500).json({ etfs: [], count: 0, error: String(error) });
    }
  }
);

// ---------------------------------------------------------------------------
// FSMA Collection
// ---------------------------------------------------------------------------

interface FSMACompartment {
  cisCode: string;
  cisKbo: string;
  cisNameFR: string;
  cisNameNL: string;
  cisLicense: string;
  cisNationality: string;
  cisLegalForm: string;
  cisLegalFormFR: string;
  cisLegalFormNL: string;
  cisManagementType: string;
  cisManagementCompanyFR: string;
  cisManagementCompanyNL: string;
  compartmentCode: string;
  compartmentNameFR: string;
  compartmentNameNL: string;
  shareClassCode: string;
  shareClassNameFR: string;
  shareClassNameNL: string;
  shareClassType: string;
  shareClassCurrency: string;
  shareClassISIN: string;
}

/**
 * GET /getFSMA
 * Returns all FSMA compartments from Firestore.
 */
export const getFSMA = onRequest(
  { cors: true, memory: "256MiB", timeoutSeconds: 30, region: "europe-west1" },
  async (_req, res) => {
    try {
      const now = Date.now();
      if (!fsmaCache || now - fsmaCache.timestamp > CACHE_TTL_MS) {
        const snapshot = await db.collection("fsma").get();
        fsmaCache = {
          data: snapshot.docs.map((doc) => doc.data() as FSMACompartment),
          timestamp: now,
        };
      }
      res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.json({ compartments: fsmaCache.data, count: fsmaCache.data.length });
    } catch (error) {
      console.error("Error fetching FSMA data:", error);
      res.status(500).json({ compartments: [], count: 0, error: String(error) });
    }
  }
);

/**
 * Scheduled: runs daily at 6:00 AM UTC.
 * Refreshes quotes for all ETFs in Firestore.
 */
export const scheduledQuoteRefresh = onSchedule(
  { schedule: "0 6 * * *", memory: "256MiB", timeoutSeconds: 300, region: "europe-west1" },
  async () => {
    try {
      const etfs = await getETFsFromFirestore();
      if (etfs.length === 0) return;

      const enriched = await enrichWithQuotes(etfs);
      await saveETFsToFirestore(enriched);
      etfCache = null; // invalidate cache after refresh
      console.log(`Refreshed quotes for ${enriched.length} ETFs.`);
    } catch (error) {
      console.error("Scheduled quote refresh failed:", error);
    }
  }
);
