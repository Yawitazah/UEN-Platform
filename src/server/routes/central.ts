import type { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { z, ZodError } from "zod";
import { audit } from "../audit";
import { config } from "../config";
import { AdminRole, AuditAction, HubStatus, UenStatus } from "../constants";
import { prisma } from "../db";
import bcrypt from "bcryptjs";
import { createMerchantSession, createEmailVerifyToken, hashSecret, requireMerchantAccess, requireRole } from "../security";
import { publicBaseUrl } from "../util/http";
import { sendEmailVerifyEmail, sendLoveNoteEmail } from "../services/mailer";
import { syncCodesToGroupedShopifyDiscount, syncGrandfatheredCodesToMerchant, syncNewUensToEligibleShopifyStores } from "../services/sync";
import { getValidUensForMerchant, validateUenForMerchant } from "../services/uens";
import {
  createAccessRuleSchema,
  bulkGenerateCodesSchema,
  bulkImportCodesSchema,
  importGrandfatheredCodesSchema,
  createHolderSchema,
  createHubSchema,
  createIssuanceProductSchema,
  createMerchantSchema,
  createOfferSchema,
  merchantOnboardingSchema,
  createUenSchema,
  passwordRule,
  updateHubSchema,
  validateUenSchema
} from "../validators";

const router: Router = express.Router();
const adminRoles = [AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.SUPPORT];
const writeRoles = [AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS];
const siteContentSchema = z.object({ value: z.unknown() });
const siteMediaSchema = z.object({
  filename: z.string().min(1).max(160),
  dataUrl: z.string().startsWith("data:"),
  mediaType: z.enum(["image", "video"]).default("image")
});
type SiteContentRow = { id: string; key: string; value: string; createdAt?: Date; updatedAt?: Date };

function param(req: express.Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: error.flatten() });
  }
  console.error(error);
  return res.status(500).json({ error: "Unexpected server error" });
}

async function generatedCode(prefix = "") {
  const normalizedPrefix = prefix.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const max = 9_999_999;
  const existingCount = await prisma.universalExchangeNote.count();
  if (existingCount >= max) {
    throw new Error("All 7-digit UEN combinations have been issued");
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const number = Math.floor(Math.random() * max) + 1;
    const code = `${normalizedPrefix}${number}UEN`;
    const [existingNote, existingInventory] = await Promise.all([
      prisma.universalExchangeNote.findUnique({ where: { code } }),
      prisma.uenCodeInventory.findUnique({ where: { code } })
    ]);
    if (!existingNote && !existingInventory) return code;
  }

  throw new Error("Could not generate a unique UEN code");
}

// Short, human-shareable code embedded in gift links (e.g. ?gift=GIFT9A3F1B2C).
async function generatedReferralCode() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = `GIFT${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const existing = await prisma.referral.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code");
}

const createReferralSchema = z.object({
  referrerEmail: z.string().email(),
  referrerName: z.string().trim().max(120).optional(),
  assetKey: z.string().trim().max(60).optional()
});

const convertReferralSchema = z.object({
  referredEmail: z.string().email()
});

function publicConnection(connection: { accessToken: string; [key: string]: unknown }) {
  const { accessToken: _accessToken, ...safe } = connection;
  return safe;
}

function appOrigin(req: express.Request) {
  return (config.shopifyAppUrl || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function absoluteAppUrl(req: express.Request, targetPath: string) {
  return `${appOrigin(req)}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`;
}

async function syncInventoryCodesToMerchantStores(exchangeHubId: string, inventoryCodes: Array<{ id: string; code: string }>) {
  const merchants = await prisma.merchant.findMany({
    where: {
      status: "ACTIVE",
      accessRules: { some: { exchangeHubId, status: "ACTIVE" } },
      shopifyConnections: { some: { status: "ACTIVE" } }
    },
    include: {
      offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
      shopifyConnections: { where: { status: "ACTIVE" } }
    }
  });

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const merchant of merchants) {
    const offer = merchant.offers[0];
    if (!offer || (offer.discountType !== "PERCENTAGE" && offer.discountType !== "FIXED_AMOUNT")) {
      skipped += inventoryCodes.length;
      continue;
    }

    for (const connection of merchant.shopifyConnections) {
      const groupedSync = await syncCodesToGroupedShopifyDiscount({
        connection: {
          merchantId: merchant.id,
          shopDomain: connection.shopDomain,
          accessToken: connection.accessToken,
          merchantName: merchant.businessName
        },
        offer,
        codes: inventoryCodes.map((inventoryCode) => ({ id: inventoryCode.id, code: inventoryCode.code, kind: "inventory" as const }))
      });
      synced += groupedSync.created;
      skipped += groupedSync.skipped;
      errors += groupedSync.errors;
    }
  }

  return { synced, skipped, errors, merchantStores: merchants.flatMap((merchant) => merchant.shopifyConnections).length };
}

router.get("/admin/dashboard", requireRole(adminRoles), async (_req, res) => {
  const [exchangeHubs, holders, uens, merchants, syncedNotes, syncLogs] = await Promise.all([
    prisma.exchangeHub.count(),
    prisma.holder.count(),
    prisma.universalExchangeNote.count(),
    prisma.merchant.count(),
    prisma.shopifySyncedNote.count(),
    prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { merchant: true } })
  ]);

  res.json({ counts: { exchangeHubs, holders, uens, merchants, syncedNotes }, recentSyncLogs: syncLogs });
});

router.get("/public/site-content", async (_req, res) => {
  let rows: SiteContentRow[] = [];
  try {
    rows = await prisma.$queryRaw<SiteContentRow[]>`SELECT * FROM "SiteContent"`;
  } catch (error) {
    if (error instanceof Error && error.message.includes("SiteContent")) return res.json({});
    throw error;
  }
  const content = rows.reduce((acc: Record<string, unknown>, row: { key: string; value: string }) => {
    try {
      acc[row.key] = JSON.parse(row.value);
    } catch {
      acc[row.key] = row.value;
    }
    return acc;
  }, {});
  res.json(content);
});

router.get("/site-content", requireRole(adminRoles), async (_req, res) => {
  const rows = await prisma.$queryRaw<SiteContentRow[]>`SELECT * FROM "SiteContent" ORDER BY "key" ASC`;
  res.json(rows.map((row: { key: string; value: string }) => ({ ...row, value: JSON.parse(row.value) })));
});

router.patch("/site-content/:key", requireRole(writeRoles), async (req, res) => {
  try {
    const key = param(req, "key");
    const data = siteContentSchema.parse(req.body);
    const value = JSON.stringify(data.value);
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "SiteContent" ("id", "key", "value", "createdAt", "updatedAt")
      VALUES (${id}, ${key}, ${value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE SET "value" = ${value}, "updatedAt" = CURRENT_TIMESTAMP
    `;
    const [saved] = await prisma.$queryRaw<SiteContentRow[]>`SELECT * FROM "SiteContent" WHERE "key" = ${key} LIMIT 1`;
    await audit({ action: AuditAction.MERCHANT_OFFER_CHANGED, entityType: "SiteContent", entityId: saved.id, message: `Updated ${key} public content` });
    res.json({ ...saved, value: JSON.parse(saved.value) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/site-media", requireRole(writeRoles), async (req, res) => {
  try {
    const data = siteMediaSchema.parse(req.body);
    const [header, base64] = data.dataUrl.split(",");
    if (!base64 || !header.includes(";base64")) return res.status(400).json({ error: "Invalid media upload" });
    if (data.mediaType === "image" && !header.startsWith("data:image/")) return res.status(400).json({ error: "Only image uploads are allowed here" });
    if (data.mediaType === "video" && !header.startsWith("data:video/")) return res.status(400).json({ error: "Only video uploads are allowed here" });
    const safeName = data.filename.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName}`;
    const uploadDir = path.resolve(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), Buffer.from(base64, "base64"));
    res.json({ url: `/uploads/${filename}`, mediaType: data.mediaType, filename });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/exchange-hubs", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.exchangeHub.findMany({ orderBy: { createdAt: "desc" } }));
});

router.get("/public/shopify-config", (_req, res) => {
  res.json({ apiKey: config.shopifyApiKey || "" });
});

router.get("/public/exchange-hubs", async (_req, res) => {
  const hubs = await prisma.exchangeHub.findMany({
    where: { status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, hubType: true, logoUrl: true, brandColor: true }
  });
  res.json(hubs);
});

// POST /api/exchange-hub/apply — public self-registration for new Exchange Hubs
router.post("/exchange-hub/apply", async (req, res) => {
  try {
    const { displayName, hubType, contactName, contactEmail, website, description } = req.body as {
      displayName?: string;
      hubType?: string;
      contactName?: string;
      contactEmail?: string;
      website?: string;
      description?: string;
    };

    if (!displayName || !contactEmail) {
      return res.status(400).json({ error: "Organization name and contact email are required" });
    }

    const normalizedEmail = contactEmail.trim().toLowerCase();
    const slug = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const hub = await prisma.exchangeHub.create({
      data: {
        name: slug,
        displayName: displayName.trim(),
        hubType: (hubType ?? "creator").toLowerCase().trim(),
        status: "PENDING_REVIEW",
        billingStatus: "PENDING",
        uenValue: 1.00
      }
    });

    await prisma.auditLog.create({
      data: {
        action: "EXCHANGE_HUB_APPLICATION",
        actorType: "public",
        entityType: "ExchangeHub",
        entityId: hub.id,
        message: `New hub application: ${displayName} (${normalizedEmail})`,
        metadata: JSON.stringify({ contactName, contactEmail: normalizedEmail, website, description })
      }
    });

    res.status(201).json({
      id: hub.id,
      displayName: hub.displayName,
      message: "Your application has been received. Our team will review it and reach out to you within a few business days."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not submit application" });
  }
});

// POST /api/exchange-hub/register — public self-registration that creates a merchant
// account immediately so they can log in, plus submits a hub application for review.
router.post("/exchange-hub/register", async (req, res) => {
  try {
    const data = z.object({
      displayName: z.string().min(2).max(120),
      hubType: z.string().min(2).max(60),
      contactName: z.string().max(120).optional(),
      contactEmail: z.string().email(),
      website: z.string().max(300).optional(),
      description: z.string().max(800).optional(),
      password: passwordRule
    }).parse(req.body);

    const normalizedEmail = data.contactEmail.toLowerCase();

    const existing = await prisma.merchant.findUnique({ where: { contactEmail: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists. Sign in instead." });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const merchant = await prisma.merchant.create({
      data: {
        businessName: data.displayName.trim(),
        platformType: "SHOPIFY",
        status: "ACTIVE",
        contactEmail: normalizedEmail,
        passwordHash,
        emailVerified: false
      }
    });

    // Send a "confirm your email" link. Non-blocking — the account is usable
    // immediately; the portal just shows a reminder until it's confirmed.
    try {
      const verifyToken = createEmailVerifyToken({ merchantId: merchant.id, email: normalizedEmail });
      await sendEmailVerifyEmail(normalizedEmail, `${publicBaseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`);
    } catch (mailError) {
      console.error("[hub-register] verification email failed", mailError);
    }

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

    await prisma.auditLog.create({
      data: {
        action: "EXCHANGE_HUB_APPLICATION",
        actorType: "public",
        entityType: "ExchangeHub",
        entityId: hub.id,
        message: `Self-registered hub application: ${data.displayName} (${normalizedEmail})`,
        metadata: JSON.stringify({ contactName: data.contactName, website: data.website, description: data.description })
      }
    });

    const token = createMerchantSession({ id: merchant.id, merchantId: merchant.id });
    const secure = req.secure || req.header("x-forwarded-proto") === "https";
    res.cookie("uen_merchant_session", token, {
      httpOnly: true,
      sameSite: (secure ? "none" : "lax") as "none" | "lax",
      secure,
      maxAge: 1000 * 60 * 60 * 24 * 30
    });

    res.status(201).json({
      merchant: { id: merchant.id, businessName: merchant.businessName },
      hub: { id: hub.id, displayName: hub.displayName },
      message: "Account created. Your Exchange Hub application is under review."
    });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/merchant-onboarding/register", async (req, res) => {
  try {
    const data = merchantOnboardingSchema.parse(req.body);
    const token = crypto.randomBytes(24).toString("base64url");
    const merchant = await prisma.merchant.create({
      data: {
        businessName: data.businessName,
        platformType: "SHOPIFY",
        status: "PAUSED"
      }
    });

    if (data.requestedExchangeHubId) {
      await prisma.merchantAccessRule.upsert({
        where: { merchantId_exchangeHubId: { merchantId: merchant.id, exchangeHubId: data.requestedExchangeHubId } },
        update: { status: "ACTIVE" },
        create: { merchantId: merchant.id, exchangeHubId: data.requestedExchangeHubId, status: "ACTIVE" }
      });
    }

    await prisma.merchantOffer.create({
      data: {
        merchantId: merchant.id,
        discountType: "PERCENTAGE",
        discountValue: 15,
        usageLimitPerNote: 1,
        status: "ACTIVE"
      }
    });

    const onboarding = await prisma.merchantOnboarding.create({
      data: {
        merchantId: merchant.id,
        token,
        businessName: data.businessName,
        contactName: data.contactName || undefined,
        contactEmail: data.contactEmail.toLowerCase(),
        shopDomain: data.shopDomain.toLowerCase(),
        requestedExchangeHubId: data.requestedExchangeHubId || undefined
      }
    });

    const installPath = `/merchant/install/${token}`;
    const shopifyInstallPath = `/shopify/auth?shop=${encodeURIComponent(onboarding.shopDomain)}&onboardingToken=${encodeURIComponent(onboarding.token)}`;

    res.status(201).json({
      token,
      installPath,
      installUrl: absoluteAppUrl(req, installPath),
      shopifyInstallUrl: absoluteAppUrl(req, shopifyInstallPath),
      onboarding: {
        id: onboarding.id,
        businessName: onboarding.businessName,
        shopDomain: onboarding.shopDomain,
        status: onboarding.status
      }
    });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/merchant-onboarding/:token", async (req, res) => {
  const onboarding = await prisma.merchantOnboarding.findUnique({
    where: { token: param(req, "token") },
    include: { merchant: { include: { offers: { orderBy: { createdAt: "desc" }, take: 1 }, accessRules: { include: { exchangeHub: true } } } } }
  });
  if (!onboarding) return res.status(404).json({ error: "Merchant onboarding link not found" });
  res.json({
    token: onboarding.token,
    businessName: onboarding.businessName,
    contactEmail: onboarding.contactEmail,
    shopDomain: onboarding.shopDomain,
    status: onboarding.status,
    installedAt: onboarding.installedAt,
    merchantStatus: onboarding.merchant.status,
    offer: onboarding.merchant.offers[0] ?? null,
    exchangeHubs: onboarding.merchant.accessRules.map((rule) => rule.exchangeHub.displayName),
    installUrl: absoluteAppUrl(
      req,
      `/shopify/auth?shop=${encodeURIComponent(onboarding.shopDomain)}&onboardingToken=${encodeURIComponent(onboarding.token)}`
    )
  });
});

router.post("/exchange-hubs", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createHubSchema.parse(req.body);
    const hub = await prisma.exchangeHub.create({
      data: { ...data, logoUrl: data.logoUrl || undefined, codePrefix: data.codePrefix?.toUpperCase() || undefined }
    });
    res.status(201).json(hub);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/exchange-hubs/:exchangeHubId", requireRole(writeRoles), async (req, res) => {
  try {
    const data = updateHubSchema.parse(req.body);
    const hub = await prisma.exchangeHub.update({
      where: { id: param(req, "exchangeHubId") },
      data: {
        ...data,
        logoUrl: data.logoUrl || undefined,
        codePrefix: data.codePrefix?.toUpperCase() || undefined
      }
    });
    res.json(hub);
  } catch (error) {
    handleError(res, error);
  }
});

// Approve a pending Exchange Hub application — activates the hub and
// upgrades the applicant merchant in one step.
router.post("/exchange-hubs/:exchangeHubId/approve", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });
    if (hub.status === "ACTIVE") return res.status(409).json({ error: "Already active" });

    const updatedHub = await prisma.exchangeHub.update({
      where: { id: exchangeHubId },
      data: { status: "ACTIVE", billingStatus: "ACTIVE" }
    });

    // If this hub came from a merchant application, upgrade that merchant.
    if (hub.applicantMerchantId) {
      await prisma.merchant.update({
        where: { id: hub.applicantMerchantId },
        data: {
          isExchangeHub: true,
          linkedExchangeHubId: exchangeHubId,
          businessName: hub.displayName
        }
      });
      // Grant the merchant access to issue for this hub.
      await prisma.merchantAccessRule.upsert({
        where: { merchantId_exchangeHubId: { merchantId: hub.applicantMerchantId, exchangeHubId } },
        update: { status: "ACTIVE" },
        create: { merchantId: hub.applicantMerchantId, exchangeHubId, status: "ACTIVE" }
      });
    }

    await audit({
      action: AuditAction.EXCHANGE_HUB_SUSPENDED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType ?? "admin",
      entityType: "ExchangeHub",
      entityId: exchangeHubId,
      message: `Exchange Hub approved and activated${hub.applicantMerchantId ? ` (merchant ${hub.applicantMerchantId} upgraded)` : ""}`
    });

    res.json(updatedHub);
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/exchange-hubs/:exchangeHubId/suspend", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.update({
      where: { id: exchangeHubId },
      data: { status: HubStatus.SUSPENDED }
    });
    await prisma.universalExchangeNote.updateMany({
      where: { exchangeHubId, status: UenStatus.ACTIVE },
      data: { status: UenStatus.SUSPENDED }
    });
    await audit({
      action: AuditAction.EXCHANGE_HUB_SUSPENDED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "ExchangeHub",
      entityId: hub.id,
      message: "Exchange Hub suspended and active UENs stopped from syncing"
    });
    res.json(hub);
  } catch (error) {
    handleError(res, error);
  }
});

// Hard-delete an Exchange Hub and all records that depend on it.
router.delete("/exchange-hubs/:exchangeHubId", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });

    // Collect IDs needed for child-table cleanup
    const uens = await prisma.universalExchangeNote.findMany({ where: { exchangeHubId }, select: { id: true } });
    const uenIds = uens.map((u) => u.id);

    const inventory = await prisma.uenCodeInventory.findMany({ where: { exchangeHubId }, select: { id: true } });
    const inventoryIds = inventory.map((c) => c.id);

    const holders = await prisma.holder.findMany({ where: { exchangeHubId }, select: { id: true } });
    const holderIds = holders.map((h) => h.id);

    // Delete strictly leaf-to-root so every foreign key is satisfied before
    // its parent row is removed.

    // ShopifyInventorySyncedCode -> UenCodeInventory (must clear before inventory)
    await prisma.shopifyInventorySyncedCode.deleteMany({ where: { inventoryCodeId: { in: inventoryIds } } });

    // ShopifySyncedNote -> UniversalExchangeNote
    await prisma.shopifySyncedNote.deleteMany({ where: { universalExchangeNoteId: { in: uenIds } } });

    // HolderNotification -> Holder (this was the missing link causing the 500)
    await prisma.holderNotification.deleteMany({ where: { holderId: { in: holderIds } } });

    // Unlink inventory from the UENs about to be deleted, then delete UENs
    await prisma.uenCodeInventory.updateMany({ where: { universalExchangeNoteId: { in: uenIds } }, data: { universalExchangeNoteId: null, status: "REMOVED" } });
    await prisma.universalExchangeNote.deleteMany({ where: { exchangeHubId } });

    // UenIssuanceLog -> ShopifyIssuanceProduct
    await prisma.uenIssuanceLog.deleteMany({ where: { issuanceProduct: { exchangeHubId } } });

    // Inventory and issuance products
    await prisma.uenCodeInventory.deleteMany({ where: { exchangeHubId } });
    await prisma.shopifyIssuanceProduct.deleteMany({ where: { exchangeHubId } });

    // Holders and access rules
    await prisma.holder.deleteMany({ where: { exchangeHubId } });
    await prisma.merchantAccessRule.deleteMany({ where: { exchangeHubId } });

    // DigitalProduct has no database table yet (model exists in schema but no
    // migration). Guard the delete so a missing table can't abort the cascade.
    try {
      await prisma.digitalProduct.deleteMany({ where: { exchangeHubId } });
    } catch (digitalProductError) {
      // Table doesn't exist / nothing to delete — safe to ignore.
    }

    // Unlink any merchants that were linked to this hub
    await prisma.merchant.updateMany({ where: { linkedExchangeHubId: exchangeHubId }, data: { linkedExchangeHubId: null, isExchangeHub: false } });

    await prisma.exchangeHub.delete({ where: { id: exchangeHubId } });

    res.json({ deleted: true, displayName: hub.displayName });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/holders", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.holder.findMany({ orderBy: { createdAt: "desc" }, include: { exchangeHub: true } }));
});

router.post("/exchange-hubs/:exchangeHubId/holders", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createHolderSchema.parse(req.body);
    const holder = await prisma.holder.create({
      data: { ...data, exchangeHubId: param(req, "exchangeHubId") }
    });
    res.status(201).json(holder);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/uens", requireRole(adminRoles), async (_req, res) => {
  res.json(
    await prisma.universalExchangeNote.findMany({
      orderBy: { createdAt: "desc" },
      include: { exchangeHub: true, holder: true }
    })
  );
});

router.post("/exchange-hubs/:exchangeHubId/uens", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });
    if (hub.status === HubStatus.SUSPENDED || hub.status === HubStatus.DISABLED) {
      return res.status(409).json({ error: "Suspended or disabled Exchange Hubs cannot generate new UENs" });
    }

    const data = createUenSchema.parse(req.body);
    const note = await prisma.universalExchangeNote.create({
      data: {
        exchangeHubId,
        holderId: data.holderId,
        code: data.code?.toUpperCase() ?? (await generatedCode(data.codePrefix ?? hub.codePrefix ?? "")),
        campaignId: data.campaignId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
      }
    });
    await audit({
      action: AuditAction.UEN_GENERATED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "UniversalExchangeNote",
      entityId: note.id,
      message: `Generated ${note.code}`
    });
    const sync = await syncNewUensToEligibleShopifyStores(exchangeHubId, [note], "MANUAL");
    res.status(201).json({ ...note, sync });
  } catch (error) {
    handleError(res, error);
  }
});

// Issue a UEN to a recipient by EMAIL in a single idempotent call — built for
// external integrations (e.g. zahbrandsolutions.com Stripe tips). Upserts the
// holder so a repeat customer reuses one wallet, and dedupes on `externalRef`
// (e.g. the Stripe checkout-session id) so webhook retries never mint duplicate
// notes. Auth: admin bearer token (writeRoles), same as the routes above.
router.post("/exchange-hubs/:exchangeHubId/issue-by-email", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });
    if (hub.status === HubStatus.SUSPENDED || hub.status === HubStatus.DISABLED) {
      return res.status(409).json({ error: "Suspended or disabled Exchange Hubs cannot generate new UENs" });
    }

    const body = (req.body ?? {}) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      campaignId?: string;
      externalRef?: string;
      codePrefix?: string;
      expiresAt?: string;
      walletUrl?: string; // where the recipient views their note (e.g. the brand site's /wallet)
    };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email is required" });
    }
    const externalRef = body.externalRef?.trim() || undefined;

    // Idempotency: if we've already issued for this external reference in this
    // hub, return the existing note instead of creating a new one.
    if (externalRef) {
      const existing = await prisma.universalExchangeNote.findFirst({
        where: { exchangeHubId, campaignId: externalRef },
        include: { holder: true }
      });
      if (existing) {
        return res.status(200).json({ ...existing, idempotent: true });
      }
    }

    const holder = await prisma.holder.upsert({
      where: { exchangeHubId_email: { exchangeHubId, email } },
      update: {
        firstName: body.firstName?.trim() || undefined,
        lastName: body.lastName?.trim() || undefined
      },
      create: {
        exchangeHubId,
        email,
        firstName: body.firstName?.trim() || "Friend",
        lastName: body.lastName?.trim() || ""
      }
    });

    const note = await prisma.universalExchangeNote.create({
      data: {
        exchangeHubId,
        holderId: holder.id,
        code: await generatedCode(body.codePrefix ?? hub.codePrefix ?? ""),
        campaignId: externalRef ?? body.campaignId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
      }
    });

    await audit({
      action: AuditAction.UEN_GENERATED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "UniversalExchangeNote",
      entityId: note.id,
      message: `Issued ${note.code} to ${email}`
    });

    // Email the recipient their love note via ZeptoMail. Best-effort — a mail
    // hiccup must not fail issuance (the note is already created).
    let emailed = false;
    try {
      await sendLoveNoteEmail(email, {
        firstName: holder.firstName && holder.firstName !== "Friend" ? holder.firstName : undefined,
        walletUrl: body.walletUrl ? String(body.walletUrl) : `${publicBaseUrl(req)}/wallet`
      });
      emailed = true;
    } catch (mailErr) {
      console.error("[issue-by-email] love-note email failed:", mailErr);
    }

    const sync = await syncNewUensToEligibleShopifyStores(exchangeHubId, [note], "MANUAL");
    return res.status(201).json({ ...note, holder, sync, emailed });
  } catch (error) {
    handleError(res, error);
  }
});

// Register (or update) a holder by email WITHOUT minting a note. The brand site
// calls this when someone creates a wallet there, so every new wallet immediately
// exists as a holder in this hub (visible in the admin, ready to receive notes).
// Idempotent via the (exchangeHubId, email) unique key. Auth: admin bearer token.
router.post("/exchange-hubs/:exchangeHubId/register-holder", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });

    const body = (req.body ?? {}) as { email?: string; firstName?: string; lastName?: string; source?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email is required" });
    }

    const holder = await prisma.holder.upsert({
      where: { exchangeHubId_email: { exchangeHubId, email } },
      update: {
        firstName: body.firstName?.trim() || undefined,
        lastName: body.lastName?.trim() || undefined
      },
      create: {
        exchangeHubId,
        email,
        firstName: body.firstName?.trim() || "Friend",
        lastName: body.lastName?.trim() || ""
      }
    });

    return res.status(200).json({ ok: true, holder });
  } catch (error) {
    handleError(res, error);
  }
});

// ── Universal "share as a gift" referral ───────────────────────────────────
// A holder shares any asset via a stable per-(hub, sharer, asset) code; when a
// genuinely NEW person signs up through it, the sharer earns one UEN. Built as
// a hub primitive so every surface (workbook today, albums/notes tomorrow)
// inherits it. Called server-side by the brand site with the admin token.

// Create or fetch a sharer's gift code. Idempotent per (hub, sharer, asset), so
// the same person always reshares the same link and refreshes their cached name.
router.post("/exchange-hubs/:exchangeHubId/referrals", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });

    const data = createReferralSchema.parse(req.body);
    const referrerEmail = data.referrerEmail.trim().toLowerCase();
    const assetKey = data.assetKey?.trim() || "workbook";
    const referrerName = data.referrerName?.trim() || undefined;

    const existing = await prisma.referral.findUnique({
      where: { exchangeHubId_referrerEmail_assetKey: { exchangeHubId, referrerEmail, assetKey } }
    });
    if (existing) {
      const referral =
        referrerName && referrerName !== existing.referrerName
          ? await prisma.referral.update({ where: { id: existing.id }, data: { referrerName } })
          : existing;
      return res.status(200).json({
        code: referral.code,
        assetKey: referral.assetKey,
        referrerName: referral.referrerName,
        conversions: referral.conversions
      });
    }

    const referral = await prisma.referral.create({
      data: { exchangeHubId, code: await generatedReferralCode(), referrerEmail, referrerName, assetKey }
    });
    return res.status(201).json({
      code: referral.code,
      assetKey: referral.assetKey,
      referrerName: referral.referrerName,
      conversions: 0
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Look up a gift code to render the recipient's landing ("[Name] is sharing…").
router.get("/exchange-hubs/:exchangeHubId/referrals/:code", requireRole(adminRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const code = (param(req, "code") ?? "").toUpperCase();
    const referral = await prisma.referral.findUnique({ where: { code } });
    if (!referral || referral.exchangeHubId !== exchangeHubId) {
      return res.status(404).json({ error: "Referral not found" });
    }
    const firstName = (referral.referrerName ?? "").trim().split(/\s+/)[0] || null;
    return res.json({
      code: referral.code,
      assetKey: referral.assetKey,
      referrerName: referral.referrerName,
      referrerFirstName: firstName,
      conversions: referral.conversions
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Convert on recipient signup → grant the sharer exactly one UEN, once.
// Guards (all return rewarded:false, never an error, so the signup UX never
// breaks): no self-referral; recipient must be genuinely new (not already a
// holder); first link wins (a recipient can reward only one sharer hub-wide);
// per-(code, recipient) idempotent. The note itself dedupes on campaignId.
router.post("/exchange-hubs/:exchangeHubId/referrals/:code/convert", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const code = (param(req, "code") ?? "").toUpperCase();
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });
    if (hub.status === HubStatus.SUSPENDED || hub.status === HubStatus.DISABLED) {
      return res.status(409).json({ error: "Suspended or disabled Exchange Hubs cannot grant referral rewards" });
    }

    const referral = await prisma.referral.findUnique({ where: { code } });
    if (!referral || referral.exchangeHubId !== exchangeHubId) {
      return res.status(404).json({ error: "Referral not found" });
    }

    const data = convertReferralSchema.parse(req.body);
    const referredEmail = data.referredEmail.trim().toLowerCase();

    if (referredEmail === referral.referrerEmail) {
      return res.status(200).json({ rewarded: false, reason: "self_referral" });
    }

    const existingConversion = await prisma.referralConversion.findUnique({
      where: { referralId_referredEmail: { referralId: referral.id, referredEmail } }
    });
    if (existingConversion) {
      return res.status(200).json({ rewarded: true, idempotent: true });
    }

    const priorAnywhere = await prisma.referralConversion.findFirst({
      where: { exchangeHubId, referredEmail }
    });
    if (priorAnywhere) {
      return res.status(200).json({ rewarded: false, reason: "already_referred" });
    }

    const existingHolder = await prisma.holder.findUnique({
      where: { exchangeHubId_email: { exchangeHubId, email: referredEmail } }
    });
    if (existingHolder) {
      return res.status(200).json({ rewarded: false, reason: "existing_holder" });
    }

    // Mint the sharer's reward note (dedupe on campaignId against any retry).
    const campaignId = `ref:${referral.id}:${referredEmail}`;
    const referrer = await prisma.holder.upsert({
      where: { exchangeHubId_email: { exchangeHubId, email: referral.referrerEmail } },
      update: {},
      create: {
        exchangeHubId,
        email: referral.referrerEmail,
        firstName: referral.referrerName?.trim().split(/\s+/)[0] || "Friend",
        lastName: referral.referrerName?.trim().split(/\s+/).slice(1).join(" ") || ""
      }
    });
    const note =
      (await prisma.universalExchangeNote.findFirst({ where: { exchangeHubId, campaignId } })) ??
      (await prisma.universalExchangeNote.create({
        data: { exchangeHubId, holderId: referrer.id, code: await generatedCode(hub.codePrefix ?? ""), campaignId }
      }));

    await prisma.referralConversion.create({
      data: { referralId: referral.id, exchangeHubId, referredEmail, rewardUenId: note.id }
    });
    await prisma.referral.update({ where: { id: referral.id }, data: { conversions: { increment: 1 } } });

    await audit({
      action: AuditAction.UEN_GENERATED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "UniversalExchangeNote",
      entityId: note.id,
      message: `Referral reward ${note.code} to ${referral.referrerEmail} for new signup ${referredEmail}`
    });

    const sync = await syncNewUensToEligibleShopifyStores(exchangeHubId, [note], "MANUAL");
    return res.status(201).json({ rewarded: true, code: note.code, sync });
  } catch (error) {
    handleError(res, error);
  }
});

// Read a holder's UEN wallet summary by EMAIL for a hub — powers the holder
// wallet on an external site (e.g. zahbrandsolutions.com/wallet). Admin-read
// auth: the external site calls this server-side with the admin token so the
// token never reaches the browser.
router.get("/exchange-hubs/:exchangeHubId/wallet", requireRole(adminRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email query param is required" });

    const holder = await prisma.holder.findUnique({
      where: { exchangeHubId_email: { exchangeHubId, email } }
    });
    if (!holder) {
      return res.json({ email, holder: null, count: 0, notes: [] });
    }

    const notes = await prisma.universalExchangeNote.findMany({
      where: { exchangeHubId, holderId: holder.id, status: UenStatus.ACTIVE },
      orderBy: { issuedAt: "desc" },
      select: { code: true, status: true, issuedAt: true }
    });

    res.json({
      email,
      holder: { id: holder.id, firstName: holder.firstName, lastName: holder.lastName },
      count: notes.length,
      notes
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Validate a UEN by code — for an external store checkout (e.g.
// zahbrandsolutions.com) to confirm a love note is real and still spendable
// before applying a discount. Admin-read auth (called server-side).
router.post("/exchange-hubs/:exchangeHubId/notes/validate", requireRole(adminRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (!code) return res.status(400).json({ valid: false, error: "code is required" });

    const note = await prisma.universalExchangeNote.findFirst({ where: { exchangeHubId, code } });
    if (!note) return res.json({ valid: false, code, reason: "not_found" });
    if (note.status !== UenStatus.ACTIVE) {
      return res.json({
        valid: false,
        code,
        status: note.status,
        reason: note.status === UenStatus.DISABLED ? "already_used" : "inactive",
      });
    }
    if (note.expiresAt && note.expiresAt.getTime() < Date.now()) {
      return res.json({ valid: false, code, reason: "expired" });
    }
    return res.json({ valid: true, code, noteId: note.id });
  } catch (error) {
    handleError(res, error);
  }
});

// Redeem a UEN (mark it spent) after a successful external store purchase.
// v1: redeeming sets the note to DISABLED (one note = one purchase, then spent).
// Idempotent — redeeming an already-spent note returns success, not an error,
// so Stripe webhook retries are safe.
// TODO(multi-merchant): when stores beyond zahbrandsolutions.com accept this
// hub's notes, switch to per-merchant redemption tracking (like ShopifySyncedNote).
router.post("/exchange-hubs/:exchangeHubId/notes/redeem", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const externalRef = req.body?.externalRef ? String(req.body.externalRef).trim() : undefined;
    if (!code) return res.status(400).json({ error: "code is required" });

    const note = await prisma.universalExchangeNote.findFirst({ where: { exchangeHubId, code } });
    if (!note) return res.status(404).json({ error: "Note not found" });
    if (note.status === UenStatus.DISABLED) {
      return res.json({ redeemed: true, code, idempotent: true });
    }
    if (note.status !== UenStatus.ACTIVE) {
      return res.status(409).json({ error: `Note is ${note.status}`, status: note.status });
    }

    const updated = await prisma.universalExchangeNote.update({
      where: { id: note.id },
      data: { status: UenStatus.DISABLED, disabledAt: new Date() },
    });
    await audit({
      action: AuditAction.UEN_DISABLED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "UniversalExchangeNote",
      entityId: note.id,
      message: `Redeemed ${note.code}${externalRef ? ` · order ${externalRef}` : ""}`,
    });
    return res.json({ redeemed: true, code: updated.code });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/uens/:uenId/disable", requireRole(writeRoles), async (req, res) => {
  try {
    const note = await prisma.universalExchangeNote.update({
      where: { id: param(req, "uenId") },
      data: { status: UenStatus.DISABLED, disabledAt: new Date() }
    });
    await prisma.shopifySyncedNote.updateMany({
      where: { universalExchangeNoteId: note.id },
      data: { syncStatus: "INACTIVE", errorMessage: "UEN disabled in central platform" }
    });
    await audit({
      action: AuditAction.UEN_DISABLED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "UniversalExchangeNote",
      entityId: note.id,
      message: `Disabled ${note.code}`
    });
    res.json(note);
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/uens/:uenId/remove-from-circulation", requireRole(writeRoles), async (req, res) => {
  try {
    const note = await prisma.universalExchangeNote.update({
      where: { id: param(req, "uenId") },
      data: { status: UenStatus.REMOVED_FROM_CIRCULATION, disabledAt: new Date() }
    });
    await prisma.shopifySyncedNote.updateMany({
      where: { universalExchangeNoteId: note.id },
      data: { syncStatus: "INACTIVE", errorMessage: "UEN removed from circulation by platform admin" }
    });
    await audit({
      action: AuditAction.UEN_REMOVED_FROM_CIRCULATION,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "UniversalExchangeNote",
      entityId: note.id,
      message: `Removed ${note.code} from circulation`
    });
    res.json(note);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/uens/:uenId", requireRole(writeRoles), async (req, res) => {
  try {
    const uenId = param(req, "uenId");
    await prisma.shopifySyncedNote.deleteMany({ where: { universalExchangeNoteId: uenId } });
    await prisma.uenCodeInventory.updateMany({
      where: { universalExchangeNoteId: uenId },
      data: { status: "REMOVED", universalExchangeNoteId: null }
    });
    await prisma.universalExchangeNote.delete({ where: { id: uenId } });
    res.json({ deleted: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/merchants", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.merchant.findMany({ orderBy: { createdAt: "desc" }, include: { linkedExchangeHub: true } }));
});

// Hard-delete a merchant and every record that references it.
router.delete("/merchants/:merchantId", requireRole(writeRoles), async (req, res) => {
  try {
    const merchantId = param(req, "merchantId");
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });

    await prisma.shopifyInventorySyncedCode.deleteMany({ where: { merchantId } });
    await prisma.shopifySyncedNote.deleteMany({ where: { merchantId } });
    await prisma.shopifyDiscountGroup.deleteMany({ where: { merchantId } });
    await prisma.syncLog.deleteMany({ where: { merchantId } });
    await prisma.merchantOffer.deleteMany({ where: { merchantId } });
    await prisma.merchantAccessRule.deleteMany({ where: { merchantId } });
    await prisma.merchantApiKey.deleteMany({ where: { merchantId } });
    await prisma.merchantOnboarding.deleteMany({ where: { merchantId } });
    await prisma.merchantHistoricalRedemption.deleteMany({ where: { merchantId } });
    await prisma.shopifyConnection.deleteMany({ where: { merchantId } });

    // Also remove any pending hub applications this merchant submitted
    await prisma.exchangeHub.deleteMany({
      where: { applicantMerchantId: merchantId, status: "PENDING_REVIEW" }
    });

    await prisma.merchant.delete({ where: { id: merchantId } });

    res.json({ deleted: true, businessName: merchant.businessName });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/merchants", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createMerchantSchema.parse(req.body);
    const merchant = await prisma.merchant.create({ data });
    res.status(201).json(merchant);
  } catch (error) {
    handleError(res, error);
  }
});

// Mint a platform connection token for a merchant (admin only). Used with
// POST /shopify/api/platform-connection to link a store via a direct Admin
// API access token — the path for stores that can't install the OAuth app
// (custom distribution is locked to a single store).
router.post("/merchants/:merchantId/api-keys", requireRole(writeRoles), async (req, res) => {
  try {
    const merchantId = param(req, "merchantId");
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });
    const label = typeof req.body?.label === "string" && req.body.label.trim() ? req.body.label.trim() : "Platform connection";
    const rawToken = `uen_connect_${crypto.randomBytes(24).toString("base64url")}`;
    await prisma.merchantApiKey.create({
      data: { merchantId, keyHash: hashSecret(rawToken), label }
    });
    // The raw token is returned exactly once; only its hash is stored.
    res.status(201).json({ merchantId, businessName: merchant.businessName, label, connectionToken: rawToken });
  } catch (error) {
    handleError(res, error);
  }
});

// Issue a Shopify install link bound to an EXISTING merchant (admin only).
// Needed when the store's myshopify domain doesn't resemble the hub/merchant
// name (e.g. a renamed brand), where the self-serve install's name matcher
// would otherwise create a duplicate merchant.
router.post("/merchants/:merchantId/onboarding-link", requireRole(writeRoles), async (req, res) => {
  try {
    const merchantId = param(req, "merchantId");
    const data = z.object({
      shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
      requestedExchangeHubId: z.string().optional()
    }).parse(req.body);
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });

    const token = crypto.randomBytes(24).toString("base64url");
    const onboarding = await prisma.merchantOnboarding.create({
      data: {
        merchantId,
        token,
        businessName: merchant.businessName,
        contactEmail: merchant.contactEmail ?? "unknown@uenite.com",
        shopDomain: data.shopDomain.toLowerCase(),
        requestedExchangeHubId: data.requestedExchangeHubId ?? merchant.linkedExchangeHubId ?? undefined
      }
    });

    const shopifyInstallPath = `/shopify/auth?shop=${encodeURIComponent(onboarding.shopDomain)}&onboardingToken=${encodeURIComponent(onboarding.token)}`;
    res.status(201).json({
      merchantId,
      shopDomain: onboarding.shopDomain,
      installUrl: absoluteAppUrl(req, shopifyInstallPath)
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Reset a merchant's login credentials (admin only).
router.patch("/merchants/:merchantId/credentials", requireRole(writeRoles), async (req, res) => {
  try {
    const data = z.object({
      contactEmail: z.string().email().optional(),
      password: z.string().min(8).optional()
    }).parse(req.body);
    if (!data.contactEmail && !data.password) {
      return res.status(400).json({ error: "Provide contactEmail, password, or both." });
    }
    const updates: Record<string, unknown> = {};
    if (data.contactEmail) updates.contactEmail = data.contactEmail.toLowerCase();
    if (data.password) updates.passwordHash = await bcrypt.hash(data.password, 12);
    const merchant = await prisma.merchant.update({
      where: { id: param(req, "merchantId") },
      data: updates
    });
    res.json({ id: merchant.id, businessName: merchant.businessName, contactEmail: merchant.contactEmail });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/merchant-offers", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.merchantOffer.findMany({ orderBy: { createdAt: "desc" }, include: { merchant: true } }));
});

router.post("/merchants/:merchantId/offers", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createOfferSchema.parse(req.body);
    const offer = await prisma.merchantOffer.create({
      data: {
        ...data,
        merchantId: param(req, "merchantId"),
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined
      }
    });
    await audit({
      action: AuditAction.MERCHANT_OFFER_CHANGED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "MerchantOffer",
      entityId: offer.id,
      message: "Merchant offer created"
    });
    res.status(201).json(offer);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/merchant-access-rules", requireRole(adminRoles), async (_req, res) => {
  res.json(
    await prisma.merchantAccessRule.findMany({
      orderBy: { createdAt: "desc" },
      include: { merchant: true, exchangeHub: true }
    })
  );
});

router.post("/merchants/:merchantId/access-rules", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createAccessRuleSchema.parse(req.body);
    const rule = await prisma.merchantAccessRule.upsert({
      where: { merchantId_exchangeHubId: { merchantId: param(req, "merchantId"), exchangeHubId: data.exchangeHubId } },
      update: { status: data.status },
      create: { merchantId: param(req, "merchantId"), ...data }
    });
    await audit({
      action: AuditAction.MERCHANT_ACCESS_RULE_CHANGED,
      actorId: req.auth?.actorId,
      actorType: req.auth?.actorType,
      entityType: "MerchantAccessRule",
      entityId: rule.id,
      message: "Merchant access rule changed"
    });
    res.status(201).json(rule);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/shopify-connections", requireRole(adminRoles), async (_req, res) => {
  const rows = await prisma.shopifyConnection.findMany({ orderBy: { createdAt: "desc" }, include: { merchant: true } });
  res.json(rows.map(publicConnection));
});

// Import historical UEN redemptions from Shopify order history.
// Paginates through all orders on the store, finds discount codes matching
// the UEN pattern (ending in UEN), and saves them as MerchantHistoricalRedemption
// records. Safe to run multiple times — upserts by (shopDomain, orderId, code).
router.post("/shopify-connections/:shopDomain/import-historical", requireRole(writeRoles), async (req, res) => {
  try {
    const shopDomain = param(req, "shopDomain");
    // codePrefix filters to only codes starting with this string (case-insensitive).
    // Required — prevents accidentally importing unrelated store discounts.
    const codePrefix = String(req.body.codePrefix ?? "").trim().toUpperCase();
    if (!codePrefix) {
      return res.status(400).json({ error: "codePrefix is required. Specify the prefix your UEN codes start with (e.g. LOVE)." });
    }

    const connection = await prisma.shopifyConnection.findUnique({ where: { shopDomain }, include: { merchant: true } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    // Clear any previously imported records for this store+prefix so re-runs are clean.
    // Scoped to the prefix so importing LOVE then UNLIMITEDLOVE doesn't wipe the first run.
    const deleted = await prisma.merchantHistoricalRedemption.deleteMany({
      where: { shopDomain, merchantId: connection.merchantId, uenCode: { startsWith: codePrefix } }
    });

    let pageUrl = `https://${shopDomain}/admin/api/${config.shopifyApiVersion}/orders.json?status=any&limit=250&fields=id,created_at,total_price,discount_codes`;
    let totalOrders = 0;
    let totalImported = 0;
    let totalSkipped = 0;
    const matchedCodes: string[] = [];

    while (pageUrl) {
      const response = await fetch(pageUrl, {
        headers: { "x-shopify-access-token": connection.accessToken, "content-type": "application/json" }
      });
      if (!response.ok) {
        return res.status(502).json({ error: `Shopify API error: ${response.status}` });
      }

      const payload = await response.json() as { orders: Array<{ id: number; created_at: string; total_price: string; discount_codes: Array<{ code: string; amount: string }> }> };
      totalOrders += payload.orders.length;

      for (const order of payload.orders) {
        for (const dc of order.discount_codes ?? []) {
          if (!dc.code) continue;
          // Only import codes that start with the specified prefix
          if (!dc.code.toUpperCase().startsWith(codePrefix)) continue;

          if (matchedCodes.length < 10 && !matchedCodes.includes(dc.code.toUpperCase())) {
            matchedCodes.push(dc.code.toUpperCase());
          }
          try {
            await prisma.merchantHistoricalRedemption.upsert({
              where: {
                shopDomain_shopifyOrderId_uenCode: {
                  shopDomain,
                  shopifyOrderId: String(order.id),
                  uenCode: dc.code.toUpperCase()
                }
              },
              update: {},
              create: {
                merchantId: connection.merchantId,
                shopDomain,
                uenCode: dc.code.toUpperCase(),
                shopifyOrderId: String(order.id),
                orderAmount: order.total_price ? Number(order.total_price) : null,
                redeemedAt: new Date(order.created_at),
                source: "SHOPIFY_BACKFILL"
              }
            });
            totalImported++;
          } catch {
            totalSkipped++;
          }
        }
      }

      const linkHeader = response.headers.get("link") ?? "";
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = nextMatch ? nextMatch[1] : "";
    }

    res.json({
      shopDomain, codePrefix, totalOrders, totalImported, totalSkipped,
      deletedPrevious: deleted.count,
      matchedCodes,
      message: `Imported ${totalImported} LOVE-prefixed codes from ${totalOrders} orders. (Cleared ${deleted.count} previous records.)`
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Admin trigger for the grandfathered-code store load. Needed for merchants
// that connected before the feature existed (new installs run it automatically).
// Fire-and-forget: the full load takes minutes (thousands of tracking rows),
// far beyond proxy timeouts — completion lands in the sync logs.
router.post("/shopify-connections/:shopDomain/sync-grandfathered", requireRole(writeRoles), async (req, res) => {
  try {
    const shopDomain = param(req, "shopDomain");
    const connection = await prisma.shopifyConnection.findUnique({ where: { shopDomain } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });
    setImmediate(async () => {
      try {
        await syncGrandfatheredCodesToMerchant(connection.merchantId, shopDomain, "ADMIN");
      } catch (error) {
        console.warn("Admin grandfather sync failed:", error);
      }
    });
    res.status(202).json({ started: true, shopDomain, note: "Running in background; check sync logs for the result" });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/shopify-synced-notes", requireRole(adminRoles), async (_req, res) => {
  res.json(
    await prisma.shopifySyncedNote.findMany({
      orderBy: { createdAt: "desc" },
      include: { merchant: true, universalExchangeNote: true }
    })
  );
});

router.get("/sync-logs", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, include: { merchant: true } }));
});

router.get("/issuance-products", requireRole(adminRoles), async (_req, res) => {
  const products = await prisma.shopifyIssuanceProduct.findMany({
    orderBy: { createdAt: "desc" },
    include: { exchangeHub: true }
  });
  const counts = await prisma.uenCodeInventory.groupBy({
    by: ["issuanceProductId", "status"],
    where: { issuanceProductId: { in: products.map((product) => product.id) } },
    _count: true
  });
  res.json(
    products.map((product) => ({
      ...product,
      availableKeys: counts.find((count) => count.issuanceProductId === product.id && count.status === "AVAILABLE")?._count ?? 0,
      issuedKeys: counts.find((count) => count.issuanceProductId === product.id && count.status === "ISSUED")?._count ?? 0
    }))
  );
});

router.post("/issuance-products", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createIssuanceProductSchema.parse(req.body);
    const product = await prisma.shopifyIssuanceProduct.upsert({
      where: { shopDomain_shopifyProductId: { shopDomain: data.shopDomain, shopifyProductId: data.shopifyProductId } },
      update: {
        exchangeHubId: data.exchangeHubId,
        productTitle: data.productTitle,
        productImageUrl: data.productImageUrl || undefined,
        digitalAssetUrl: data.digitalAssetUrl || undefined,
        status: data.status
      },
      create: {
        ...data,
        productImageUrl: data.productImageUrl || undefined,
        digitalAssetUrl: data.digitalAssetUrl || undefined
      }
    });
    res.status(201).json(product);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/issuance-logs", requireRole(adminRoles), async (_req, res) => {
  res.json(
    await prisma.uenIssuanceLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { issuanceProduct: { include: { exchangeHub: true } } }
    })
  );
});

router.post("/exchange-hubs/:exchangeHubId/code-inventory/generate", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const data = bulkGenerateCodesSchema.parse(req.body);
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });
    const created = [];
    for (let index = 0; index < data.count; index += 1) {
      created.push(
        await prisma.uenCodeInventory.create({
          data: {
            exchangeHubId,
            issuanceProductId: data.issuanceProductId,
            code: await generatedCode(hub.codePrefix ?? ""),
            source: "GENERATED"
          }
        })
      );
    }
    const sync = await syncInventoryCodesToMerchantStores(exchangeHubId, created);
    res.status(201).json({ created: created.length, sync });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/exchange-hubs/:exchangeHubId/code-inventory/import", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const data = bulkImportCodesSchema.parse(req.body);
    const created = [];
    for (const code of data.codes) {
      try {
        created.push(
          await prisma.uenCodeInventory.create({
            data: {
              exchangeHubId,
              issuanceProductId: data.issuanceProductId,
              code: code.toUpperCase(),
              source: "IMPORTED"
            }
          })
        );
      } catch (_error) {
        // Duplicate imported codes are skipped so CSV-style bulk imports can be retried.
      }
    }
    const sync = await syncInventoryCodesToMerchantStores(exchangeHubId, created);
    res.status(201).json({ created: created.length, sync });
  } catch (error) {
    handleError(res, error);
  }
});

// Pre-load holder identities (name/phone keyed by email) from historical
// purchase data, so returning purchasers see their real name pre-filled and
// only have to verify. Never clobbers data a holder entered themselves:
// names only fill placeholders, phone only fills empty.
router.post("/exchange-hubs/:exchangeHubId/holders/preload", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const data = z.object({
      entries: z.array(z.object({
        email: z.string().email(),
        firstName: z.string().max(80).optional(),
        lastName: z.string().max(80).optional(),
        phone: z.string().max(32).optional()
      })).min(1).max(500)
    }).parse(req.body);
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });

    // Bulk-shaped: one read + one createMany; per-row updates only for the few
    // existing holders that need a fill-in (per-row round trips trip Cloudflare's
    // origin timeout at production latency).
    const normalized = data.entries.map((entry) => ({ ...entry, email: entry.email.trim().toLowerCase() }));
    const existingRows = await prisma.holder.findMany({
      where: { exchangeHubId, email: { in: normalized.map((entry) => entry.email) } },
      select: { id: true, email: true, firstName: true, phone: true }
    });
    const existingByEmail = new Map(existingRows.map((row) => [row.email, row]));

    const toCreate: Array<{ exchangeHubId: string; email: string; firstName: string; lastName: string; phone: string | null; status: string }> = [];
    const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const entry of normalized) {
      const existing = existingByEmail.get(entry.email);
      if (!existing) {
        toCreate.push({
          exchangeHubId,
          email: entry.email,
          firstName: entry.firstName?.trim() || "Holder",
          lastName: entry.lastName?.trim() || "",
          phone: entry.phone?.trim() || null,
          status: "ACTIVE"
        });
      } else {
        const placeholderName = !existing.firstName || existing.firstName.trim().toLowerCase() === "holder";
        const updates: Record<string, unknown> = {};
        if (placeholderName && entry.firstName?.trim()) {
          updates.firstName = entry.firstName.trim();
          updates.lastName = entry.lastName?.trim() || "";
        }
        if (!existing.phone && entry.phone?.trim()) updates.phone = entry.phone.trim();
        if (Object.keys(updates).length) toUpdate.push({ id: existing.id, data: updates });
      }
    }
    if (toCreate.length) await prisma.holder.createMany({ data: toCreate });
    for (const update of toUpdate) {
      await prisma.holder.update({ where: { id: update.id }, data: update.data });
    }
    res.status(201).json({ created: toCreate.length, updated: toUpdate.length });
  } catch (error) {
    handleError(res, error);
  }
});

// Grandfathered legacy codes (2022 Love Notes): imported as RESERVED with an
// email reservation from the original purchase. RESERVED (not AVAILABLE) keeps
// them out of nextCodeForIssuance, so new Shopify purchases can never be handed
// someone else's grandfathered code. Claiming happens when a holder registers
// or loads their wallet with the reserved email. Store sync is a separate step.
router.post("/exchange-hubs/:exchangeHubId/code-inventory/import-grandfathered", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const data = importGrandfatheredCodesSchema.parse(req.body);
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });

    // Bulk-shaped: one read + one createMany per request. Per-row round trips
    // were slow enough that batches tripped Cloudflare's origin timeout.
    const prepared = new Map<string, { email: string | null; purchasedAt?: Date }>();
    for (const entry of data.entries) {
      prepared.set(entry.code.toUpperCase(), {
        email: entry.email ? entry.email.trim().toLowerCase() : null,
        ...(entry.purchasedAt ? { purchasedAt: new Date(entry.purchasedAt) } : {})
      });
    }

    const existingRows = await prisma.uenCodeInventory.findMany({
      where: { code: { in: [...prepared.keys()] } },
      select: { id: true, code: true, status: true, source: true, issuedToEmail: true }
    });
    const existingByCode = new Map(existingRows.map((row) => [row.code, row]));

    let updated = 0;
    let skippedIssued = 0;
    let conflicts = 0;
    const toCreate: Array<{ exchangeHubId: string; code: string; status: string; source: string; issuedToEmail: string | null; createdAt?: Date }> = [];
    const emailUpdates: Array<{ id: string; email: string | null }> = [];
    for (const [code, entry] of prepared) {
      const existing = existingByCode.get(code);
      if (!existing) {
        toCreate.push({
          exchangeHubId,
          code,
          status: "RESERVED",
          source: "GRANDFATHERED",
          issuedToEmail: entry.email,
          ...(entry.purchasedAt ? { createdAt: entry.purchasedAt } : {})
        });
      } else if (existing.source !== "GRANDFATHERED") {
        conflicts += 1;
      } else if (existing.status === "RESERVED") {
        if (existing.issuedToEmail !== entry.email) emailUpdates.push({ id: existing.id, email: entry.email });
        updated += 1;
      } else {
        // Already claimed by a holder — never re-reserve to a different email.
        skippedIssued += 1;
      }
    }

    if (toCreate.length) await prisma.uenCodeInventory.createMany({ data: toCreate });
    for (const update of emailUpdates) {
      await prisma.uenCodeInventory.update({ where: { id: update.id }, data: { issuedToEmail: update.email } });
    }
    const created = toCreate.length;

    await audit({
      action: AuditAction.SYNC_EVENT,
      actorType: "admin",
      entityType: "ExchangeHub",
      entityId: exchangeHubId,
      message: `Grandfathered code import (${data.campaignId}): ${created} created, ${updated} updated, ${skippedIssued} already claimed, ${conflicts} conflicts`
    });
    res.status(201).json({ created, updated, skippedIssued, conflicts, mode: "bulk" });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/exchange-hubs/:exchangeHubId/code-inventory/sync", requireRole(writeRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const issuanceProductId = typeof req.body.issuanceProductId === "string" ? req.body.issuanceProductId : undefined;
    const codes = await prisma.uenCodeInventory.findMany({
      where: {
        exchangeHubId,
        status: "AVAILABLE",
        ...(issuanceProductId ? { issuanceProductId } : {})
      },
      take: 500,
      orderBy: { createdAt: "asc" }
    });
    const sync = await syncInventoryCodesToMerchantStores(exchangeHubId, codes);
    res.json({ selected: codes.length, sync });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/audit-logs", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
});

// ─── Portal token generation ───

router.post("/holders/:holderId/portal-token", requireRole(writeRoles), async (req, res) => {
  try {
    const holderId = param(req, "holderId");
    const holder = await prisma.holder.findUnique({ where: { id: holderId } });
    if (!holder) return res.status(404).json({ error: "Holder not found" });
    const token = holder.portalToken ?? crypto.randomBytes(24).toString("base64url");
    const updated = await prisma.holder.update({
      where: { id: holderId },
      data: { portalToken: token }
    });
    res.json({ portalToken: updated.portalToken, portalUrl: `/holder/portal?token=${token}` });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── Exchange Hub analytics ───

function periodStart(period: string) {
  const now = new Date();
  if (period === "day") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === "month") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
}

router.get("/exchange-hubs/:exchangeHubId/analytics", requireRole(adminRoles), async (req, res) => {
  try {
    const exchangeHubId = param(req, "exchangeHubId");
    const period = String(req.query.period ?? "month");
    const since = periodStart(period);

    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub) return res.status(404).json({ error: "Exchange Hub not found" });

    const [totalUens, totalHolders, issuedInPeriod, holdersInPeriod, redemptions] = await Promise.all([
      prisma.universalExchangeNote.count({ where: { exchangeHubId } }),
      prisma.holder.count({ where: { exchangeHubId } }),
      prisma.universalExchangeNote.count({ where: { exchangeHubId, issuedAt: { gte: since } } }),
      prisma.holder.count({ where: { exchangeHubId, createdAt: { gte: since } } }),
      prisma.shopifySyncedNote.findMany({
        where: {
          universalExchangeNote: { exchangeHubId },
          redeemedAt: { gte: since }
        },
        select: { redeemedOrderAmount: true, redeemedAt: true }
      })
    ]);

    const revenue = redemptions.reduce((sum, r) => sum + (r.redeemedOrderAmount ? Number(r.redeemedOrderAmount) : 0), 0);
    const uenValue = Number(hub.uenValue);

    res.json({
      hub: { id: hub.id, displayName: hub.displayName, uenValue },
      period,
      totalUens,
      totalHolders,
      issuedInPeriod,
      holdersInPeriod,
      redemptionsInPeriod: redemptions.length,
      revenueInPeriod: revenue,
      estimatedValue: totalUens * uenValue
    });
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/exchange-hubs/:exchangeHubId/uen-value", requireRole(writeRoles), async (req, res) => {
  try {
    const uenValue = Number(req.body.uenValue);
    if (isNaN(uenValue) || uenValue < 0) return res.status(400).json({ error: "Invalid uenValue" });
    const hub = await prisma.exchangeHub.update({
      where: { id: param(req, "exchangeHubId") },
      data: { uenValue }
    });
    res.json(hub);
  } catch (error) {
    handleError(res, error);
  }
});

// ─── Merchant analytics ───

router.get("/merchants/:merchantId/analytics", requireRole(adminRoles), async (req, res) => {
  try {
    const merchantId = param(req, "merchantId");
    const period = String(req.query.period ?? "month");
    const since = periodStart(period);

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });

    const [totalSynced, redemptionsInPeriod, allTimeRedemptions] = await Promise.all([
      prisma.shopifySyncedNote.count({ where: { merchantId, syncStatus: "SYNCED" } }),
      prisma.shopifySyncedNote.findMany({
        where: { merchantId, redeemedAt: { gte: since } },
        select: { redeemedOrderAmount: true, redeemedAt: true }
      }),
      prisma.shopifySyncedNote.count({ where: { merchantId, redeemedAt: { not: null } } })
    ]);

    const revenueInPeriod = redemptionsInPeriod.reduce(
      (sum, r) => sum + (r.redeemedOrderAmount ? Number(r.redeemedOrderAmount) : 0),
      0
    );

    res.json({
      merchant: { id: merchant.id, businessName: merchant.businessName },
      period,
      totalSyncedUens: totalSynced,
      allTimeRedemptions,
      redemptionsInPeriod: redemptionsInPeriod.length,
      revenueInPeriod
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── Portal banners ───

router.get("/banners", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.portalBanner.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] }));
});

router.post("/banners", requireRole(writeRoles), async (req, res) => {
  try {
    const { title, body, imageUrl, linkUrl, linkLabel, bgColor, textColor, targetScope, priority, startsAt, endsAt } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    const banner = await prisma.portalBanner.create({
      data: {
        title,
        body: body || undefined,
        imageUrl: imageUrl || undefined,
        linkUrl: linkUrl || undefined,
        linkLabel: linkLabel || undefined,
        bgColor: bgColor || "#1f6f5b",
        textColor: textColor || "#ffffff",
        targetScope: targetScope || "ALL",
        priority: Number(priority ?? 0),
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined
      }
    });
    res.status(201).json(banner);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/banners/:bannerId", requireRole(writeRoles), async (req, res) => {
  try {
    const { title, body, imageUrl, linkUrl, linkLabel, bgColor, textColor, targetScope, priority, status, startsAt, endsAt } = req.body;
    const banner = await prisma.portalBanner.update({
      where: { id: param(req, "bannerId") },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body: body || undefined }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || undefined }),
        ...(linkUrl !== undefined && { linkUrl: linkUrl || undefined }),
        ...(linkLabel !== undefined && { linkLabel: linkLabel || undefined }),
        ...(bgColor !== undefined && { bgColor }),
        ...(textColor !== undefined && { textColor }),
        ...(targetScope !== undefined && { targetScope }),
        ...(priority !== undefined && { priority: Number(priority) }),
        ...(status !== undefined && { status }),
        ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
        ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null })
      }
    });
    res.json(banner);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/banners/:bannerId", requireRole(writeRoles), async (req, res) => {
  try {
    await prisma.portalBanner.delete({ where: { id: param(req, "bannerId") } });
    res.json({ deleted: true });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── Push notifications ───

router.post("/notifications/send", requireRole(writeRoles), async (req, res) => {
  try {
    const { title, body, exchangeHubId, holderIds } = req.body;
    if (!title || !body) return res.status(400).json({ error: "title and body are required" });

    let targetHolders: { id: string }[] = [];

    if (holderIds && Array.isArray(holderIds) && holderIds.length > 0) {
      targetHolders = holderIds.map((id: string) => ({ id }));
    } else if (exchangeHubId) {
      targetHolders = await prisma.holder.findMany({
        where: { exchangeHubId, status: "ACTIVE" },
        select: { id: true }
      });
    } else {
      targetHolders = await prisma.holder.findMany({
        where: { status: "ACTIVE" },
        select: { id: true }
      });
    }

    const notifications = await Promise.all(
      targetHolders.map((h) =>
        prisma.holderNotification.create({
          data: { holderId: h.id, title, body }
        })
      )
    );

    res.status(201).json({ sent: notifications.length });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/notifications", requireRole(adminRoles), async (_req, res) => {
  res.json(
    await prisma.holderNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { holder: { select: { firstName: true, lastName: true, email: true } } }
    })
  );
});

router.get("/merchants/:merchantId/valid-uens", requireMerchantAccess(), async (req, res) => {
  const { merchant, offer, uens } = await getValidUensForMerchant(param(req, "merchantId"));
  if (!merchant) return res.status(404).json({ error: "Merchant not found or inactive" });
  res.json({
    merchant: { id: merchant.id, businessName: merchant.businessName, status: merchant.status },
    offer,
    uens: uens.map((uen) => ({
      id: uen.id,
      code: uen.code,
      exchangeHubId: uen.exchangeHubId,
      holderId: uen.holderId,
      status: uen.status,
      expiresAt: uen.expiresAt
    }))
  });
});

router.post("/uens/validate", requireMerchantAccess(), async (req, res) => {
  try {
    const data = validateUenSchema.parse(req.body);
    const result = await validateUenForMerchant(data.merchantId, data.code);
    res.json({
      valid: result.valid,
      reason: result.reason,
      offer: result.offer,
      uen: result.note
        ? { id: result.note.id, code: result.note.code, exchangeHubId: result.note.exchangeHubId, holderId: result.note.holderId }
        : null
    });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
