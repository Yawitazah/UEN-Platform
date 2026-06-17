import type { Request } from "express";

// Lightweight in-memory rate limiter shared by the auth + holder sign-in
// endpoints. Keyed by an arbitrary string (usually IP, or IP+email): caps how
// often a sensitive action (sign-in attempt, reset email) can fire so the
// endpoint can't be brute-forced or used to spam an inbox / probe which emails
// have accounts. Single instance only, which matches the current Railway
// deployment — the window resets on each deploy, which is acceptable here.
const attempts = new Map<string, number[]>();

export function loginRateLimited(key: string, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const hits = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  attempts.set(key, hits);
  return hits.length > max;
}

// Builds the public base URL (https://host) from the incoming request. With
// `trust proxy` enabled this honours Railway's X-Forwarded-Proto/Host headers,
// so emailed links point at the real public origin and not localhost.
export function publicBaseUrl(req: Request) {
  return `${req.protocol}://${req.get("host")}`;
}
