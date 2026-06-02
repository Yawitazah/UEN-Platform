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
import { requireMerchantAccess, requireRole } from "../security";
import { syncCodesToGroupedShopifyDiscount, syncNewUensToEligibleShopifyStores } from "../services/sync";
import { getValidUensForMerchant, validateUenForMerchant } from "../services/uens";
import {
  createAccessRuleSchema,
  bulkGenerateCodesSchema,
  bulkImportCodesSchema,
  createHolderSchema,
  createHubSchema,
  createIssuanceProductSchema,
  createMerchantSchema,
  createOfferSchema,
  merchantOnboardingSchema,
  createUenSchema,
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

router.post("/merchants", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createMerchantSchema.parse(req.body);
    const merchant = await prisma.merchant.create({ data });
    res.status(201).json(merchant);
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
    const deleted = await prisma.merchantHistoricalRedemption.deleteMany({
      where: { shopDomain, merchantId: connection.merchantId }
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
