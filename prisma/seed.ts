import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db";
import { AdminRole, HubStatus, MerchantStatus, UenStatus } from "../src/server/constants";
import { hashSecret } from "../src/server/security";

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.syncLog.deleteMany();
  await prisma.shopifySyncedNote.deleteMany();
  await prisma.shopifyConnection.deleteMany();
  await prisma.merchantApiKey.deleteMany();
  await prisma.merchantAccessRule.deleteMany();
  await prisma.merchantOffer.deleteMany();
  await prisma.universalExchangeNote.deleteMany();
  await prisma.holder.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.exchangeHub.deleteMany();
  await prisma.adminUser.deleteMany();

  await prisma.adminUser.create({
    data: {
      email: "admin@uen.local",
      passwordHash: await bcrypt.hash("change-me", 12),
      role: AdminRole.SUPER_ADMIN
    }
  });

  const exchangeHub = await prisma.exchangeHub.create({
    data: {
      name: "exchange-hub-a",
      displayName: "Exchange Hub A",
      hubType: "creator",
      status: HubStatus.ACTIVE,
      billingStatus: "ACTIVE",
      brandColor: "#1f6f5b",
      subdomain: "hub-a"
    }
  });

  const holder = await prisma.holder.create({
    data: {
      exchangeHubId: exchangeHub.id,
      firstName: "Holder",
      lastName: "A",
      email: "holder-a@example.com",
      phone: "+15555550100"
    }
  });

  const uen = await prisma.universalExchangeNote.create({
    data: {
      exchangeHubId: exchangeHub.id,
      holderId: holder.id,
      code: "UEN-TEST-001",
      status: UenStatus.ACTIVE
    }
  });

  const merchant = await prisma.merchant.create({
    data: {
      businessName: "Merchant A",
      platformType: "SHOPIFY",
      status: MerchantStatus.ACTIVE,
      isExchangeHub: false
    }
  });

  await prisma.merchantOffer.create({
    data: {
      merchantId: merchant.id,
      discountType: "PERCENTAGE",
      discountValue: "15",
      usageLimitPerNote: 1,
      status: "ACTIVE"
    }
  });

  await prisma.merchantAccessRule.create({
    data: {
      merchantId: merchant.id,
      exchangeHubId: exchangeHub.id,
      status: "ACTIVE"
    }
  });

  await prisma.shopifyConnection.create({
    data: {
      merchantId: merchant.id,
      shopDomain: "merchant-a.myshopify.com",
      accessToken: "shpat_placeholder_local_dev",
      scopes: "read_discounts,write_discounts",
      status: "ACTIVE"
    }
  });

  await prisma.merchantApiKey.create({
    data: {
      merchantId: merchant.id,
      label: "Local development Shopify app token",
      keyHash: hashSecret("uen_dev_merchant_token")
    }
  });

  console.log("Seeded first-build target");
  console.log({ exchangeHubId: exchangeHub.id, holderId: holder.id, uenCode: uen.code, merchantId: merchant.id });
  console.log("Merchant connection token: uen_dev_merchant_token");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
