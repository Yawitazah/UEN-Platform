import type { Router } from "express";
import express from "express";
import { ZodError } from "zod";
import { audit } from "../audit";
import { AdminRole, AuditAction, HubStatus, UenStatus } from "../constants";
import { prisma } from "../db";
import { requireMerchantAccess, requireRole } from "../security";
import { getValidUensForMerchant, validateUenForMerchant } from "../services/uens";
import {
  createAccessRuleSchema,
  createHolderSchema,
  createHubSchema,
  createMerchantSchema,
  createOfferSchema,
  createUenSchema,
  validateUenSchema
} from "../validators";

const router: Router = express.Router();
const adminRoles = [AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.SUPPORT];
const writeRoles = [AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS];

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
    const existing = await prisma.universalExchangeNote.findUnique({ where: { code } });
    if (!existing) return code;
  }

  throw new Error("Could not generate a unique UEN code");
}

function publicConnection(connection: { accessToken: string; [key: string]: unknown }) {
  const { accessToken: _accessToken, ...safe } = connection;
  return safe;
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

router.get("/exchange-hubs", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.exchangeHub.findMany({ orderBy: { createdAt: "desc" } }));
});

router.post("/exchange-hubs", requireRole(writeRoles), async (req, res) => {
  try {
    const data = createHubSchema.parse(req.body);
    const hub = await prisma.exchangeHub.create({
      data: { ...data, logoUrl: data.logoUrl || undefined }
    });
    res.status(201).json(hub);
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
        code: data.code?.toUpperCase() ?? (await generatedCode(data.codePrefix)),
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
    res.status(201).json(note);
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

router.get("/audit-logs", requireRole(adminRoles), async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
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
