import bcrypt from "bcryptjs";
import express from "express";
import { z, ZodError } from "zod";
import { prisma } from "../db";
import { createMerchantSession } from "../security";

const router = express.Router();

function cookieOptions(req: express.Request) {
  const secure = req.secure || req.header("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    secure,
    maxAge: 1000 * 60 * 60 * 24 * 30
  };
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: "Validation failed", details: error.flatten() });
  console.error(error);
  return res.status(500).json({ error: "Unexpected server error" });
}

// Returns whether a merchant account has been set up for a given shopDomain.
// Public — only exposes a boolean, no sensitive data.
router.get("/account-status", async (req, res) => {
  const shopDomain = String(req.query.shopDomain ?? "");
  if (!shopDomain) return res.status(400).json({ error: "shopDomain is required" });
  const connection = await prisma.shopifyConnection.findUnique({
    where: { shopDomain },
    include: { merchant: true }
  });
  if (!connection) return res.json({ connected: false, hasAccount: false });
  res.json({ connected: true, hasAccount: Boolean(connection.merchant.contactEmail) });
});

// First-time account setup after fresh install.
// Requires the store to be connected (OAuth already completed).
router.post("/setup", async (req, res) => {
  try {
    const data = z.object({
      shopDomain: z.string().min(1),
      businessName: z.string().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(8)
    }).parse(req.body);

    const connection = await prisma.shopifyConnection.findUnique({
      where: { shopDomain: data.shopDomain },
      include: { merchant: true }
    });
    if (!connection) return res.status(404).json({ error: "Store not connected. Complete the Shopify install first." });
    if (connection.merchant.contactEmail) return res.status(409).json({ error: "Account already set up. Use the login page." });

    const existing = await prisma.merchant.findUnique({ where: { contactEmail: data.email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const merchant = await prisma.merchant.update({
      where: { id: connection.merchantId },
      data: {
        businessName: data.businessName,
        contactEmail: data.email.toLowerCase(),
        passwordHash
      }
    });

    const token = createMerchantSession({ id: merchant.id, merchantId: merchant.id });
    res.cookie("uen_merchant_session", token, cookieOptions(req));
    res.json({ merchant: { id: merchant.id, businessName: merchant.businessName, contactEmail: merchant.contactEmail } });
  } catch (error) {
    handleError(res, error);
  }
});

// Login with email + password.
router.post("/login", async (req, res) => {
  try {
    const data = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const merchant = await prisma.merchant.findUnique({ where: { contactEmail: data.email.toLowerCase() } });
    if (!merchant?.passwordHash || !(await bcrypt.compare(data.password, merchant.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = createMerchantSession({ id: merchant.id, merchantId: merchant.id });
    res.cookie("uen_merchant_session", token, cookieOptions(req));
    res.json({ merchant: { id: merchant.id, businessName: merchant.businessName, contactEmail: merchant.contactEmail } });
  } catch (error) {
    handleError(res, error);
  }
});

// Logout.
router.post("/logout", (req, res) => {
  const secure = req.secure || req.header("x-forwarded-proto") === "https";
  res.clearCookie("uen_merchant_session", { httpOnly: true, sameSite: secure ? "none" : "lax", secure });
  res.json({ ok: true });
});

// Return current merchant from session.
router.get("/me", async (req, res) => {
  if (!req.auth || req.auth.actorType !== "merchant") return res.status(401).json({ error: "Not signed in" });
  const merchant = await prisma.merchant.findUnique({
    where: { id: req.auth.merchantId },
    include: { shopifyConnections: { where: { status: "ACTIVE" }, take: 1 } }
  });
  if (!merchant) return res.status(404).json({ error: "Merchant not found" });
  res.json({
    merchant: {
      id: merchant.id,
      businessName: merchant.businessName,
      contactEmail: merchant.contactEmail,
      status: merchant.status,
      shopDomain: merchant.shopifyConnections[0]?.shopDomain ?? null
    }
  });
});

export default router;
