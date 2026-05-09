import { AuditAction } from "../constants";
import { audit } from "../audit";
import { prisma } from "../db";
import { getValidUensForMerchant } from "./uens";
import { addShopifyDiscountCodes, createShopifyDiscountCode } from "./shopifyGraphql";

type GroupedDiscountOffer = {
  discountType: string;
  discountValue: unknown;
  minimumOrderAmount?: unknown;
  usageLimitPerNote: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

type GroupedDiscountConnection = {
  merchantId: string;
  shopDomain: string;
  accessToken: string;
  merchantName?: string;
};

function discountKey(offer: GroupedDiscountOffer) {
  return [
    offer.discountType,
    Number(offer.discountValue ?? 0),
    offer.minimumOrderAmount ? Number(offer.minimumOrderAmount) : "",
    offer.usageLimitPerNote
  ].join(":");
}

async function ensureDiscountGroup(connection: GroupedDiscountConnection, offer: GroupedDiscountOffer, firstCode: string) {
  const key = discountKey(offer);
  const existing = await prisma.shopifyDiscountGroup.findUnique({
    where: { merchantId_shopDomain_discountKey: { merchantId: connection.merchantId, shopDomain: connection.shopDomain, discountKey: key } }
  });
  if (existing?.status === "ACTIVE") return existing;

  const title = `${connection.merchantName ?? "UEN"} Universal Exchange Notes`;
  const result = await createShopifyDiscountCode({
    shopDomain: connection.shopDomain,
    accessToken: connection.accessToken,
    code: firstCode,
    title,
    discountType: offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
    discountValue: Number(offer.discountValue ?? 0),
    usageLimitPerNote: offer.usageLimitPerNote,
    minimumOrderAmount: offer.minimumOrderAmount ? Number(offer.minimumOrderAmount) : undefined,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt
  });

  return prisma.shopifyDiscountGroup.upsert({
    where: { merchantId_shopDomain_discountKey: { merchantId: connection.merchantId, shopDomain: connection.shopDomain, discountKey: key } },
    update: {
      title,
      discountType: offer.discountType,
      discountValue: String(offer.discountValue ?? ""),
      minimumOrderAmount: offer.minimumOrderAmount ? String(offer.minimumOrderAmount) : null,
      usageLimitPerNote: offer.usageLimitPerNote,
      shopifyDiscountId: result.shopifyDiscountId,
      status: "ACTIVE"
    },
    create: {
      merchantId: connection.merchantId,
      shopDomain: connection.shopDomain,
      discountKey: key,
      title,
      discountType: offer.discountType,
      discountValue: String(offer.discountValue ?? ""),
      minimumOrderAmount: offer.minimumOrderAmount ? String(offer.minimumOrderAmount) : null,
      usageLimitPerNote: offer.usageLimitPerNote,
      shopifyDiscountId: result.shopifyDiscountId
    }
  });
}

export async function syncCodesToGroupedShopifyDiscount(input: {
  connection: GroupedDiscountConnection;
  offer: GroupedDiscountOffer;
  codes: Array<{ id: string; code: string; kind: "note" | "inventory" }>;
}) {
  if (!input.codes.length) return { created: 0, skipped: 0, errors: 0 };
  if (input.offer.discountType !== "PERCENTAGE" && input.offer.discountType !== "FIXED_AMOUNT") {
    throw new Error("Shopify sync currently supports PERCENTAGE and FIXED_AMOUNT offers");
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const group = await ensureDiscountGroup(input.connection, input.offer, input.codes[0].code);

  for (const code of input.codes) {
    const existing =
      code.kind === "note"
        ? await prisma.shopifySyncedNote.findUnique({
            where: { merchantId_universalExchangeNoteId: { merchantId: input.connection.merchantId, universalExchangeNoteId: code.id } }
          })
        : await prisma.shopifyInventorySyncedCode.findUnique({
            where: { merchantId_inventoryCodeId: { merchantId: input.connection.merchantId, inventoryCodeId: code.id } }
          });
    if (existing?.syncStatus === "SYNCED") {
      skipped += 1;
      continue;
    }

    try {
      if (!(created === 0 && code.code === input.codes[0].code && group.createdAt.getTime() > Date.now() - 30_000)) {
        await addShopifyDiscountCodes({
          shopDomain: input.connection.shopDomain,
          accessToken: input.connection.accessToken,
          shopifyDiscountId: group.shopifyDiscountId,
          codes: [code.code]
        });
      }

      if (code.kind === "note") {
        await prisma.shopifySyncedNote.upsert({
          where: { merchantId_universalExchangeNoteId: { merchantId: input.connection.merchantId, universalExchangeNoteId: code.id } },
          update: {
            shopDomain: input.connection.shopDomain,
            uenCode: code.code,
            shopifyDiscountId: group.shopifyDiscountId,
            shopifyDiscountCodeId: group.shopifyDiscountId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date(),
            errorMessage: null
          },
          create: {
            merchantId: input.connection.merchantId,
            shopDomain: input.connection.shopDomain,
            universalExchangeNoteId: code.id,
            uenCode: code.code,
            shopifyDiscountId: group.shopifyDiscountId,
            shopifyDiscountCodeId: group.shopifyDiscountId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date()
          }
        });
      } else {
        await prisma.shopifyInventorySyncedCode.upsert({
          where: { merchantId_inventoryCodeId: { merchantId: input.connection.merchantId, inventoryCodeId: code.id } },
          update: {
            shopDomain: input.connection.shopDomain,
            uenCode: code.code,
            shopifyDiscountId: group.shopifyDiscountId,
            shopifyDiscountCodeId: group.shopifyDiscountId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date(),
            errorMessage: null
          },
          create: {
            inventoryCodeId: code.id,
            merchantId: input.connection.merchantId,
            shopDomain: input.connection.shopDomain,
            uenCode: code.code,
            shopifyDiscountId: group.shopifyDiscountId,
            shopifyDiscountCodeId: group.shopifyDiscountId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date()
          }
        });
      }
      created += 1;
    } catch (error) {
      errors += 1;
      const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
      if (code.kind === "note") {
        await prisma.shopifySyncedNote.upsert({
          where: { merchantId_universalExchangeNoteId: { merchantId: input.connection.merchantId, universalExchangeNoteId: code.id } },
          update: { shopDomain: input.connection.shopDomain, uenCode: code.code, syncStatus: "ERROR", lastSyncedAt: new Date(), errorMessage },
          create: {
            merchantId: input.connection.merchantId,
            shopDomain: input.connection.shopDomain,
            universalExchangeNoteId: code.id,
            uenCode: code.code,
            syncStatus: "ERROR",
            lastSyncedAt: new Date(),
            errorMessage
          }
        });
      } else {
        await prisma.shopifyInventorySyncedCode.upsert({
          where: { merchantId_inventoryCodeId: { merchantId: input.connection.merchantId, inventoryCodeId: code.id } },
          update: { shopDomain: input.connection.shopDomain, uenCode: code.code, syncStatus: "ERROR", lastSyncedAt: new Date(), errorMessage },
          create: {
            inventoryCodeId: code.id,
            merchantId: input.connection.merchantId,
            shopDomain: input.connection.shopDomain,
            uenCode: code.code,
            syncStatus: "ERROR",
            lastSyncedAt: new Date(),
            errorMessage
          }
        });
      }
    }
  }

  return { created, skipped, errors };
}

export async function syncMerchantUensToShopify(merchantId: string, shopDomain: string, syncType = "MANUAL") {
  const connection = await prisma.shopifyConnection.findFirst({
    where: { merchantId, shopDomain, status: "ACTIVE" },
    include: { merchant: true }
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
  const groupedSync = await syncCodesToGroupedShopifyDiscount({
    connection: {
      merchantId,
      shopDomain,
      accessToken: connection.accessToken,
      merchantName: connection.merchant?.businessName
    },
    offer,
    codes: uens.map((uen) => ({ id: uen.id, code: uen.code, kind: "note" as const }))
  });
  totalCreated += groupedSync.created;
  totalSkipped += groupedSync.skipped;
  totalErrors += groupedSync.errors;

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

export async function syncNewUensToEligibleShopifyStores(exchangeHubId: string, notes: Array<{ id: string; code: string }>, syncType = "WEBHOOK") {
  if (!notes.length) return { synced: 0, skipped: 0, errors: 0, merchantStores: 0 };

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
      skipped += notes.length * merchant.shopifyConnections.length;
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
        codes: notes.map((note) => ({ id: note.id, code: note.code, kind: "note" as const }))
      });
      synced += groupedSync.created;
      skipped += groupedSync.skipped;
      errors += groupedSync.errors;

      const status = errors === 0 ? "SUCCESS" : synced > 0 ? "PARTIAL" : "FAILED";
      await prisma.syncLog.create({
        data: {
          merchantId: merchant.id,
          shopDomain: connection.shopDomain,
          syncType,
          status,
          totalFetched: notes.length,
          totalCreated: synced,
          totalSkipped: skipped,
          totalErrors: errors,
          message: `Auto-synced ${synced} new UEN discount codes, ${skipped} skipped, ${errors} errors`
        }
      });
      await prisma.shopifyConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date() }
      });
    }
  }

  return { synced, skipped, errors, merchantStores: merchants.flatMap((merchant) => merchant.shopifyConnections).length };
}
