import { AuditAction } from "../constants";
import { audit } from "../audit";
import { prisma } from "../db";
import { getValidUensForMerchant } from "./uens";
import { createShopifyDiscountCode } from "./shopifyGraphql";

export async function syncMerchantUensToShopify(merchantId: string, shopDomain: string, syncType = "MANUAL") {
  const connection = await prisma.shopifyConnection.findFirst({
    where: { merchantId, shopDomain, status: "ACTIVE" }
  });
  if (!connection) throw new Error("Active Shopify connection not found");

  const { offer, uens } = await getValidUensForMerchant(merchantId);
  if (!offer) throw new Error("Merchant has no active offer");
  if (offer.discountType !== "PERCENTAGE" && offer.discountType !== "FIXED_AMOUNT") {
    throw new Error("Shopify sync currently supports PERCENTAGE and FIXED_AMOUNT offers");
  }

  const allowedIds = new Set(uens.map((uen) => uen.id));
  const previouslySynced = await prisma.shopifySyncedNote.findMany({ where: { merchantId, shopDomain } });
  const inactive = previouslySynced.filter((row) => !allowedIds.has(row.universalExchangeNoteId));
  if (inactive.length) {
    await prisma.shopifySyncedNote.updateMany({
      where: { id: { in: inactive.map((row) => row.id) } },
      data: { syncStatus: "INACTIVE", errorMessage: "No longer valid or allowed by central platform" }
    });
  }

  let totalCreated = 0;
  let totalUpdated = inactive.length;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const uen of uens) {
    const existing = previouslySynced.find((row) => row.universalExchangeNoteId === uen.id);
    if (existing?.syncStatus === "SYNCED") {
      totalSkipped += 1;
      continue;
    }

    try {
      const result = await createShopifyDiscountCode({
        shopDomain,
        accessToken: connection.accessToken,
        code: uen.code,
        title: `${uen.code} Universal Exchange Note`,
        discountType: offer.discountType,
        discountValue: Number(offer.discountValue ?? 0),
        usageLimitPerNote: offer.usageLimitPerNote,
        minimumOrderAmount: offer.minimumOrderAmount ? Number(offer.minimumOrderAmount) : undefined,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt
      });

      await prisma.shopifySyncedNote.upsert({
        where: { merchantId_universalExchangeNoteId: { merchantId, universalExchangeNoteId: uen.id } },
        update: {
          shopDomain,
          uenCode: uen.code,
          shopifyDiscountId: result.shopifyDiscountId,
          shopifyDiscountCodeId: result.shopifyDiscountCodeId,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          errorMessage: null
        },
        create: {
          merchantId,
          shopDomain,
          universalExchangeNoteId: uen.id,
          uenCode: uen.code,
          shopifyDiscountId: result.shopifyDiscountId,
          shopifyDiscountCodeId: result.shopifyDiscountCodeId,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date()
        }
      });
      totalCreated += existing ? 0 : 1;
      totalUpdated += existing ? 1 : 0;
    } catch (error) {
      totalErrors += 1;
      await prisma.shopifySyncedNote.upsert({
        where: { merchantId_universalExchangeNoteId: { merchantId, universalExchangeNoteId: uen.id } },
        update: {
          shopDomain,
          uenCode: uen.code,
          syncStatus: "ERROR",
          lastSyncedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown sync error"
        },
        create: {
          merchantId,
          shopDomain,
          universalExchangeNoteId: uen.id,
          uenCode: uen.code,
          syncStatus: "ERROR",
          lastSyncedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown sync error"
        }
      });
    }
  }

  const status = totalErrors === 0 ? "SUCCESS" : totalCreated + totalUpdated > 0 ? "PARTIAL" : "FAILED";
  const log = await prisma.syncLog.create({
    data: {
      merchantId,
      shopDomain,
      syncType,
      status,
      totalFetched: uens.length,
      totalCreated,
      totalUpdated,
      totalSkipped,
      totalErrors,
      message: `Synced ${totalCreated} created, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`
    }
  });

  await prisma.shopifyConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() }
  });

  await audit({
    action: AuditAction.SYNC_EVENT,
    entityType: "SyncLog",
    entityId: log.id,
    message: log.message ?? undefined,
    metadata: { merchantId, shopDomain, status }
  });

  return log;
}
