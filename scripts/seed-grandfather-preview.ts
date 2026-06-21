/**
 * Seed a shareable "grandfather test account" for the Uenite holder portal.
 *
 * Running this produces a single, stable, shareable URL that shows the full
 * grandfathered Love Note experience when opened:
 *   - Celebration banner + "isLoveNoteSupporter" badge
 *   - Collectible Digital Love Note GIF        (client-side constant, no DB rows)
 *   - Exclusive "Filthy Coon" karaoke album    (client-side constant, no DB rows)
 *   - A UEN wallet with a non-zero estimated value from a live merchant offer
 *   - The full holder portal (profile, merchants, redemption, digital products)
 *
 * What actually drives each piece (verified against src/server/routes/holder.ts):
 *   - isLoveNoteSupporter is true when >=1 UenCodeInventory row with
 *     source="GRANDFATHERED" exists for the holder's email. That single fact
 *     unlocks the banner, badge, collectible GIF, and exclusive album (the last
 *     two are client-side constants keyed to "love-note-collectible" /
 *     "Filthy Coon", so they need no extra DB rows).
 *   - The wallet auto-claims RESERVED grandfathered inventory into real
 *     UniversalExchangeNote rows on load (claimReservedCodesForHolder). We
 *     pre-claim them here so the wallet is fully populated immediately.
 *   - Estimated value = sum over ACTIVE merchants (with an ACTIVE access rule to
 *     the hub) of their newest ACTIVE offer's value. A PERCENTAGE offer is
 *     valued against a $100 spend cap (the PERCENT_SPEND_CAP code constant), so
 *     a 15% offer contributes $15 per unredeemed note.
 *
 * NOTE on the original task spec vs. the real schema (prisma/schema*.prisma):
 *   - UenCodeInventory has NO `campaignId`, `quantity`, or `hubId` fields. It
 *     uses `exchangeHubId`. The "LOVE-NOTES-2022" campaign id lives on the
 *     UniversalExchangeNote and is set automatically by the claim service
 *     (GRANDFATHER_CAMPAIGN_ID). So we don't set it on the inventory row.
 *   - MerchantOffer has NO `maxCartValue` field; the $100 cap is the code-side
 *     PERCENT_SPEND_CAP constant. We just create a 15% PERCENTAGE offer.
 *
 * Idempotent: safe to run repeatedly. Reuses an existing ACTIVE hub/merchant and
 * upserts the holder, inventory, offer, access rule, and Shopify connection.
 *
 * Run:  npx tsx scripts/seed-grandfather-preview.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db";
import { HubStatus, MerchantStatus } from "../src/server/constants";
import { claimReservedCodesForHolder, GRANDFATHER_CAMPAIGN_ID } from "../src/server/services/grandfather";

const PREVIEW_EMAIL = "preview@uenite.com";
const PREVIEW_TOKEN = "grandfather-preview-2024-uenite";
const PREVIEW_PASSWORD = "preview123";
const PREVIEW_STORE_DOMAIN = "preview-store.myshopify.com";
const INVENTORY_CODES = ["LOVE-NOTES-PREVIEW-001", "LOVE-NOTES-PREVIEW-002", "LOVE-NOTES-PREVIEW-003"];

async function main() {
  // 1) Find or create an ACTIVE ExchangeHub. Prefer the one seed.ts creates.
  let hub =
    (await prisma.exchangeHub.findFirst({ where: { subdomain: "hub-a", status: HubStatus.ACTIVE } })) ??
    (await prisma.exchangeHub.findFirst({ where: { status: HubStatus.ACTIVE }, orderBy: { createdAt: "asc" } }));
  if (!hub) {
    hub = await prisma.exchangeHub.create({
      data: {
        name: "exchange-hub-a",
        displayName: "Exchange Hub A",
        hubType: "creator",
        status: HubStatus.ACTIVE,
        billingStatus: "ACTIVE",
        brandColor: "#1f6f5b",
        codePrefix: "",
        subdomain: "hub-a"
      }
    });
    console.log(`Created ExchangeHub ${hub.id} (subdomain "hub-a")`);
  } else {
    console.log(`Reusing ExchangeHub ${hub.id} ("${hub.displayName}")`);
  }

  // 2) Upsert the preview holder (unique by [exchangeHubId, email]).
  const passwordHash = await bcrypt.hash(PREVIEW_PASSWORD, 12);
  const holder = await prisma.holder.upsert({
    where: { exchangeHubId_email: { exchangeHubId: hub.id, email: PREVIEW_EMAIL } },
    update: {
      firstName: "Preview",
      lastName: "Holder",
      phone: "+15551234567",
      status: "ACTIVE",
      portalToken: PREVIEW_TOKEN,
      passwordHash
    },
    create: {
      exchangeHubId: hub.id,
      firstName: "Preview",
      lastName: "Holder",
      email: PREVIEW_EMAIL,
      phone: "+15551234567",
      status: "ACTIVE",
      portalToken: PREVIEW_TOKEN,
      passwordHash
    }
  });
  console.log(`Upserted Holder ${holder.id} (${holder.email})`);

  // 3) Create GRANDFATHERED RESERVED inventory codes for this email.
  //    Each reserved code becomes a UEN in the wallet when claimed (step 5).
  //    This is also what flips isLoveNoteSupporter -> true.
  for (const code of INVENTORY_CODES) {
    const existing = await prisma.uenCodeInventory.findUnique({ where: { code } });
    if (existing) {
      console.log(`  Inventory code ${code} already exists (status=${existing.status}) — left as-is`);
      continue;
    }
    await prisma.uenCodeInventory.create({
      data: {
        exchangeHubId: hub.id,
        code,
        status: "RESERVED",
        source: "GRANDFATHERED",
        issuedToEmail: PREVIEW_EMAIL
      }
    });
    console.log(`  Created RESERVED grandfathered inventory code ${code}`);
  }

  // 4) Ensure an ACTIVE merchant in this hub with an ACTIVE 15% offer, an
  //    ACTIVE access rule, and a (mock) Shopify connection — so the wallet shows
  //    a non-zero estimated value rather than $0.
  let merchant = await prisma.merchant.findFirst({
    where: {
      status: MerchantStatus.ACTIVE,
      accessRules: { some: { exchangeHubId: hub.id, status: "ACTIVE" } },
      offers: { some: { status: "ACTIVE", discountType: "PERCENTAGE" } }
    }
  });
  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        businessName: "Preview Merchant",
        platformType: "SHOPIFY",
        status: MerchantStatus.ACTIVE,
        isExchangeHub: false
      }
    });
    console.log(`Created Merchant ${merchant.id} ("Preview Merchant")`);
  } else {
    console.log(`Reusing Merchant ${merchant.id} ("${merchant.businessName}")`);
  }

  // ACTIVE 15% PERCENTAGE offer (valued at $15 against the $100 code-side cap).
  const existingOffer = await prisma.merchantOffer.findFirst({
    where: { merchantId: merchant.id, status: "ACTIVE", discountType: "PERCENTAGE" }
  });
  if (!existingOffer) {
    await prisma.merchantOffer.create({
      data: {
        merchantId: merchant.id,
        discountType: "PERCENTAGE",
        discountValue: "15",
        usageLimitPerNote: 1,
        status: "ACTIVE"
      }
    });
    console.log(`  Created ACTIVE 15% PERCENTAGE offer`);
  } else {
    console.log(`  Reusing ACTIVE offer ${existingOffer.id}`);
  }

  // Access rule linking the merchant to this hub (unique [merchantId, hubId]).
  await prisma.merchantAccessRule.upsert({
    where: { merchantId_exchangeHubId: { merchantId: merchant.id, exchangeHubId: hub.id } },
    update: { status: "ACTIVE" },
    create: { merchantId: merchant.id, exchangeHubId: hub.id, status: "ACTIVE" }
  });
  console.log(`  Ensured ACTIVE MerchantAccessRule -> hub`);

  // Mock Shopify connection (unique by shopDomain).
  await prisma.shopifyConnection.upsert({
    where: { shopDomain: PREVIEW_STORE_DOMAIN },
    update: { merchantId: merchant.id, status: "ACTIVE" },
    create: {
      merchantId: merchant.id,
      shopDomain: PREVIEW_STORE_DOMAIN,
      accessToken: "shpat_preview_mock_token",
      scopes: "read_discounts,write_discounts",
      status: "ACTIVE"
    }
  });
  console.log(`  Ensured mock ShopifyConnection (${PREVIEW_STORE_DOMAIN})`);

  // 5) Pre-claim the reserved inventory into real UENs so the wallet is fully
  //    populated immediately (this is what the wallet route does on load). Sets
  //    each note's campaignId to GRANDFATHER_CAMPAIGN_ID ("LOVE-NOTES-2022").
  const { claimed } = await claimReservedCodesForHolder({
    id: holder.id,
    email: holder.email,
    exchangeHubId: hub.id
  });

  const noteCount = await prisma.universalExchangeNote.count({ where: { holderId: holder.id } });
  const supporterCount = await prisma.uenCodeInventory.count({
    where: { source: "GRANDFATHERED", issuedToEmail: PREVIEW_EMAIL }
  });

  const baseUrl = process.env.BASE_URL ?? process.env.SHOPIFY_APP_URL ?? "http://localhost:3000";
  const portalUrl = `${baseUrl}/holder/portal?token=${PREVIEW_TOKEN}`;

  console.log("\n========================================================");
  console.log(" GRANDFATHER PREVIEW ACCOUNT READY");
  console.log("========================================================");
  console.log(` Portal URL : ${portalUrl}`);
  console.log(` Email      : ${PREVIEW_EMAIL}`);
  console.log(` Password   : ${PREVIEW_PASSWORD}  (login also works)`);
  console.log("--------------------------------------------------------");
  console.log(` Hub                : ${hub.displayName} (${hub.id})`);
  console.log(` Holder             : ${holder.firstName} ${holder.lastName} (${holder.id})`);
  console.log(` isLoveNoteSupporter: ${supporterCount > 0} (${supporterCount} grandfathered codes)`);
  console.log(` UENs in wallet     : ${noteCount} (campaign ${GRANDFATHER_CAMPAIGN_ID}); claimed this run: ${claimed}`);
  console.log(` Merchant           : ${merchant.businessName} — 15% offer, $15 est. value/note`);
  console.log(` Mock store         : ${PREVIEW_STORE_DOMAIN}`);
  console.log("========================================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
