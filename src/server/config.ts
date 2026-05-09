import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  adminToken: process.env.PLATFORM_ADMIN_TOKEN ?? "dev-admin-token",
  internalApiKey: process.env.PLATFORM_INTERNAL_API_KEY ?? "dev-platform-key",
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-01",
  shopifySyncMode: process.env.SHOPIFY_SYNC_MODE ?? "mock",
  shopifyApiKey: process.env.SHOPIFY_API_KEY ?? "",
  shopifyApiSecret: process.env.SHOPIFY_API_SECRET ?? "",
  shopifyAppUrl: process.env.SHOPIFY_APP_URL ?? "http://localhost:3000",
  shopifyScopes: process.env.SHOPIFY_SCOPES ?? "read_discounts,write_discounts,read_orders",
  bootstrapFirstBuildTarget: process.env.BOOTSTRAP_FIRST_BUILD_TARGET !== "false"
};
