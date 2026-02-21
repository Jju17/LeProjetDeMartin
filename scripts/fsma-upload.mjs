/**
 * FSMA Upload script.
 *
 * Reads the official FSMA Excel file and uploads all compartments
 * to a "fsma" Firestore collection. Each document = one compartment row.
 *
 * Document ID = COMPARTMENT FSMA CODE (e.g., "00991-0001")
 *
 * Usage:
 *   cd scripts && node fsma-upload.mjs
 */

import pkg from "xlsx";
const { readFile, utils } = pkg;
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// -- Config -------------------------------------------------------------------
const FSMA_FILE = "/Users/julien/Downloads/official_lists_fo_FR.xlsx";

// -- Parse --------------------------------------------------------------------

function parseFSMA() {
  console.log("📄 Reading FSMA file...");
  const wb = readFile(FSMA_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = utils.sheet_to_json(ws, { header: 1 });

  const rows = data.slice(3);
  console.log(`   ${rows.length} rows`);

  const documents = [];

  for (const r of rows) {
    const compartmentCode = String(r[21] || "").trim();
    if (!compartmentCode) continue;

    documents.push({
      // CIS (umbrella fund) info
      cisCode: String(r[0] || "").trim(),
      cisKbo: String(r[1] || "").trim(),
      cisNameFR: String(r[2] || "").trim(),
      cisNameNL: String(r[4] || "").trim(),
      cisLicense: String(r[5] || "").trim(),
      cisNationality: String(r[6] || "").trim(),
      cisLegalForm: String(r[7] || "").trim(),
      cisLegalFormFR: String(r[8] || "").trim(),
      cisLegalFormNL: String(r[9] || "").trim(),
      cisManagementType: String(r[10] || "").trim(),
      cisManagementCompanyFR: String(r[11] || "").trim(),
      cisManagementCompanyNL: String(r[12] || "").trim(),

      // Compartment (sub-fund) info
      compartmentCode,
      compartmentNameFR: String(r[22] || "").trim(),
      compartmentNameNL: String(r[23] || "").trim(),

      // Share class info
      shareClassCode: String(r[24] || "").trim(),
      shareClassNameFR: String(r[25] || "").trim(),
      shareClassNameNL: String(r[26] || "").trim(),
      shareClassType: String(r[27] || "").trim(),
      shareClassCurrency: String(r[28] || "").trim(),
      shareClassISIN: String(r[29] || "").trim(),
    });
  }

  console.log(`   ${documents.length} documents to upload`);
  return documents;
}

// -- Upload -------------------------------------------------------------------

async function uploadToFirestore(documents) {
  initializeApp({
    credential: applicationDefault(),
    projectId: "leprojetdemartin",
  });
  const db = getFirestore();

  // Clear existing collection
  const existing = await db.collection("fsma").listDocuments();
  if (existing.length > 0) {
    console.log(`   🗑️  Clearing ${existing.length} existing documents...`);
    for (let i = 0; i < existing.length; i += 500) {
      const batch = db.batch();
      const slice = existing.slice(i, i + 500);
      for (const doc of slice) batch.delete(doc);
      await batch.commit();
    }
  }

  // Write new documents
  let uploaded = 0;
  for (let i = 0; i < documents.length; i += 500) {
    const batch = db.batch();
    const slice = documents.slice(i, i + 500);
    for (const doc of slice) {
      const ref = db.collection("fsma").doc(doc.compartmentCode);
      batch.set(ref, {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    uploaded += slice.length;
    console.log(`   💾 Uploaded ${uploaded}/${documents.length}`);
  }

  console.log(`✅ Uploaded ${documents.length} FSMA compartments to Firestore`);
}

// -- Main ---------------------------------------------------------------------

async function main() {
  const documents = parseFSMA();

  // Stats
  const withShareClass = documents.filter((d) => d.shareClassCode).length;
  const withISIN = documents.filter((d) => d.shareClassISIN).length;
  const uniqueCIS = new Set(documents.map((d) => d.cisCode)).size;
  console.log(`\n── Stats ──`);
  console.log(`  Total compartments: ${documents.length}`);
  console.log(`  Unique CIS:         ${uniqueCIS}`);
  console.log(`  With share class:   ${withShareClass}`);
  console.log(`  With ISIN:          ${withISIN}`);

  console.log("\n🔥 Uploading to Firestore...");
  await uploadToFirestore(documents);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
