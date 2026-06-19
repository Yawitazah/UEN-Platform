import { PrismaClient } from "@prisma/client";

// Bound the Prisma connection pool so the app can NEVER exhaust the database's
// connection limit. The Supabase session pooler allows only a small fixed
// number of connections; without an explicit cap, Prisma's default pool plus
// concurrent heavy queries can saturate the database, queue every request
// (response times climb until the process falls over), and take the site down
// — that was the root cause of the 2026-06-17 outage.
//
//  - connection_limit bounds how many connections this replica opens.
//  - pool_timeout makes a query fail fast with a clear error instead of
//    hanging indefinitely when the pool is momentarily busy, so one slow path
//    can't stall the whole server.
//  - connect_timeout caps how long establishing a new connection can block.
//
// All three are overridable via env vars so the limits can be tuned (e.g.
// after a database tier bump) without a code change.
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // Only Postgres understands these params; leave SQLite (local dev) alone.
    if (!url.protocol.startsWith("postgres")) return raw;
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", process.env.DB_CONNECTION_LIMIT ?? "10");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", process.env.DB_POOL_TIMEOUT ?? "20");
    }
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", process.env.DB_CONNECT_TIMEOUT ?? "15");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const databaseUrl = buildDatabaseUrl();

export const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : new PrismaClient();
