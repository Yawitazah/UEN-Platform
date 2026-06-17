import bcrypt from "bcryptjs";
import express from "express";
import { z, ZodError } from "zod";
import { prisma } from "../db";
import { createMerchantSession } from "../security";
import { passwordRule } from "../validators";
import { loginRateLimited } from "../util/http";

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
      password: passwordRule
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
    const email = data.email.toLowerCase();
    if (loginRateLimited(`mlogin:${req.ip}:${email}`)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }
    const merchant = await prisma.merchant.findUnique({ where: { contactEmail: email } });
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

// Return current merchant from session — includes hub status so the portal
// knows which UI to show without a separate fetch.
router.get("/me", async (req, res) => {
  if (!req.auth || req.auth.actorType !== "merchant") return res.status(401).json({ error: "Not signed in" });
  const merchant = await prisma.merchant.findUnique({
    where: { id: req.auth.merchantId },
    include: {
      shopifyConnections: { where: { status: "ACTIVE" }, take: 1 },
      linkedExchangeHub: true
    }
  });
  if (!merchant) return res.status(404).json({ error: "Merchant not found" });

  // Check if they have a pending hub application
  const pendingHub = merchant.isExchangeHub
    ? null
    : await prisma.exchangeHub.findFirst({
        where: { applicantMerchantId: merchant.id, status: "PENDING_REVIEW" }
      });

  res.json({
    merchant: {
      id: merchant.id,
      businessName: merchant.businessName,
      contactEmail: merchant.contactEmail,
      status: merchant.status,
      shopDomain: merchant.shopifyConnections[0]?.shopDomain ?? null,
      isExchangeHub: merchant.isExchangeHub,
      hubStatus: merchant.isExchangeHub ? "APPROVED" : pendingHub ? "PENDING" : "NONE",
      hub: merchant.linkedExchangeHub
        ? { id: merchant.linkedExchangeHub.id, displayName: merchant.linkedExchangeHub.displayName }
        : null
    }
  });
});

// Update the signed-in merchant's own account details.
router.patch("/me", async (req, res) => {
  try {
    if (!req.auth || req.auth.actorType !== "merchant") return res.status(401).json({ error: "Not signed in" });
    const data = z.object({
      businessName: z.string().min(2).max(120).optional(),
      contactEmail: z.string().email().optional()
    }).parse(req.body);
    if (!data.businessName && !data.contactEmail) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    const updates: Record<string, unknown> = {};
    if (data.businessName) updates.businessName = data.businessName.trim();
    if (data.contactEmail) updates.contactEmail = data.contactEmail.trim().toLowerCase();
    try {
      const merchant = await prisma.merchant.update({ where: { id: req.auth.merchantId }, data: updates });
      res.json({ businessName: merchant.businessName, contactEmail: merchant.contactEmail });
    } catch (updateError) {
      if ((updateError as { code?: string }).code === "P2002") {
        return res.status(409).json({ error: "That email is already used by another account" });
      }
      throw updateError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Enter a valid name and email" });
    console.error(error);
    res.status(500).json({ error: "Could not update account" });
  }
});

// Submit an Exchange Hub application from a logged-in merchant.
router.post("/apply-hub", async (req, res) => {
  try {
    if (!req.auth || req.auth.actorType !== "merchant") return res.status(401).json({ error: "Not signed in" });
    const data = z.object({
      displayName: z.string().min(2).max(120),
      hubType: z.string().min(2).max(60),
      description: z.string().max(800).optional()
    }).parse(req.body);

    const merchant = await prisma.merchant.findUnique({ where: { id: req.auth.merchantId } });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });
    if (merchant.isExchangeHub) return res.status(409).json({ error: "Already an Exchange Hub" });

    const existing = await prisma.exchangeHub.findFirst({ where: { applicantMerchantId: merchant.id, status: "PENDING_REVIEW" } });
    if (existing) return res.status(409).json({ error: "Application already submitted and under review" });

    const slug = data.displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const hub = await prisma.exchangeHub.create({
      data: {
        name: slug,
        displayName: data.displayName.trim(),
        hubType: data.hubType.toLowerCase().trim(),
        status: "PENDING_REVIEW",
        billingStatus: "PENDING",
        uenValue: 1.00,
        applicantMerchantId: merchant.id
      }
    });

    res.status(201).json({ id: hub.id, displayName: hub.displayName, status: hub.status });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
