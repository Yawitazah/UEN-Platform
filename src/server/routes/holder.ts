import crypto from "node:crypto";
import express from "express";
import { prisma } from "../db";
import { claimReservedCodesForHolder } from "../services/grandfather";
import { syncCodesToGroupedShopifyDiscount } from "../services/sync";

const router = express.Router();

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

    const uens = holder.universalExchangeNotes.map((uen) => ({
      id: uen.id,
      code: uen.code,
      issuedAt: uen.issuedAt,
      expiresAt: uen.expiresAt,
      status: uen.status,
      redemptions: uen.syncedNotes.map((sn) => ({
        merchantId: sn.merchantId,
        merchantName: sn.merchant.businessName,
        shopDomain: sn.merchant.shopifyConnections[0]?.shopDomain ?? null,
        redeemed: sn.redeemedAt !== null,
        redeemedAt: sn.redeemedAt,
        redeemedOrderAmount: sn.redeemedOrderAmount ? Number(sn.redeemedOrderAmount) : null,
        syncStatus: sn.syncStatus
      }))
    }));

    res.json({
      holder: {
        id: holder.id,
        firstName: holder.firstName,
        lastName: holder.lastName,
        email: holder.email,
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
      ? await prisma.holder.findUnique({ where: { portalToken: token }, select: { firstName: true, lastName: true, email: true } })
      : null;
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });
    const hasName = Boolean(holder.firstName) && holder.firstName.trim().toLowerCase() !== "holder";
    res.json({
      firstName: hasName ? holder.firstName : null,
      lastName: holder.lastName || null,
      email: holder.email,
      registered: hasName
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
    const { firstName, lastName } = req.body as { firstName?: string; lastName?: string };
    const token = String(req.query.token ?? (req.body as { token?: string }).token ?? "");
    const holder = token ? await prisma.holder.findUnique({ where: { portalToken: token } }) : null;
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });
    if (!firstName || !firstName.trim()) return res.status(400).json({ error: "First name is required" });
    const updated = await prisma.holder.update({
      where: { id: holder.id },
      data: { firstName: firstName.trim(), lastName: (lastName ?? "").trim() }
    });
    res.json({ firstName: updated.firstName, lastName: updated.lastName, email: updated.email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update profile" });
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

// POST /api/holder/register  — self-registration
// Finds or creates a holder by (exchangeHubId + email), generates a portal token, returns the portal URL.
router.post("/holder/register", async (req, res) => {
  try {
    const { exchangeHubId, firstName, lastName, email } = req.body as {
      exchangeHubId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    if (!exchangeHubId || !email) {
      return res.status(400).json({ error: "exchangeHubId and email are required" });
    }

    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub || hub.status !== "ACTIVE") {
      return res.status(404).json({ error: "Exchange Hub not found or inactive" });
    }

    const { holder, token } = await findOrCreateHolderWithToken(exchangeHubId, email, firstName, lastName);

    const portalUrl = `/holder/portal?token=${token}`;
    res.status(201).json({
      portalToken: token,
      portalUrl,
      holder: {
        id: holder.id,
        firstName: holder.firstName,
        lastName: holder.lastName,
        email: holder.email,
        exchangeHub: hub.displayName
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not complete registration" });
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
    const { merchantId, email, firstName } = req.body as { merchantId?: string; email?: string; firstName?: string };
    if (!merchantId || !email) {
      return res.status(400).json({ error: "merchantId and email are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required" });
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

    const { holder, token } = await findOrCreateHolderWithToken(exchangeHubId, normalizedEmail, firstName);

    res.json({
      portalToken: token,
      holder: {
        id: holder.id,
        firstName: holder.firstName,
        lastName: holder.lastName,
        email: holder.email,
        exchangeHub: hub.displayName
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not complete login" });
  }
});

export default router;
