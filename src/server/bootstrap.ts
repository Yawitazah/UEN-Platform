import bcrypt from "bcryptjs";
import { AdminRole, HubStatus, MerchantStatus, UenStatus } from "./constants";
import { prisma } from "./db";
import { hashSecret } from "./security";

export async function ensureFirstBuildTarget() {
  const existingHub = await prisma.exchangeHub.findFirst({
    where: { name: "exchange-hub-a" }
  });
  if (existingHub) return;

  await prisma.adminUser.upsert({
    where: { email: "admin@uen.local" },
    update: {},
    create: {
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

  await prisma.universalExchangeNote.create({
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

  await prisma.merchantApiKey.create({
    data: {
      merchantId: merchant.id,
      label: "Local development Shopify app token",
      keyHash: hashSecret("uen_dev_merchant_token")
    }
  });

  console.log("Bootstrapped first-build target for UEN-TEST-001");
}
