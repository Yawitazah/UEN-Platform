/**
 * Pre-loads holder identities (name + phone keyed by email) from the Shopify
 * orders export, so legacy Love Note purchasers see their real name pre-filled
 * in the dashboard and only have to verify.
 *
 * POSTs to {UEN_BASE_URL}/api/exchange-hubs/{EXCHANGE_HUB_ID}/holders/preload
 *
 * Env: UEN_BASE_URL, PLATFORM_ADMIN_TOKEN, EXCHANGE_HUB_ID,
 *      ORDERS_CSV (default D:\downloads\orders_export_1.csv), DRY_RUN
 */
import "dotenv/config";
import fs from "node:fs";

const baseUrl = (process.env.UEN_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const adminToken = process.env.PLATFORM_ADMIN_TOKEN ?? "";
const exchangeHubId = process.env.EXCHANGE_HUB_ID ?? "";
const ordersCsvPath = process.env.ORDERS_CSV ?? "D:\\downloads\\orders_export_1.csv";
const dryRun = process.env.DRY_RUN === "1";
const BATCH_SIZE = 200;

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

function columnIndex(header: string[], name: string) {
  const index = header.findIndex((column) => column.trim().toLowerCase() === name.toLowerCase());
  if (index === -1) throw new Error(`Column "${name}" not found`);
  return index;
}

type Entry = { email: string; firstName?: string; lastName?: string; phone?: string };

function build(): Entry[] {
  const rows = parseCsv(fs.readFileSync(ordersCsvPath, "utf8"));
  const header = rows[0];
  const emailIdx = columnIndex(header, "Email");
  const billNameIdx = columnIndex(header, "Billing Name");
  const billPhoneIdx = columnIndex(header, "Billing Phone");
  const shipNameIdx = columnIndex(header, "Shipping Name");
  const shipPhoneIdx = columnIndex(header, "Shipping Phone");

  // Newest order wins per email (rows are typically newest-first; keep first seen).
  const byEmail = new Map<string, Entry>();
  for (const row of rows.slice(1)) {
    const email = (row[emailIdx] ?? "").trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    const name = (row[billNameIdx] ?? "").trim() || (row[shipNameIdx] ?? "").trim();
    const phone = (row[billPhoneIdx] ?? "").trim() || (row[shipPhoneIdx] ?? "").trim();
    if (!name && !phone) continue;
    const parts = name.split(/\s+/).filter(Boolean);
    byEmail.set(email, {
      email,
      ...(parts.length ? { firstName: parts[0], lastName: parts.slice(1).join(" ") } : {}),
      ...(phone ? { phone } : {})
    });
  }
  return [...byEmail.values()];
}

(async () => {
  const entries = build();
  const withName = entries.filter((e) => e.firstName).length;
  const withPhone = entries.filter((e) => e.phone).length;
  console.log(JSON.stringify({ totalIdentities: entries.length, withName, withPhone }, null, 2));
  if (dryRun) { console.log("DRY_RUN=1 — nothing uploaded."); return; }
  if (!adminToken || !exchangeHubId) throw new Error("PLATFORM_ADMIN_TOKEN and EXCHANGE_HUB_ID are required");

  let created = 0;
  let updated = 0;
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const response = await fetch(`${baseUrl}/api/exchange-hubs/${exchangeHubId}/holders/preload`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ entries: batch })
    });
    if (!response.ok) throw new Error(`Batch at ${offset} failed with ${response.status}: ${await response.text()}`);
    const result = (await response.json()) as { created: number; updated: number };
    created += result.created;
    updated += result.updated;
    console.log(`Batch ${offset / BATCH_SIZE + 1}/${Math.ceil(entries.length / BATCH_SIZE)}:`, result);
  }
  console.log("Preload complete:", { created, updated });
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
