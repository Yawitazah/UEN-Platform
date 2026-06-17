import type { Request, Response } from "express";

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

// Seconds until `key` is allowed again (0 if not currently limited). Reads the
// recorded hits WITHOUT adding a new one — call it right after loginRateLimited
// has already blocked, to tell the user how long to wait.
export function retryAfterSeconds(key: string, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const hits = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length <= max) return 0;
  const oldest = hits[0];
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

// Standard 429 response with a human "try again in N minutes" message plus a
// Retry-After header, so every rate-limited endpoint speaks the same way.
export function tooManyAttempts(res: Response, key: string, max = 5, windowMs = 10 * 60 * 1000) {
  const secs = retryAfterSeconds(key, max, windowMs);
  const mins = Math.max(1, Math.ceil(secs / 60));
  res.setHeader("Retry-After", String(secs));
  return res.status(429).json({
    error: `Too many attempts. For your security, please try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    retryAfterSec: secs
  });
}

// Builds the public base URL (https://host) from the incoming request. With
// `trust proxy` enabled this honours Railway's X-Forwarded-Proto/Host headers,
// so emailed links point at the real public origin and not localhost.
export function publicBaseUrl(req: Request) {
  return `${req.protocol}://${req.get("host")}`;
}
