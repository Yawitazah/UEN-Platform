import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { AdminRole, type AdminRoleValue } from "./constants";
import { prisma } from "./db";

export type AuthContext = {
  actorId?: string;
  actorType: "admin" | "merchant" | "internal";
  role: AdminRoleValue;
  merchantId?: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearer(req: Request) {
  const header = req.header("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7) : undefined;
}

function sessionCookie(req: Request) {
  return req.cookies?.uen_session;
}

export function createAdminSession(input: { id: string; email: string; role: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      id: input.id,
      email: input.email,
      role: input.role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    })
  ).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSession(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { id: string; email: string; role: AdminRoleValue; exp: number };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

// One-time-style sign-in token emailed to a holder as a magic link. Stateless
// and signed with the session secret — no DB row needed. It carries the email
// and hub it was issued for and expires after 15 minutes, so possession of the
// link (i.e. access to the inbox) is what proves identity.
export function createHolderLoginToken(input: { email: string; exchangeHubId: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      email: input.email,
      exchangeHubId: input.exchangeHubId,
      kind: "holder-login",
      exp: Date.now() + 1000 * 60 * 15
    })
  ).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyHolderLoginToken(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email: string;
      exchangeHubId: string;
      kind: string;
      exp: number;
    };
    if (parsed.kind !== "holder-login") return null;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.email || !parsed.exchangeHubId) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Confirms a holder's NEW email address before switching it. Signed and
// time-limited like the sign-in token, bound to the holder id + new email, so
// the email only changes once the link sent to that new address is clicked.
export function createEmailChangeToken(input: { holderId: string; newEmail: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      holderId: input.holderId,
      newEmail: input.newEmail,
      kind: "holder-email-change",
      exp: Date.now() + 1000 * 60 * 30
    })
  ).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyEmailChangeToken(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      holderId: string;
      newEmail: string;
      kind: string;
      exp: number;
    };
    if (parsed.kind !== "holder-email-change") return null;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.holderId || !parsed.newEmail) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createMerchantSession(input: { id: string; merchantId: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      id: input.id,
      merchantId: input.merchantId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30
    })
  ).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

// Verifies a Shopify App Bridge session token (a JWT signed with the app
// secret) and returns the shop domain it was minted for. These tokens are how
// the embedded merchant portal authenticates: browsers increasingly refuse
// third-party cookies inside the admin iframe, so cookie sessions cannot be
// relied on there — and Shopify's app review explicitly checks for them.
export function verifyShopifyIdToken(token: string): string | null {
  try {
    if (!config.shopifyApiSecret || !config.shopifyApiKey) return null;
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const expected = createHmac("sha256", config.shopifyApiSecret).update(`${headerB64}.${payloadB64}`).digest("base64url");
    if (!safeEqual(signatureB64, expected)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      exp?: number;
      aud?: string;
      dest?: string;
    };
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.aud !== config.shopifyApiKey) return null;
    const shop = String(payload.dest ?? "").replace(/^https:\/\//, "").trim().toLowerCase();
    return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
  } catch {
    return null;
  }
}

export function verifyMerchantSession(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { id: string; merchantId: string; exp: number };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const merchantSession = verifyMerchantSession(req.cookies?.uen_merchant_session);
  const adminSession = verifyAdminSession(sessionCookie(req));

  // A leftover merchant-portal cookie must never block admin access. Both
  // sessions can legitimately coexist in one browser (e.g. the platform owner
  // who has also signed into the merchant portal). Treat the request as a
  // merchant only when it targets the merchant-portal API (/api/merchant/...)
  // or when there is no admin session to fall back on. Otherwise the admin
  // session always wins, so the admin dashboard never gets bounced into a login
  // loop by a stale merchant cookie. Note the trailing slash: "/api/merchant/"
  // intentionally excludes the admin "/api/merchants/..." management routes.
  const isMerchantPortalRoute = req.path.startsWith("/api/merchant/");
  if (merchantSession && (isMerchantPortalRoute || !adminSession)) {
    req.auth = { actorId: merchantSession.id, actorType: "merchant", role: AdminRole.MERCHANT, merchantId: merchantSession.merchantId };
    return next();
  }

  if (adminSession) {
    req.auth = { actorId: adminSession.id, actorType: "admin", role: adminSession.role };
    return next();
  }

  const token = bearer(req);
  if (!token) return next();

  if (safeEqual(token, config.adminToken)) {
    req.auth = { actorType: "admin", role: AdminRole.SUPER_ADMIN };
    return next();
  }

  if (safeEqual(token, config.internalApiKey)) {
    req.auth = { actorType: "internal", role: AdminRole.SUPER_ADMIN };
    return next();
  }

  // App Bridge session token from the embedded merchant portal: resolve the
  // shop it was signed for to that shop's merchant. JWTs are never API keys,
  // so skip the key lookup either way.
  if (token.split(".").length === 3) {
    const shop = verifyShopifyIdToken(token);
    if (shop) {
      const connection = await prisma.shopifyConnection.findUnique({ where: { shopDomain: shop } });
      if (connection) {
        req.auth = { actorId: connection.id, actorType: "merchant", role: AdminRole.MERCHANT, merchantId: connection.merchantId };
      }
    }
    return next();
  }

  const apiKey = await prisma.merchantApiKey.findUnique({
    where: { keyHash: hashSecret(token) },
    include: { merchant: true }
  });

  if (apiKey && (!apiKey.expiresAt || apiKey.expiresAt > new Date())) {
    await prisma.merchantApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });
    req.auth = {
      actorId: apiKey.id,
      actorType: "merchant",
      role: AdminRole.MERCHANT,
      merchantId: apiKey.merchantId
    };
  }

  next();
}

export function requireRole(roles: AdminRoleValue[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  };
}

export function requireMerchantAccess(paramName = "merchantId") {
  return (req: Request, res: Response, next: NextFunction) => {
    const merchantId = req.params[paramName] ?? req.body.merchantId;
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    if (req.auth.role !== AdminRole.MERCHANT) return next();
    if (req.auth.merchantId !== merchantId) {
      return res.status(403).json({ error: "Merchant token cannot access this merchant" });
    }
    return next();
  };
}
