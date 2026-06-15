import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET ?? "replace-me",
  adminToken: process.env.PLATFORM_ADMIN_TOKEN ?? "dev-admin-token",
  internalApiKey: process.env.PLATFORM_INTERNAL_API_KEY ?? "dev-platform-key",
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-01",
  shopifySyncMode: process.env.SHOPIFY_SYNC_MODE ?? "mock",
  shopifyApiKey: process.env.SHOPIFY_API_KEY ?? "",
  shopifyApiSecret: process.env.SHOPIFY_API_SECRET ?? "",
  shopifyAppUrl: process.env.SHOPIFY_APP_URL ?? "http://localhost:3000",
  shopifyScopes: process.env.SHOPIFY_SCOPES ?? "read_discounts,write_discounts,read_orders,read_products",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@uen.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
  bootstrapFirstBuildTarget: process.env.BOOTSTRAP_FIRST_BUILD_TARGET !== "false",
  // Zoho SMTP — used to email holders a one-time sign-in link. When SMTP_USER
  // is empty the mailer falls back to logging the link to the console so local
  // dev still works without sending real email.
  smtp: {
    host: process.env.SMTP_HOST ?? "smtp.zoho.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Zah Brand Solutions <work@zahbrandsolutions.com>"
  }
};
