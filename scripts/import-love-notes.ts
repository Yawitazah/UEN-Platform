/**
 * Imports the 2022 grandfathered Love Note codes into the UEN platform.
 *
 * Joins two CSV exports:
 *  - ORDERS_CSV  (Shopify orders export): order Name (#1315) -> customer Email
 *  - KEYS_CSV    (key app export): Order Name # -> comma-separated codes + date
 * then POSTs the joined entries in batches to
 *  POST {UEN_BASE_URL}/api/exchange-hubs/{EXCHANGE_HUB_ID}/code-inventory/import-grandfathered
 *
 * Env:
 *  UEN_BASE_URL          e.g. http://localhost:3000 or https://uenite.com
 *  PLATFORM_ADMIN_TOKEN  platform admin bearer token
 *  EXCHANGE_HUB_ID       hub that owns the codes (Nubreed hub id)
 *  ORDERS_CSV            default D:\downloads\orders_export_1.csv
 *  KEYS_CSV              default D:\downloads\export_orders_1781112136.csv
 *  DRY_RUN               "1" to parse + report without uploading
 */
import "dotenv/config";
import fs from "node:fs";

const baseUrl = (process.env.UEN_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const adminToken = process.env.PLATFORM_ADMIN_TOKEN ?? "";
const exchangeHubId = process.env.EXCHANGE_HUB_ID ?? "";
const ordersCsvPath = process.env.ORDERS_CSV ?? "D:\\downloads\\orders_export_1.csv";
const keysCsvPath = process.env.KEYS_CSV ?? "D:\\downloads\\export_orders_1781112136.csv";
const dryRun = process.env.DRY_RUN === "1";

// Keep batches small enough that one request stays under Cloudflare's ~100s
// origin timeout (each entry costs a couple of DB round trips server-side).
const BATCH_SIZE = Math.min(500, Math.max(1, parseInt(process.env.BATCH_SIZE ?? "", 10) || 100));

type Entry = { code: string; email: string | null; purchasedAt?: string; orderName?: string };

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function columnIndex(header: string[], name: string) {
  const index = header.findIndex((column) => column.trim().toLowerCase() === name.toLowerCase());
  if (index === -1) throw new Error(`Column "${name}" not found in header: ${header.join(", ")}`);
  return index;
}

function main(): { entries: Entry[]; report: Record<string, unknown> } {
  // Order name -> email (first row of each order carries the email).
  const ordersRows = parseCsv(fs.readFileSync(ordersCsvPath, "utf8"));
  const ordersHeader = ordersRows[0];
  const nameIdx = columnIndex(ordersHeader, "Name");
  const emailIdx = columnIndex(ordersHeader, "Email");
  const emailByOrder = new Map<string, string>();
  for (const row of ordersRows.slice(1)) {
    const orderName = (row[nameIdx] ?? "").replace(/^#/, "").trim();
    const email = (row[emailIdx] ?? "").trim().toLowerCase();
    if (orderName && email && !emailByOrder.has(orderName)) emailByOrder.set(orderName, email);
  }

  // Order name -> codes.
  const keysRows = parseCsv(fs.readFileSync(keysCsvPath, "utf8"));
  const keysHeader = keysRows[0];
  const orderNameIdx = columnIndex(keysHeader, "Order Name #");
  const keyIdx = columnIndex(keysHeader, "Key");
  const dateIdx = columnIndex(keysHeader, "Date");

  const entries: Entry[] = [];
  const seenCodes = new Set<string>();
  const duplicateCodes: string[] = [];
  const unmatchedOrders: string[] = [];
  const matchedEmails = new Set<string>();

  for (const row of keysRows.slice(1)) {
    const orderName = (row[orderNameIdx] ?? "").replace(/^#/, "").trim();
    const email = emailByOrder.get(orderName) ?? null;
    if (!email && orderName) unmatchedOrders.push(orderName);
    if (email) matchedEmails.add(email);

    const rawDate = (row[dateIdx] ?? "").trim();
    // "2022-08-21 21:40:52" -> ISO (treated as UTC; used only as created-date metadata)
    const purchasedAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate) ? `${rawDate.replace(" ", "T")}Z` : undefined;

    for (const rawCode of (row[keyIdx] ?? "").split(",")) {
      const code = rawCode.trim();
      if (!code) continue;
      if (!/^[A-Za-z0-9]+$/.test(code)) {
        console.warn(`Skipping malformed code "${code}" on order ${orderName}`);
        continue;
      }
      const upper = code.toUpperCase();
      if (seenCodes.has(upper)) {
        duplicateCodes.push(code);
        continue;
      }
      seenCodes.add(upper);
      entries.push({ code, email, ...(purchasedAt ? { purchasedAt } : {}), orderName });
    }
  }

  const report = {
    totalCodes: entries.length,
    reservedToEmail: entries.filter((entry) => entry.email).length,
    unreserved: entries.filter((entry) => !entry.email).length,
    distinctEmails: matchedEmails.size,
    unmatchedOrders,
    duplicateCodes
  };
  return { entries, report };
}

async function upload(entries: Entry[]) {
  if (!adminToken) throw new Error("PLATFORM_ADMIN_TOKEN is required");
  if (!exchangeHubId) throw new Error("EXCHANGE_HUB_ID is required");

  const totals = { created: 0, updated: 0, skippedIssued: 0, conflicts: 0 };
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const response = await fetch(`${baseUrl}/api/exchange-hubs/${exchangeHubId}/code-inventory/import-grandfathered`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ campaignId: "LOVE-NOTES-2022", entries: batch })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Batch at offset ${offset} failed with ${response.status}: ${body}`);
    }
    const result = (await response.json()) as typeof totals;
    totals.created += result.created;
    totals.updated += result.updated;
    totals.skippedIssued += result.skippedIssued;
    totals.conflicts += result.conflicts;
    console.log(`Batch ${offset / BATCH_SIZE + 1}/${Math.ceil(entries.length / BATCH_SIZE)}:`, result);
  }
  return totals;
}

(async () => {
  const { entries, report } = main();
  console.log(JSON.stringify(report, null, 2));
  if (dryRun) {
    console.log("DRY_RUN=1 — nothing uploaded.");
    return;
  }
  const totals = await upload(entries);
  console.log("Import complete:", totals);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
