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
  if (merchantSession) {
    req.auth = { actorId: merchantSession.id, actorType: "merchant", role: AdminRole.MERCHANT, merchantId: merchantSession.merchantId };
    return next();
  }

  const token = bearer(req);
  const session = verifyAdminSession(sessionCookie(req));
  if (session) {
    req.auth = { actorId: session.id, actorType: "admin", role: session.role };
    return next();
  }

  if (!token) return next();

  if (safeEqual(token, config.adminToken)) {
    req.auth = { actorType: "admin", role: AdminRole.SUPER_ADMIN };
    return next();
  }

  if (safeEqual(token, config.internalApiKey)) {
    req.auth = { actorType: "internal", role: AdminRole.SUPER_ADMIN };
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
