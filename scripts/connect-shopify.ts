import "dotenv/config";
import { prisma } from "../src/server/db";

const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const merchantName = process.env.SHOPIFY_MERCHANT_NAME ?? "Merchant A";

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const domain = required("SHOPIFY_SHOP_DOMAIN", shopDomain).trim().toLowerCase();
  const token = required("SHOPIFY_ADMIN_ACCESS_TOKEN", accessToken).trim();

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("SHOPIFY_SHOP_DOMAIN must look like your-store.myshopify.com");
  }

  const merchant = await prisma.merchant.findFirst({
    where: { businessName: merchantName }
  });

  if (!merchant) {
    throw new Error(`Merchant not found: ${merchantName}`);
  }

  const connection = await prisma.shopifyConnection.upsert({
    where: { shopDomain: domain },
    update: {
      merchantId: merchant.id,
      accessToken: token,
      scopes: "read_discounts,write_discounts",
      status: "ACTIVE"
    },
    create: {
      merchantId: merchant.id,
      shopDomain: domain,
      accessToken: token,
      scopes: "read_discounts,write_discounts",
      status: "ACTIVE"
    }
  });

  console.log(`Connected ${domain} to ${merchant.businessName}`);
  console.log(`ShopifyConnection id: ${connection.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
