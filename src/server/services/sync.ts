import { AuditAction } from "../constants";
import { audit } from "../audit";
import { prisma } from "../db";
import { getValidUensForMerchant } from "./uens";
import { addShopifyDiscountCodes, createShopifyDiscountCode, findShopifyDiscountNodeByCode } from "./shopifyGraphql";

// Heavy Shopify syncs each hold database connections while doing bulk
// discount-code writes. Several running at once — e.g. multiple merchant
// installs firing AUTO_INSTALL syncs together, or a background sync overlapping
// a manual one — can gang up on the small connection pool and starve normal
// requests. Serialize them so at most one heavy sync runs at a time. This only
// affects timing, never correctness, and was a contributing factor in the
// 2026-06-17 connection-exhaustion outage.
let syncQueue: Promise<unknown> = Promise.resolve();
function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(task, task);
  // Keep the chain alive even if a task throws (a failed sync must not wedge
  // every later sync), but still surface this task's own result/rejection.
  syncQueue = result.then(() => undefined, () => undefined);
  return result;
}

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

function isDuplicateShopifyCodeError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("code must be unique") || message.includes("already been taken") || message.includes("already exists");
}

function isMissingShopifyDiscountError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("not found") || message.includes("does not exist") || message.includes("invalid id");
}

async function recordGroupedCodeSync(input: {
  connection: GroupedDiscountConnection;
  code: { id: string; code: string; kind: "note" | "inventory" };
  syncStatus: string;
  shopifyDiscountId?: string | null;
  errorMessage?: string | null;
}) {
  const data = {
    shopDomain: input.connection.shopDomain,
    uenCode: input.code.code,
    shopifyDiscountId: input.shopifyDiscountId ?? null,
    shopifyDiscountCodeId: input.shopifyDiscountId ?? null,
    syncStatus: input.syncStatus,
    lastSyncedAt: new Date(),
    errorMessage: input.errorMessage ?? null
  };

  if (input.code.kind === "note") {
    await prisma.shopifySyncedNote.upsert({
      where: { merchantId_universalExchangeNoteId: { merchantId: input.connection.merchantId, universalExchangeNoteId: input.code.id } },
      update: data,
      create: {
        merchantId: input.connection.merchantId,
        universalExchangeNoteId: input.code.id,
        ...data
      }
    });
    return;
  }

  await prisma.shopifyInventorySyncedCode.upsert({
    where: { merchantId_inventoryCodeId: { merchantId: input.connection.merchantId, inventoryCodeId: input.code.id } },
    update: data,
    create: {
      inventoryCodeId: input.code.id,
      merchantId: input.connection.merchantId,
      ...data
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
  const key = discountKey(input.offer);
  let seededCodeId: string | null = null;
  let skippedSeedIds = new Set<string>();
  let group = await prisma.shopifyDiscountGroup.findUnique({
    where: {
      merchantId_shopDomain_discountKey: {
        merchantId: input.connection.merchantId,
        shopDomain: input.connection.shopDomain,
        discountKey: key
      }
    }
  });

  const rebuildGroup = async () => {
    seededCodeId = null;
    group = null;
    for (const code of input.codes) {
      if (skippedSeedIds.has(code.id)) continue;
      try {
        group = await ensureDiscountGroup(input.connection, input.offer, code.code);
        seededCodeId = code.id;
        break;
      } catch (error) {
        if (!isDuplicateShopifyCodeError(error)) throw error;
        skipped += 1;
        await recordGroupedCodeSync({
          connection: input.connection,
          code,
          syncStatus: "EXTERNAL_CONFLICT",
          errorMessage: "This code already exists elsewhere in Shopify. Delete the old standalone discount in Shopify, or leave it skipped and use newly generated codes for the consolidated group."
        });
        skippedSeedIds.add(code.id);
      }
    }
  };

  if (!group || group.status !== "ACTIVE") {
    await rebuildGroup();
  }

  if (!group || group.status !== "ACTIVE") {
    return { created, skipped, errors: errors + 1 };
  }

  for (const code of input.codes) {
    const existing =
      code.kind === "note"
        ? await prisma.shopifySyncedNote.findUnique({
            where: { merchantId_universalExchangeNoteId: { merchantId: input.connection.merchantId, universalExchangeNoteId: code.id } }
          })
        : await prisma.shopifyInventorySyncedCode.findUnique({
            where: { merchantId_inventoryCodeId: { merchantId: input.connection.merchantId, inventoryCodeId: code.id } }
          });
    if (existing?.syncStatus === "SYNCED" && existing.shopifyDiscountId === group.shopifyDiscountId) {
      skipped += 1;
      continue;
    }

    try {
      if (code.id !== seededCodeId) {
        try {
          await addShopifyDiscountCodes({
            shopDomain: input.connection.shopDomain,
            accessToken: input.connection.accessToken,
            shopifyDiscountId: group.shopifyDiscountId,
            codes: [code.code]
          });
        } catch (error) {
          if (!isMissingShopifyDiscountError(error)) throw error;
          await prisma.shopifyDiscountGroup.updateMany({
            where: {
              merchantId: input.connection.merchantId,
              shopDomain: input.connection.shopDomain,
              discountKey: key,
              shopifyDiscountId: group.shopifyDiscountId
            },
            data: { status: "DELETED_IN_SHOPIFY" }
          });
          await prisma.shopifySyncedNote.updateMany({
            where: { merchantId: input.connection.merchantId, shopDomain: input.connection.shopDomain, shopifyDiscountId: group.shopifyDiscountId },
            data: { syncStatus: "PENDING", errorMessage: "Shopify discount group was deleted; queued for recalibration" }
          });
          await prisma.shopifyInventorySyncedCode.updateMany({
            where: { merchantId: input.connection.merchantId, shopDomain: input.connection.shopDomain, shopifyDiscountId: group.shopifyDiscountId },
            data: { syncStatus: "PENDING", errorMessage: "Shopify discount group was deleted; queued for recalibration" }
          });
          await rebuildGroup();
          if (!group || group.status !== "ACTIVE") throw error;
          if (code.id !== seededCodeId) {
            await addShopifyDiscountCodes({
              shopDomain: input.connection.shopDomain,
              accessToken: input.connection.accessToken,
              shopifyDiscountId: group.shopifyDiscountId,
              codes: [code.code]
            });
          }
        }
      }

      await recordGroupedCodeSync({ connection: input.connection, code, syncStatus: "SYNCED", shopifyDiscountId: group.shopifyDiscountId });
      created += 1;
    } catch (error) {
      if (isDuplicateShopifyCodeError(error)) {
        skipped += 1;
        await recordGroupedCodeSync({
          connection: input.connection,
          code,
          syncStatus: "EXTERNAL_CONFLICT",
          shopifyDiscountId: group.shopifyDiscountId,
          errorMessage: "This code already exists elsewhere in Shopify. Delete the old standalone discount in Shopify, or leave it skipped and use newly generated codes for the consolidated group."
        });
        continue;
      }
      errors += 1;
      const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
      await recordGroupedCodeSync({ connection: input.connection, code, syncStatus: "ERROR", shopifyDiscountId: group.shopifyDiscountId, errorMessage });
    }
  }

  return { created, skipped, errors };
}

export function syncMerchantUensToShopify(merchantId: string, shopDomain: string, syncType = "MANUAL") {
  return runSerialized(() => syncMerchantUensToShopifyImpl(merchantId, shopDomain, syncType));
}

async function syncMerchantUensToShopifyImpl(merchantId: string, shopDomain: string, syncType = "MANUAL") {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loads the grandfathered (2022 Love Note) code list onto a merchant's Shopify
 * store. If the store already carries the codes (e.g. the original Nubreed
 * store with its "5000k Love Notes 2022" discount), they are recorded as
 * present instead of recreated — Shopify rejects duplicate code values
 * shop-wide anyway. Otherwise the full list is bulk-added to the merchant's
 * offer-keyed discount group in chunks, honoring the merchant's UEN offer.
 */
export function syncGrandfatheredCodesToMerchant(merchantId: string, shopDomain: string, syncType = "AUTO_INSTALL") {
  return runSerialized(() => syncGrandfatheredCodesToMerchantImpl(merchantId, shopDomain, syncType));
}

async function syncGrandfatheredCodesToMerchantImpl(merchantId: string, shopDomain: string, syncType = "AUTO_INSTALL") {
  const connection = await prisma.shopifyConnection.findFirst({
    where: { merchantId, shopDomain, status: "ACTIVE" },
    include: {
      merchant: {
        include: {
          offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
          accessRules: { where: { status: "ACTIVE" } }
        }
      }
    }
  });
  if (!connection) throw new Error("Active Shopify connection not found");

  const offer = connection.merchant.offers[0];
  if (!offer || (offer.discountType !== "PERCENTAGE" && offer.discountType !== "FIXED_AMOUNT")) {
    return { status: "SKIPPED", created: 0, markedPresent: 0, errors: 0, message: "No PERCENTAGE/FIXED_AMOUNT offer configured" };
  }

  const hubIds = connection.merchant.accessRules.map((rule) => rule.exchangeHubId);
  if (!hubIds.length) {
    return { status: "SKIPPED", created: 0, markedPresent: 0, errors: 0, message: "Merchant has no active hub access rules" };
  }

  // Both RESERVED (unclaimed) and ISSUED codes must work at the store — the
  // codes were sold in 2022 and are honored whether or not the purchaser ever
  // registers a UEN dashboard account.
  const allCodes = await prisma.uenCodeInventory.findMany({
    where: { exchangeHubId: { in: hubIds }, source: "GRANDFATHERED" },
    orderBy: { createdAt: "asc" }
  });
  if (!allCodes.length) {
    return { status: "SKIPPED", created: 0, markedPresent: 0, errors: 0, message: "No grandfathered codes in connected hubs" };
  }

  const alreadySynced = await prisma.shopifyInventorySyncedCode.findMany({
    where: { merchantId, inventoryCodeId: { in: allCodes.map((code) => code.id) }, syncStatus: "SYNCED" },
    select: { inventoryCodeId: true }
  });
  const syncedIds = new Set(alreadySynced.map((row) => row.inventoryCodeId));
  const pending = allCodes.filter((code) => !syncedIds.has(code.id));
  if (!pending.length) {
    return { status: "SUCCESS", created: 0, markedPresent: 0, errors: 0, message: "All grandfathered codes already synced" };
  }

  const connectionInput = {
    merchantId,
    shopDomain,
    accessToken: connection.accessToken,
    merchantName: connection.merchant.businessName
  };

  let created = 0;
  let markedPresent = 0;
  let errors = 0;
  let message = "";

  // Detection: if sample codes already resolve on the store, the legacy
  // discount list is present — record, don't recreate.
  const samples = pending.filter((code) => /^LOVE\d+$/.test(code.code)).slice(0, 5);
  let preExistingDiscountId: string | null = null;
  if (samples.length) {
    try {
      const probes = await Promise.all(
        samples.map((sample) =>
          findShopifyDiscountNodeByCode({ shopDomain, accessToken: connection.accessToken, code: sample.code })
        )
      );
      if (probes.length && probes.every((probe) => probe !== null)) {
        preExistingDiscountId = probes[0]!.shopifyDiscountId;
      }
    } catch (probeError) {
      console.warn("Grandfather code probe failed; falling back to creation path:", probeError);
    }
  }

  if (preExistingDiscountId) {
    for (const code of pending) {
      await recordGroupedCodeSync({
        connection: connectionInput,
        code: { id: code.id, code: code.code, kind: "inventory" },
        syncStatus: "SYNCED",
        shopifyDiscountId: preExistingDiscountId,
        errorMessage: "Pre-existing store discount (5000k Love Notes 2022)"
      });
      // Claimed codes also need their note-path rows so the note auto-sync
      // doesn't re-push the same code string.
      if (code.universalExchangeNoteId) {
        const historical = await prisma.merchantHistoricalRedemption.findFirst({
          where: { merchantId, uenCode: code.code }
        });
        await prisma.shopifySyncedNote.upsert({
          where: { merchantId_universalExchangeNoteId: { merchantId, universalExchangeNoteId: code.universalExchangeNoteId } },
          update: { shopifyDiscountId: preExistingDiscountId, syncStatus: "SYNCED", lastSyncedAt: new Date() },
          create: {
            merchantId,
            universalExchangeNoteId: code.universalExchangeNoteId,
            shopDomain,
            uenCode: code.code,
            shopifyDiscountId: preExistingDiscountId,
            shopifyDiscountCodeId: preExistingDiscountId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date(),
            redeemedAt: historical?.redeemedAt ?? null,
            redeemedOrderId: historical?.shopifyOrderId ?? null,
            redeemedOrderAmount: historical?.orderAmount ?? null
          }
        });
      }
      markedPresent += 1;
    }
    message = `Detected existing grandfather discount on store; marked ${markedPresent} codes present`;
  } else {
    // Creation path: seed/reuse the merchant's offer-keyed discount group with
    // the first code, then bulk-add the rest in chunks of 100 (Shopify's
    // discountRedeemCodeBulkAdd limit) with a small pause between calls.
    const group = await syncCodesToGroupedShopifyDiscount({
      connection: connectionInput,
      offer,
      codes: [{ id: pending[0].id, code: pending[0].code, kind: "inventory" }]
    });
    created += group.created;
    errors += group.errors;

    const activeGroupRow = await prisma.shopifyDiscountGroup.findUnique({
      where: { merchantId_shopDomain_discountKey: { merchantId, shopDomain, discountKey: discountKey(offer) } }
    });
    const activeGroup = activeGroupRow?.status === "ACTIVE" ? activeGroupRow : null;
    if (!activeGroup) {
      errors += pending.length - 1;
      message = "Could not create or reuse a Shopify discount group";
    } else {
      const rest = pending.slice(1);
      for (let offset = 0; offset < rest.length; offset += 100) {
        const chunk = rest.slice(offset, offset + 100);
        try {
          await addShopifyDiscountCodes({
            shopDomain,
            accessToken: connection.accessToken,
            shopifyDiscountId: activeGroup.shopifyDiscountId,
            codes: chunk.map((code) => code.code)
          });
          for (const code of chunk) {
            await recordGroupedCodeSync({
              connection: connectionInput,
              code: { id: code.id, code: code.code, kind: "inventory" },
              syncStatus: "SYNCED",
              shopifyDiscountId: activeGroup.shopifyDiscountId
            });
            created += 1;
          }
        } catch (chunkError) {
          const errorMessage = chunkError instanceof Error ? chunkError.message : "Bulk add failed";
          for (const code of chunk) {
            await recordGroupedCodeSync({
              connection: connectionInput,
              code: { id: code.id, code: code.code, kind: "inventory" },
              syncStatus: "ERROR",
              shopifyDiscountId: activeGroup.shopifyDiscountId,
              errorMessage
            });
            errors += 1;
          }
        }
        if (offset + 100 < rest.length) await sleep(600);
      }
      message = `Loaded ${created} grandfathered codes onto store, ${errors} errors`;
    }
  }

  const status = errors === 0 ? "SUCCESS" : created + markedPresent > 0 ? "PARTIAL" : "FAILED";
  const log = await prisma.syncLog.create({
    data: {
      merchantId,
      shopDomain,
      syncType: `${syncType}_GRANDFATHER`,
      status,
      totalFetched: pending.length,
      totalCreated: created,
      totalUpdated: markedPresent,
      totalSkipped: 0,
      totalErrors: errors,
      message
    }
  });

  await audit({
    action: AuditAction.SYNC_EVENT,
    entityType: "SyncLog",
    entityId: log.id,
    message,
    metadata: { merchantId, shopDomain, status, grandfathered: true }
  });

  return { status, created, markedPresent, errors, message };
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
