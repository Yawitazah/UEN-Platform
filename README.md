# Universal Exchange Note SaaS MVP

Production-minded MVP for a Universal Exchange Note platform with a Shopify merchant sync app.

## What is included

- Central SaaS Platform with Exchange Hubs, Holders, Universal Exchange Notes, Merchants, Offers, Access Rules, Shopify Connections, synced notes, sync logs, and audit logs.
- Shopify Merchant App screens for dashboard, platform connection, offer settings, UEN sync, and sync logs.
- Prisma schema using SQLite for local development. The local schema stores enum-like fields as validated strings for SQLite compatibility; production PostgreSQL can promote them to native enums.
- Secure server-side routes with bearer-token auth, merchant API keys, role checks, validation, and server-only Shopify token storage.
- Shopify Admin GraphQL helper using `discountCodeBasicCreate` for percentage and fixed-amount discount codes.
- Sync service that continues when a single UEN fails and records partial failures.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment:

   ```bash
   cp .env.example .env
   ```

3. Create the SQLite database and seed the first-build target:

   ```bash
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open:

   ```text
   http://localhost:3000
   ```

## Seeded test target

- Exchange Hub: `Exchange Hub A`
- Holder: `Holder A`
- UEN: `1234567UEN`
- Merchant: `Merchant A`
- Shopify store placeholder: `merchant-a.myshopify.com`
- Merchant offer: `15% off`
- Access rule: `Merchant A` accepts `Exchange Hub A` UENs
- Shopify merchant connection token: `uen_dev_merchant_token`
- Admin bearer token: `dev-admin-token`

Local Shopify sync runs in mock mode by default using `SHOPIFY_SYNC_MODE=mock`, so syncing `1234567UEN` creates mock Shopify discount IDs without calling Shopify. Set `SHOPIFY_SYNC_MODE=live`, store a real offline Shopify access token in `ShopifyConnection.accessToken`, and keep scopes as `read_discounts,write_discounts` to call the Shopify Admin GraphQL API.

## Connect a real Shopify store for testing

In the Shopify Dev Dashboard version screen, use:

- App URL: `https://your-public-domain.example/shopify`
- Scopes: `read_discounts,write_discounts`
- Redirect URLs: `https://your-public-domain.example/shopify/auth/callback`
- Preferences URL: `https://your-public-domain.example/shopify`
- Embed app in Shopify admin: off for this MVP unless you add App Bridge and embedded-session handling

Set the app credentials and public URL locally:

```bash
$env:SHOPIFY_API_KEY="your_client_id"
$env:SHOPIFY_API_SECRET="your_client_secret"
$env:SHOPIFY_APP_URL="https://your-public-domain.example"
$env:SHOPIFY_SYNC_MODE="live"
```

Or put those values in `.env` before restarting the server.

To start the Shopify OAuth install for a store, visit:

```text
https://your-public-domain.example/shopify/auth?shop=your-store.myshopify.com
```

The callback stores the offline Admin API token server-side in `ShopifyConnection`.

For manual token testing instead of OAuth, create or install a Shopify app with Admin API scopes `read_discounts` and `write_discounts`, then run:

```bash
$env:SHOPIFY_SHOP_DOMAIN="your-store.myshopify.com"
$env:SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_your_real_token"
npm run shopify:connect
```

Then set `.env` to:

```env
SHOPIFY_SYNC_MODE="live"
```

Restart the server and use `/shopify` to sync `1234567UEN`.

## Key API endpoints

- `GET /api/merchants/:merchantId/valid-uens`
- `POST /api/uens/validate`
- `POST /api/exchange-hubs/:exchangeHubId/uens`
- `POST /api/exchange-hubs/:exchangeHubId/suspend`
- `POST /api/merchants/:merchantId/offers`
- `POST /api/merchants/:merchantId/access-rules`
- `POST /shopify/api/platform-connection`
- `POST /shopify/api/sync`
- `GET /shopify/api/dashboard`
- `GET /shopify/api/sync-logs`

## Business rule notes

- The central platform is the source of truth for UEN validity, Exchange Hub status, merchant access, and offers.
- Shopify is only the redemption layer. The Shopify app cannot create or delete UENs.
- Exchange Hubs sell access through their own systems. For a Shopify-based Exchange Hub, the sale can be a normal Shopify product, and a post-purchase integration can call the central platform to create the Holder and generate the UEN.
- Exchange Hubs can save a code prefix. Generated UENs use `1234567UEN` by default, or `NUBREED1234567UEN` when the hub has `NUBREED` as its prefix. The numeric portion is 1 to 7 digits.
- The Product Issuance page maps a Shopify product ID to an Exchange Hub. Paid Shopify orders for mapped products issue UENs through the `orders/paid` webhook endpoint at `/shopify/webhooks/orders-paid`.
- For digital artwork delivery, keep the artwork product/download in Shopify or a digital-download app, and store the download/asset URL on the Product Issuance mapping so the issued UEN and asset can be tracked together.
- One UEN can sync to many merchants, with merchant-specific offer values.
- Suspended Exchange Hubs cannot generate new UENs. Suspending a hub marks active UENs as suspended so they stop syncing.
- Admins can disable a UEN or remove it from circulation, which marks synced Shopify records inactive.
- UENs in `GRACE_PERIOD` may continue syncing even when a hub is suspended.
- Future non-Shopify merchants can validate UENs through `POST /api/uens/validate`.

## PostgreSQL deployment note

For production, switch `prisma/schema.prisma` datasource to:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then use a PostgreSQL `DATABASE_URL`, run migrations in the deployment pipeline, and set strong values for `PLATFORM_ADMIN_TOKEN`, `PLATFORM_INTERNAL_API_KEY`, and `SESSION_SECRET`.
