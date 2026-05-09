import crypto from "node:crypto";
import express from "express";
import { prisma } from "../db";

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

    const normalizedEmail = email.trim().toLowerCase();
    const hub = await prisma.exchangeHub.findUnique({ where: { id: exchangeHubId } });
    if (!hub || hub.status !== "ACTIVE") {
      return res.status(404).json({ error: "Exchange Hub not found or inactive" });
    }

    // Find or create the holder
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

    // Generate portal token if missing
    const token = holder.portalToken ?? crypto.randomBytes(24).toString("base64url");
    if (!holder.portalToken) {
      await prisma.holder.update({
        where: { id: holder.id },
        data: { portalToken: token }
      });
    }

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

export default router;
