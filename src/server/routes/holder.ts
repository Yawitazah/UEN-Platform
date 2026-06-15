import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import express from "express";
import { prisma } from "../db";
import {
  createHolderLoginToken,
  verifyHolderLoginToken,
  createEmailChangeToken,
  verifyEmailChangeToken
} from "../security";
import { claimReservedCodesForHolder } from "../services/grandfather";
import { sendHolderLoginEmail, sendEmailChangeVerification } from "../services/mailer";
import { syncCodesToGroupedShopifyDiscount } from "../services/sync";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const router = express.Router();

// Lightweight in-memory rate limiter for the email-sending login endpoints.
// Keyed by IP: caps how often we'll fire verification emails so the endpoint
// can't be abused to spam an inbox or probe which emails have accounts. Single
// instance only, which matches the current Railway deployment.
const loginAttempts = new Map<string, number[]>();
function loginRateLimited(key: string, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const hits = (loginAttempts.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  loginAttempts.set(key, hits);
  return hits.length > max;
}

// Builds the public base URL (https://host) from the incoming request. With
// `trust proxy` enabled this honours Railway's X-Forwarded-Proto/Host headers.
function publicBaseUrl(req: express.Request) {
  return `${req.protocol}://${req.get("host")}`;
}

async function holderFromToken(token: string) {
  if (!token) return null;
  return prisma.holder.findUnique({
    where: { portalToken: token },
    include: {
      exchangeHub: true,
      universalExchangeNotes: {
        where: { status: "ACTIVE" },
        include: {
          syncedNotes: {
            include: {
              merchant: {
                include: {
                  shopifyConnections: { where: { status: "ACTIVE" }, take: 1 }
                }
              }
            }
          }
        }
      }
    }
  });
}

// GET /api/holder/wallet?token=...
router.get("/holder/wallet", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");

    // Claim any grandfathered codes reserved for this holder's email before the
    // heavy wallet query, so legacy purchases appear the moment they log in.
    // No-op cost is a single indexed lookup.
    const lightHolder = token
      ? await prisma.holder.findUnique({
          where: { portalToken: token },
          select: { id: true, email: true, exchangeHubId: true }
        })
      : null;
    if (lightHolder) {
      await claimReservedCodesForHolder(lightHolder);
    }

    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Holder not found or invalid portal token" });

    const notifications = await prisma.holderNotification.findMany({
      where: { holderId: holder.id },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    // Estimated value comes from live merchant offers, not a fixed hub figure.
    // A note can be redeemed once at EACH merchant, so a note's potential is
    // the sum of offer values across merchants where it hasn't been used yet.
    // PERCENTAGE offers are valued against a $100 spend cap so they translate
    // to an understandable dollar estimate (15% -> $15).
    const PERCENT_SPEND_CAP = 100;
    const offerMerchants = await prisma.merchant.findMany({
      where: {
        status: "ACTIVE",
        accessRules: { some: { exchangeHubId: holder.exchangeHubId, status: "ACTIVE" } }
      },
      include: { offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 } }
    });
    const offerValue = (offer: { discountType: string; discountValue: unknown } | undefined | null) => {
      if (!offer || offer.discountValue == null) return 0;
      const value = Number(offer.discountValue);
      if (!Number.isFinite(value) || value <= 0) return 0;
      if (offer.discountType === "PERCENTAGE") return Math.min(value, 100) * (PERCENT_SPEND_CAP / 100);
      if (offer.discountType === "FIXED_AMOUNT") return value;
      return 0;
    };
    const merchantValues = new Map(offerMerchants.map((m) => [m.id, offerValue(m.offers[0])]));

    const uens = holder.universalExchangeNotes.map((uen) => {
      const redeemedMerchantIds = new Set(uen.syncedNotes.filter((sn) => sn.redeemedAt !== null).map((sn) => sn.merchantId));
      const estimatedValue = uen.status === "ACTIVE"
        ? [...merchantValues.entries()].reduce((sum, [merchantId, value]) => sum + (redeemedMerchantIds.has(merchantId) ? 0 : value), 0)
        : 0;
      return {
        id: uen.id,
        code: uen.code,
        issuedAt: uen.issuedAt,
        expiresAt: uen.expiresAt,
        status: uen.status,
        estimatedValue: Math.round(estimatedValue * 100) / 100,
        redemptions: uen.syncedNotes.map((sn) => ({
          merchantId: sn.merchantId,
          merchantName: sn.merchant.businessName,
          shopDomain: sn.merchant.shopifyConnections[0]?.shopDomain ?? null,
          redeemed: sn.redeemedAt !== null,
          redeemedAt: sn.redeemedAt,
          redeemedOrderAmount: sn.redeemedOrderAmount ? Number(sn.redeemedOrderAmount) : null,
          syncStatus: sn.syncStatus
        }))
      };
    });
    const estimatedTotalValue = Math.round(uens.reduce((sum, u) => sum + (u.estimatedValue ?? 0), 0) * 100) / 100;

    res.json({
      holder: {
        id: holder.id,
        firstName: holder.firstName,
        lastName: holder.lastName,
        email: holder.email,
        phone: holder.phone ?? null,
        hasPassword: Boolean(holder.passwordHash),
        exchangeHub: {
          id: holder.exchangeHub.id,
          displayName: holder.exchangeHub.displayName,
          hubType: holder.exchangeHub.hubType,
          logoUrl: holder.exchangeHub.logoUrl,
          brandColor: holder.exchangeHub.brandColor,
          uenValue: Number(holder.exchangeHub.uenValue)
        }
      },
      uens,
      estimatedTotalValue,
      participatingMerchants: offerMerchants.length,
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load wallet data" });
  }
});

// GET /api/holder/profile?token=...  — minimal identity for the widget greeting.
// `registered` is false when the holder was auto-created (placeholder name) and
// hasn't completed their profile yet.
router.get("/holder/profile", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = token
      ? await prisma.holder.findUnique({
          where: { portalToken: token },
          select: { firstName: true, lastName: true, email: true, phone: true }
        })
      : null;
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });
    const hasName = Boolean(holder.firstName) && holder.firstName.trim().toLowerCase() !== "holder";
    const hasPhone = Boolean(holder.phone && holder.phone.trim());
    res.json({
      firstName: hasName ? holder.firstName : null,
      lastName: holder.lastName || null,
      email: holder.email,
      phone: holder.phone || null,
      registered: hasName,
      // Full access to redemption features requires a verified name AND phone.
      complete: hasName && hasPhone
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load profile" });
  }
});

// POST /api/holder/profile  — holder completes their profile (name) from the
// dashboard. Identified by their portal token; no separate password needed.
router.post("/holder/profile", async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body as { firstName?: string; lastName?: string; phone?: string };
    const token = String(req.query.token ?? (req.body as { token?: string }).token ?? "");
    const holder = token ? await prisma.holder.findUnique({ where: { portalToken: token } }) : null;
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });
    if (!firstName || !firstName.trim()) return res.status(400).json({ error: "First name is required" });
    const cleanPhone = (phone ?? "").replace(/[^\d+()\-\s.]/g, "").trim();
    if (!cleanPhone || cleanPhone.replace(/\D/g, "").length < 7) {
      return res.status(400).json({ error: "A valid phone number is required" });
    }
    const updated = await prisma.holder.update({
      where: { id: holder.id },
      data: { firstName: firstName.trim(), lastName: (lastName ?? "").trim(), phone: cleanPhone }
    });
    res.json({ firstName: updated.firstName, lastName: updated.lastName, email: updated.email, phone: updated.phone });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update profile" });
  }
});

// POST /api/holder/password  — set or change the holder's password.
// Identified by their portal token (i.e. already signed in). When a password is
// already set, the current one is required to change it.
router.post("/holder/password", async (req, res) => {
  try {
    const token = String(req.query.token ?? (req.body as { token?: string }).token ?? "");
    const holder = token ? await prisma.holder.findUnique({ where: { portalToken: token } }) : null;
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (holder.passwordHash) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, holder.passwordHash))) {
        return res.status(403).json({ error: "Current password is incorrect" });
      }
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.holder.update({ where: { id: holder.id }, data: { passwordHash } });
    res.json({ ok: true, hasPassword: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update password" });
  }
});

// POST /api/holder/login-password  — email + password sign-in.
// Hub is resolved the same way as the magic-link flow: an explicit hub, a
// merchant's hubs (widget), or the email's own hub. Only matches holders who
// have actually set a password. Errors are deliberately generic.
router.post("/holder/login-password", async (req, res) => {
  try {
    const { email, password, exchangeHubId, merchantId } = req.body as {
      email?: string;
      password?: string;
      exchangeHubId?: string;
      merchantId?: string;
    };
    const normalizedEmail = (email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail) || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const ip = req.ip ?? "unknown";
    if (loginRateLimited(`pw:${ip}`)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }

    let candidateHubIds: string[] = [];
    if (exchangeHubId) {
      candidateHubIds = [exchangeHubId];
    } else if (merchantId) {
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        include: { accessRules: { where: { status: "ACTIVE" } } }
      });
      if (merchant) {
        candidateHubIds = [
          ...new Set([
            ...merchant.accessRules.map((r) => r.exchangeHubId),
            ...(merchant.linkedExchangeHubId ? [merchant.linkedExchangeHubId] : [])
          ])
        ];
      }
    } else {
      const hub = await resolveHubForEmail(normalizedEmail);
      if (hub) candidateHubIds = [hub];
    }

    const holder = candidateHubIds.length
      ? await prisma.holder.findFirst({
          where: {
            email: normalizedEmail,
            exchangeHubId: { in: candidateHubIds },
            status: "ACTIVE",
            passwordHash: { not: null }
          },
          orderBy: { createdAt: "asc" }
        })
      : null;

    if (!holder || !holder.passwordHash || !(await bcrypt.compare(password, holder.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password. You can request a sign-in link instead." });
    }

    const portalToken = holder.portalToken ?? crypto.randomBytes(24).toString("base64url");
    if (!holder.portalToken) {
      await prisma.holder.update({ where: { id: holder.id }, data: { portalToken } });
    }
    res.json({ portalToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not sign in" });
  }
});

// POST /api/holder/request-email-change  — emails a confirmation link to the
// NEW address. The email only switches once that link is clicked, so a wallet
// can't be hijacked by changing it to an address the holder doesn't control.
router.post("/holder/request-email-change", async (req, res) => {
  try {
    const token = String(req.query.token ?? (req.body as { token?: string }).token ?? "");
    const holder = token ? await prisma.holder.findUnique({ where: { portalToken: token } }) : null;
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const newEmail = String((req.body as { newEmail?: string }).newEmail ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ error: "A valid email address is required" });
    if (newEmail === holder.email) return res.status(400).json({ error: "That's already your email." });

    const ip = req.ip ?? "unknown";
    if (loginRateLimited(`emailchange:${ip}`)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }

    const clash = await prisma.holder.findUnique({
      where: { exchangeHubId_email: { exchangeHubId: holder.exchangeHubId, email: newEmail } }
    });
    if (clash) return res.status(409).json({ error: "That email is already in use on this Exchange Hub." });

    const changeToken = createEmailChangeToken({ holderId: holder.id, newEmail });
    const link = `${publicBaseUrl(req)}/api/holder/verify-email-change?t=${encodeURIComponent(changeToken)}`;
    await sendEmailChangeVerification(newEmail, link);

    res.json({ sent: true, newEmail });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not start the email change" });
  }
});

// GET /api/holder/verify-email-change?t=...  — confirms and applies the new
// email, then drops the holder back into their portal.
router.get("/holder/verify-email-change", async (req, res) => {
  try {
    const parsed = verifyEmailChangeToken(String(req.query.t ?? ""));
    if (!parsed) return res.redirect("/holder/register?emailChange=expired");
    const holder = await prisma.holder.findUnique({ where: { id: parsed.holderId } });
    if (!holder) return res.redirect("/holder/register?emailChange=expired");

    const clash = await prisma.holder.findUnique({
      where: { exchangeHubId_email: { exchangeHubId: holder.exchangeHubId, email: parsed.newEmail } }
    });
    const portalToken = holder.portalToken ?? crypto.randomBytes(24).toString("base64url");
    if (clash && clash.id !== holder.id) {
      if (!holder.portalToken) await prisma.holder.update({ where: { id: holder.id }, data: { portalToken } });
      return res.redirect(`/holder/portal?token=${encodeURIComponent(portalToken)}&emailChange=taken`);
    }
    await prisma.holder.update({ where: { id: holder.id }, data: { email: parsed.newEmail, portalToken } });
    return res.redirect(`/holder/portal?token=${encodeURIComponent(portalToken)}&emailChange=success`);
  } catch (error) {
    console.error(error);
    return res.redirect("/holder/register?emailChange=expired");
  }
});

// GET /api/holder/merchants?token=...
router.get("/holder/merchants", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const merchants = await prisma.merchant.findMany({
      where: {
        status: "ACTIVE",
        accessRules: { some: { exchangeHubId: holder.exchangeHubId, status: "ACTIVE" } }
      },
      include: {
        offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
        shopifyConnections: { where: { status: "ACTIVE" }, take: 1 }
      }
    });

    const holderUenIds = holder.universalExchangeNotes.map((uen) => uen.id);
    const allSyncedNotes = holderUenIds.length > 0
      ? await prisma.shopifySyncedNote.findMany({
          where: { universalExchangeNoteId: { in: holderUenIds } }
        })
      : [];

    const result = merchants.map((merchant) => {
      const merchantSynced = allSyncedNotes.filter((sn) => sn.merchantId === merchant.id);
      const redeemedCount = merchantSynced.filter((sn) => sn.redeemedAt !== null).length;
      const availableCount = merchantSynced.filter((sn) => sn.redeemedAt === null && sn.syncStatus === "SYNCED").length;
      const offer = merchant.offers[0] ?? null;

      return {
        id: merchant.id,
        businessName: merchant.businessName,
        offer: offer
          ? {
              discountType: offer.discountType,
              discountValue: offer.discountValue ? Number(offer.discountValue) : null,
              minimumOrderAmount: offer.minimumOrderAmount ? Number(offer.minimumOrderAmount) : null,
              usageLimitPerNote: offer.usageLimitPerNote
            }
          : null,
        shopDomain: merchant.shopifyConnections[0]?.shopDomain ?? null,
        shopUrl: merchant.shopifyConnections[0]
          ? `https://${merchant.shopifyConnections[0].shopDomain}`
          : null,
        redeemedUens: redeemedCount,
        availableUens: availableCount,
        totalSyncedUens: merchantSynced.length
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load merchant list" });
  }
});

// GET /api/holder/banners?token=...
router.get("/holder/banners", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = token
      ? await prisma.holder.findUnique({ where: { portalToken: token } })
      : null;

    const now = new Date();
    const banners = await prisma.portalBanner.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          {
            OR: [
              { targetScope: "ALL" },
              ...(holder ? [{ targetScope: holder.exchangeHubId }] : [])
            ]
          }
        ]
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 5
    });

    res.json(banners);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load banners" });
  }
});

// POST /api/holder/notifications/:id/read?token=...
router.post("/holder/notifications/:id/read", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await prisma.holder.findUnique({ where: { portalToken: token } });
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const notif = await prisma.holderNotification.findFirst({
      where: { id: req.params.id, holderId: holder.id }
    });
    if (!notif) return res.status(404).json({ error: "Notification not found" });

    const updated = await prisma.holderNotification.update({
      where: { id: notif.id },
      data: { readAt: new Date() }
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not mark notification as read" });
  }
});

// POST /api/holder/redeem — on-demand discount code generation at a merchant
// Mode "AUTO" returns an auto-apply checkout URL; mode "MANUAL" returns the code to paste.
// One UEN is depleted per merchant per call — cross-merchant reuse is preserved.
router.post("/holder/redeem", async (req, res) => {
  try {
    const token = String(req.query.token ?? req.body.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const { merchantId, mode = "AUTO" } = req.body as { merchantId?: string; mode?: "AUTO" | "MANUAL" };
    if (!merchantId) return res.status(400).json({ error: "merchantId is required" });

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
        shopifyConnections: { where: { status: "ACTIVE" }, take: 1 },
        accessRules: { where: { status: "ACTIVE" } }
      }
    });
    if (!merchant || merchant.status !== "ACTIVE") {
      return res.status(404).json({ error: "Merchant not found or inactive" });
    }

    const offer = merchant.offers[0];
    if (!offer) return res.status(400).json({ error: "Merchant has no active offer" });

    const connection = merchant.shopifyConnections[0];
    if (!connection) return res.status(400).json({ error: "Merchant Shopify store not connected" });

    // Check holder's hub is allowed at this merchant
    const hubAllowed = merchant.accessRules.some((rule) => rule.exchangeHubId === holder.exchangeHubId);
    if (!hubAllowed) return res.status(403).json({ error: "Your exchange hub is not authorized for this merchant" });

    const holderUenIds = holder.universalExchangeNotes.map((u) => u.id);
    if (!holderUenIds.length) return res.status(400).json({ error: "You have no active UENs" });

    // Find a UEN that has NOT yet been redeemed at this merchant
    const alreadyRedeemedUenIds = await prisma.shopifySyncedNote.findMany({
      where: { merchantId, universalExchangeNoteId: { in: holderUenIds }, redeemedAt: { not: null } },
      select: { universalExchangeNoteId: true }
    });
    const redeemedSet = new Set(alreadyRedeemedUenIds.map((r) => r.universalExchangeNoteId));
    const availableUen = holder.universalExchangeNotes.find((u) => !redeemedSet.has(u.id));
    if (!availableUen) return res.status(400).json({ error: "All your UENs have already been used at this merchant" });

    // Check if a code was already synced (pre-loaded) for this UEN at this merchant
    const existingSynced = await prisma.shopifySyncedNote.findUnique({
      where: { merchantId_universalExchangeNoteId: { merchantId, universalExchangeNoteId: availableUen.id } }
    });

    let discountCode: string;
    let shopifyDiscountId: string | null = null;

    if (existingSynced?.syncStatus === "SYNCED" && existingSynced.uenCode) {
      discountCode = existingSynced.uenCode;
      shopifyDiscountId = existingSynced.shopifyDiscountId ?? null;
    } else {
      // Create the discount code on demand in Shopify
      const syncResult = await syncCodesToGroupedShopifyDiscount({
        connection: {
          merchantId,
          shopDomain: connection.shopDomain,
          accessToken: connection.accessToken,
          merchantName: merchant.businessName
        },
        offer,
        codes: [{ id: availableUen.id, code: availableUen.code, kind: "note" }]
      });
      if (syncResult.errors > 0) {
        return res.status(502).json({ error: "Could not create discount code in Shopify" });
      }
      discountCode = availableUen.code;
      const syncedRecord = await prisma.shopifySyncedNote.findUnique({
        where: { merchantId_universalExchangeNoteId: { merchantId, universalExchangeNoteId: availableUen.id } }
      });
      shopifyDiscountId = syncedRecord?.shopifyDiscountId ?? null;
    }

    const shopDomain = connection.shopDomain;
    const autoApplyUrl = `https://${shopDomain}/discount/${encodeURIComponent(discountCode)}?redirect=/`;

    return res.json({
      code: discountCode,
      uenId: availableUen.id,
      mode,
      shopDomain,
      autoApplyUrl: mode === "AUTO" ? autoApplyUrl : null,
      discountValue: offer.discountValue ? Number(offer.discountValue) : null,
      discountType: offer.discountType
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not process redemption" });
  }
});

// Upserts a holder by (exchangeHubId + email), ensures a portal token exists,
// and claims any grandfathered codes reserved for the email so they're already
// in the wallet on the first dashboard render. Shared by register + widget login.
async function findOrCreateHolderWithToken(exchangeHubId: string, email: string, firstName?: string, lastName?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const holder = await prisma.holder.upsert({
    where: { exchangeHubId_email: { exchangeHubId, email: normalizedEmail } },
    update: {
      // Only update name if provided and the existing record has placeholder values
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {})
    },
    create: {
      exchangeHubId,
      email: normalizedEmail,
      firstName: firstName?.trim() || "Holder",
      lastName: lastName?.trim() || "",
      status: "ACTIVE"
    }
  });

  const token = holder.portalToken ?? crypto.randomBytes(24).toString("base64url");
  if (!holder.portalToken) {
    await prisma.holder.update({
      where: { id: holder.id },
      data: { portalToken: token }
    });
  }

  await claimReservedCodesForHolder({ id: holder.id, email: normalizedEmail, exchangeHubId });

  return { holder, token };
}

// Resolves which Exchange Hub a website visitor's email belongs to when they
// didn't (or couldn't) pick one. An existing account with active notes wins,
// then a grandfathered reservation, then any existing account. Returns null
// when it genuinely can't tell — the caller then asks them to choose a hub.
async function resolveHubForEmail(email: string): Promise<string | null> {
  const holderWithNotes = await prisma.holder.findFirst({
    where: { email, status: "ACTIVE", universalExchangeNotes: { some: { status: "ACTIVE" } } },
    orderBy: { createdAt: "asc" }
  });
  if (holderWithNotes) return holderWithNotes.exchangeHubId;

  const reservation = await prisma.uenCodeInventory.findFirst({
    where: { status: "RESERVED", source: "GRANDFATHERED", issuedToEmail: email }
  });
  if (reservation) return reservation.exchangeHubId;

  const existingHolder = await prisma.holder.findFirst({
    where: { email, status: "ACTIVE" },
    orderBy: { createdAt: "asc" }
  });
  return existingHolder?.exchangeHubId ?? null;
}

// POST /api/holder/register  — website sign-in request.
// Resolves the holder's Exchange Hub, then emails a one-time sign-in link
// instead of handing back wallet access. The wallet only opens once the link
// in that email is clicked (see GET /holder/verify), which proves the person
// actually owns the inbox. The response is intentionally the same whether or
// not the email matched an account, so it can't be used to probe who has one.
router.post("/holder/register", async (req, res) => {
  try {
    const { exchangeHubId, email } = req.body as { exchangeHubId?: string; email?: string };

    const normalizedEmail = (email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const ip = req.ip ?? "unknown";
    if (loginRateLimited(`reg:${ip}`)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }

    // Use the chosen hub when valid; otherwise try to resolve it from the email.
    let resolvedHubId: string | null = null;
    if (exchangeHubId) {
      const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
      if (!hub || hub.status !== "ACTIVE") {
        return res.status(404).json({ error: "Exchange Hub not found or inactive" });
      }
      resolvedHubId = exchangeHubId;
    } else {
      resolvedHubId = await resolveHubForEmail(normalizedEmail);
    }

    if (!resolvedHubId) {
      return res.status(400).json({
        error: "Please select where you got your notes from so we can find your wallet.",
        needsHub: true
      });
    }

    const hub = await prisma.exchangeHub.findUnique({ where: { id: resolvedHubId } });
    if (!hub || hub.status !== "ACTIVE") {
      return res.status(404).json({ error: "Exchange Hub not found or inactive" });
    }

    const loginToken = createHolderLoginToken({ email: normalizedEmail, exchangeHubId: resolvedHubId });
    const link = `${publicBaseUrl(req)}/api/holder/verify?lt=${encodeURIComponent(loginToken)}`;
    await sendHolderLoginEmail(normalizedEmail, link, hub.displayName);

    res.status(200).json({ sent: true, email: normalizedEmail });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not send your sign-in link" });
  }
});

// GET /api/holder/verify?lt=...  — opens the wallet from a magic link.
// Validates the signed, time-limited token from the email, then creates/loads
// the holder and redirects into the portal with their portal token. Invalid or
// expired links bounce back to the sign-in page with a friendly flag.
router.get("/holder/verify", async (req, res) => {
  try {
    const parsed = verifyHolderLoginToken(String(req.query.lt ?? ""));
    if (!parsed) {
      return res.redirect("/holder/register?expired=1");
    }
    const hub = await prisma.exchangeHub.findUnique({ where: { id: parsed.exchangeHubId } });
    if (!hub || hub.status !== "ACTIVE") {
      return res.redirect("/holder/register?expired=1");
    }
    const { token } = await findOrCreateHolderWithToken(parsed.exchangeHubId, parsed.email);
    return res.redirect(`/holder/portal?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error(error);
    return res.redirect("/holder/register?expired=1");
  }
});

// GET /api/public/widget-config?shop=store.myshopify.com — resolves the
// merchant for the theme app extension, which only knows the shop domain.
router.get("/public/widget-config", async (req, res) => {
  try {
    const shop = String(req.query.shop ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({ error: "A valid shop domain is required" });
    }
    const connection = await prisma.shopifyConnection.findUnique({
      where: { shopDomain: shop },
      include: { merchant: true }
    });
    if (!connection || connection.status !== "ACTIVE" || connection.merchant.status !== "ACTIVE") {
      return res.status(404).json({ error: "Store is not connected to the UEN network" });
    }
    res.json({ merchantId: connection.merchantId, businessName: connection.merchant.businessName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load widget configuration" });
  }
});

// POST /api/holder/widget-login — email login from the merchant-site widget.
// The widget only knows the merchant, so the hub is resolved server-side:
// an existing holder account wins, then a grandfathered code reservation,
// then the merchant's only connected hub. Unknown emails get nothing —
// that's what keeps grandfathered codes locked to the original purchaser.
router.post("/holder/widget-login", async (req, res) => {
  try {
    const { merchantId, email } = req.body as { merchantId?: string; email?: string };
    if (!merchantId || !email) {
      return res.status(400).json({ error: "merchantId and email are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const ip = req.ip ?? "unknown";
    if (loginRateLimited(`widget:${ip}`)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { accessRules: { where: { status: "ACTIVE" } } }
    });
    if (!merchant || merchant.status !== "ACTIVE") {
      return res.status(404).json({ error: "Merchant not found" });
    }
    const candidateHubIds = [
      ...new Set([
        ...merchant.accessRules.map((rule) => rule.exchangeHubId),
        ...(merchant.linkedExchangeHubId ? [merchant.linkedExchangeHubId] : [])
      ])
    ];
    if (!candidateHubIds.length) {
      return res.status(404).json({ error: "This store is not connected to any Exchange Hub yet" });
    }

    // 1. A holder account in a candidate hub that actually holds active notes.
    const holderWithNotes = await prisma.holder.findFirst({
      where: {
        email: normalizedEmail,
        exchangeHubId: { in: candidateHubIds },
        status: "ACTIVE",
        universalExchangeNotes: { some: { status: "ACTIVE" } }
      },
      orderBy: { createdAt: "asc" }
    });
    // 2. A hub holding a grandfathered code reserved for this email — beats an
    //    empty account in another hub, so legacy purchasers land where their
    //    codes are even if they once registered elsewhere.
    const reservation = holderWithNotes
      ? null
      : await prisma.uenCodeInventory.findFirst({
          where: {
            exchangeHubId: { in: candidateHubIds },
            status: "RESERVED",
            source: "GRANDFATHERED",
            issuedToEmail: normalizedEmail
          }
        });
    // 3. Any existing (possibly empty) holder account in a candidate hub.
    const existingHolder =
      holderWithNotes || reservation
        ? null
        : await prisma.holder.findFirst({
            where: { email: normalizedEmail, exchangeHubId: { in: candidateHubIds }, status: "ACTIVE" },
            orderBy: { createdAt: "asc" }
          });
    // 4. Unambiguous fallback: the merchant accepts exactly one hub.
    const exchangeHubId =
      holderWithNotes?.exchangeHubId ??
      reservation?.exchangeHubId ??
      existingHolder?.exchangeHubId ??
      (candidateHubIds.length === 1 ? candidateHubIds[0] : null);
    if (!exchangeHubId) {
      return res.status(404).json({ error: "No UEN account or reserved notes found for this email" });
    }

    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub || hub.status !== "ACTIVE") {
      return res.status(404).json({ error: "Exchange Hub not found or inactive" });
    }

    // Don't hand back wallet access from an email alone — email a one-time
    // sign-in link and let clicking it (i.e. owning the inbox) prove identity.
    const loginToken = createHolderLoginToken({ email: normalizedEmail, exchangeHubId });
    const link = `${publicBaseUrl(req)}/api/holder/verify?lt=${encodeURIComponent(loginToken)}`;
    await sendHolderLoginEmail(normalizedEmail, link, hub.displayName);

    res.json({ sent: true, email: normalizedEmail });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not send your sign-in link" });
  }
});

// POST /api/holder/widget-recognize — storefront teaser only.
// Given a merchant + email, reports whether the email has notes and how many,
// WITHOUT logging anyone in or exposing the dashboard. The widget renders the
// count blurred; real access requires completing the verified registration
// flow. Returns the resolved hub so the widget can deep-link to /holder/register.
router.post("/holder/widget-recognize", async (req, res) => {
  try {
    const { merchantId, email } = req.body as { merchantId?: string; email?: string };
    if (!merchantId || !email) return res.status(400).json({ error: "merchantId and email are required" });
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) return res.status(400).json({ error: "A valid email address is required" });

    const ip = req.ip ?? "unknown";
    if (loginRateLimited(`recognize:${ip}`, 12)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { accessRules: { where: { status: "ACTIVE" } } }
    });
    if (!merchant || merchant.status !== "ACTIVE") return res.status(404).json({ error: "Merchant not found" });

    const candidateHubIds = [
      ...new Set([
        ...merchant.accessRules.map((r) => r.exchangeHubId),
        ...(merchant.linkedExchangeHubId ? [merchant.linkedExchangeHubId] : [])
      ])
    ];
    if (!candidateHubIds.length) {
      return res.json({ recognized: false, count: 0, exchangeHubId: null });
    }

    let count = 0;
    let exchangeHubId: string | null = null;

    const holder = await prisma.holder.findFirst({
      where: { email: normalizedEmail, exchangeHubId: { in: candidateHubIds }, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });
    if (holder) {
      exchangeHubId = holder.exchangeHubId;
      count = await prisma.universalExchangeNote.count({ where: { holderId: holder.id, status: "ACTIVE" } });
    }

    // Grandfathered codes reserved for this email but not yet claimed.
    const reservedCount = await prisma.uenCodeInventory.count({
      where: { exchangeHubId: { in: candidateHubIds }, status: "RESERVED", source: "GRANDFATHERED", issuedToEmail: normalizedEmail }
    });
    const total = count + reservedCount;

    if (!exchangeHubId) {
      const reservation = total > 0
        ? await prisma.uenCodeInventory.findFirst({
            where: { exchangeHubId: { in: candidateHubIds }, status: "RESERVED", source: "GRANDFATHERED", issuedToEmail: normalizedEmail }
          })
        : null;
      exchangeHubId = reservation?.exchangeHubId ?? (candidateHubIds.length === 1 ? candidateHubIds[0] : null);
    }

    res.json({ recognized: total > 0, count: total, exchangeHubId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not check this email" });
  }
});

export default router;
