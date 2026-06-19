import { PrismaClient } from "@prisma/client";

// Size the Prisma connection pool correctly for this always-on server.
//
// ROOT CAUSE of the 2026-06-17 outage: the production DATABASE_URL was set to
// `connection_limit=1` (a value that only makes sense for short-lived
// serverless/edge functions, not a long-running server). That throttled the
// ENTIRE app to a single database connection, so any two concurrent
// requests — a dashboard load plus a sync, say — serialized through one
// connection. Under the slightest concurrency, queries queued, response times
// climbed from seconds to ~30s, Prisma threw pool-timeout errors, they piled
// up, and the process fell over.
//
// The app talks to Supabase through the transaction pooler (pgbouncer), which
// multiplexes many client connections onto a bounded backend pool, so a
// modest pool here is safe and gives real concurrency. We OVERRIDE whatever
// connection_limit the URL carries (to neutralize that harmful =1) and pin it
// to DB_CONNECTION_LIMIT. pool_timeout / connect_timeout make a busy pool fail
// fast with a clear error instead of hanging. All tunable via env, no code
// change needed.
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // Only Postgres understands these params; leave SQLite (local dev) alone.
    if (!url.protocol.startsWith("postgres")) return raw;
    // Override, not set-if-absent: the URL's connection_limit=1 is the bug.
    url.searchParams.set("connection_limit", process.env.DB_CONNECTION_LIMIT ?? "10");
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
