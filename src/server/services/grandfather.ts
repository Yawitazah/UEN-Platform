import { prisma } from "../db";
import { syncNewUensToEligibleShopifyStores } from "./sync";

export const GRANDFATHER_CAMPAIGN_ID = "LOVE-NOTES-2022";

/**
 * Converts grandfathered inventory codes reserved for a holder's email into
 * UniversalExchangeNote records in their wallet. Idempotent and safe under
 * concurrent requests: the conditional updateMany on status RESERVED is the
 * winner-take-all guard, backed by the unique constraints on code and
 * universalExchangeNoteId.
 */
export async function claimReservedCodesForHolder(holder: {
  id: string;
  email: string;
  exchangeHubId: string;
}): Promise<{ claimed: number; notes: Array<{ id: string; code: string }> }> {
  const email = holder.email.trim().toLowerCase();
  if (!email) return { claimed: 0, notes: [] };

  const reserved = await prisma.uenCodeInventory.findMany({
    where: { exchangeHubId: holder.exchangeHubId, status: "RESERVED", source: "GRANDFATHERED", issuedToEmail: email },
    orderBy: { createdAt: "asc" }
  });
  if (!reserved.length) return { claimed: 0, notes: [] };

  const notes: Array<{ id: string; code: string }> = [];
  for (const inventory of reserved) {
    const won = await prisma.uenCodeInventory.updateMany({
      where: { id: inventory.id, status: "RESERVED" },
      data: { status: "ISSUED", issuedAt: new Date() }
    });
    if (won.count !== 1) continue;

    try {
      const note = await prisma.universalExchangeNote.create({
        data: {
          code: inventory.code,
          exchangeHubId: holder.exchangeHubId,
          holderId: holder.id,
          campaignId: GRANDFATHER_CAMPAIGN_ID
        }
      });
      await prisma.uenCodeInventory.update({
        where: { id: inventory.id },
        data: { universalExchangeNoteId: note.id }
      });

      // Codes already pushed to merchant stores via the inventory path must be
      // mirrored onto the note path, otherwise the note auto-sync re-pushes the
      // same code string and Shopify flags it as an external conflict. Past
      // redemptions (Shopify backfill) carry over so the wallet shows them.
      const inventorySyncs = await prisma.shopifyInventorySyncedCode.findMany({
        where: { inventoryCodeId: inventory.id, syncStatus: "SYNCED" }
      });
      for (const sync of inventorySyncs) {
        const historical = await prisma.merchantHistoricalRedemption.findFirst({
          where: { merchantId: sync.merchantId, uenCode: inventory.code }
        });
        await prisma.shopifySyncedNote.upsert({
          where: {
            merchantId_universalExchangeNoteId: { merchantId: sync.merchantId, universalExchangeNoteId: note.id }
          },
          update: {
            shopifyDiscountId: sync.shopifyDiscountId,
            shopifyDiscountCodeId: sync.shopifyDiscountCodeId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date()
          },
          create: {
            merchantId: sync.merchantId,
            universalExchangeNoteId: note.id,
            shopDomain: sync.shopDomain,
            uenCode: inventory.code,
            shopifyDiscountId: sync.shopifyDiscountId,
            shopifyDiscountCodeId: sync.shopifyDiscountCodeId,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date(),
            redeemedAt: historical?.redeemedAt ?? null,
            redeemedOrderId: historical?.shopifyOrderId ?? null,
            redeemedOrderAmount: historical?.orderAmount ?? null
          }
        });
      }

      notes.push({ id: note.id, code: note.code });
    } catch (error) {
      // Release the claim so the code isn't stranded ISSUED without a note.
      await prisma.uenCodeInventory.updateMany({
        where: { id: inventory.id, status: "ISSUED", universalExchangeNoteId: null },
        data: { status: "RESERVED", issuedAt: null }
      });
      console.warn(`Failed to claim grandfathered code ${inventory.code}:`, error);
    }
  }

  if (notes.length) {
    void syncNewUensToEligibleShopifyStores(holder.exchangeHubId, notes, "GRANDFATHER_CLAIM").catch((error) =>
      console.warn("Post-claim store sync failed (non-fatal):", error)
    );
  }

  return { claimed: notes.length, notes };
}
