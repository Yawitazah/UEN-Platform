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
  // ZeptoMail HTTP API — used to email holders a one-time sign-in link.
  // Railway blocks outbound SMTP ports, so sending goes over HTTPS via
  // ZeptoMail instead of Zoho SMTP. `token` is the full "Zoho-enczapikey ..."
  // Authorization value from the ZeptoMail agent. When it's empty the mailer
  // falls back to logging the link to the console so local dev still works.
  zeptomail: {
    token: process.env.ZEPTOMAIL_TOKEN ?? "",
    fromAddress: process.env.ZEPTOMAIL_FROM ?? "work@zahbrandsolutions.com",
    fromName: process.env.ZEPTOMAIL_FROM_NAME ?? "Zah Brand Solutions"
  }
};
