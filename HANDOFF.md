# UENITE Platform — Session Handoff (2026-06-11)

Continuation notes for the next working session. Project: UEN Platform / UENITE.
Code: `D:\Universal Echange Note` → repo `Yawitazah/UEN-Platform` → push to `main` auto-deploys to Railway (project "spectacular-blessing", service `UEN-Platform`, live at **uenite.com**, Postgres on Railway; local dev = SQLite + `SHOPIFY_SYNC_MODE=mock`, server `npm run dev` on :3000, vite preview config `uen-dev` on :5180).

## What shipped this session (all deployed, verified)

1. **Grandfathered Love Note system** — all 2,932 codes (`LOVE#####`/`UNLIMITEDLOVE#####`) imported to prod as `UenCodeInventory` rows (`source GRANDFATHERED`, `status RESERVED`, `issuedToEmail` reservation). Claim-on-login/wallet via `src/server/services/grandfather.ts`. Source CSVs: `D:\downloads\orders_export_1.csv` + `export_orders_1781112136.csv`; import script `npm run import:love-notes` (env `UEN_BASE_URL`, `PLATFORM_ADMIN_TOKEN`, `EXCHANGE_HUB_ID`, `BATCH_SIZE`).
2. **HebrewCare fully live**: store `hebrew-care.myshopify.com`, all 2,932 codes on the store + recorded SYNCED. Verified end-to-end with cleannlawful@gmail.com → code `LOVE75077` at 15%.
3. **Holder identity preload** — 1,234 purchaser names (+1,103 phones) loaded into prod Nubreed hub from the orders CSV (`scripts/preload-holder-identities.ts`). Widget/dashboard greet by real name.
4. **Profile verification gate** — dashboard requires name + **phone** (required) before "Where to Redeem"/"My Codes" unlock; pre-filled from preload; `PATCH/GET /api/holder/profile`.
5. **Offer-based UEN valuation** — per-note estimated value = Σ across accessible merchants' active offers (FIXED at face value, PERCENTAGE × $100 spend cap), skipping merchants where that note is redeemed. Wallet returns `estimatedValue`/`estimatedTotalValue`/`participatingMerchants`.
6. **Widget (merchant-site overlay)** — email login, refresh button, "View my full dashboard" link, sign-out (bubbling bug fixed via `composedPath()`), offer rules display (min order + once-per-store), auto-apply on the storefront's own origin (cross-domain fix), brand palette (ink greens `#0C1A14/#0E261D`, emerald `#1F6F5B`, mint `#74E2AC`; gold `#fbbf24` accent only), animations incl. count-up + glow (reduced-motion only suppresses movement). Cache fix: `/widget.js` served no-cache.
7. **Holder portal** — account menu (edit details modal, help/report/delete-request mailtos to work@zahbrandsolutions.com, sign out), animated loading screen (floating/breathing UENITE coin, fixed-positioned), UENITE branding in nav, mobile stats row.
8. **Merchant/Hub portal** — editable Settings (business name, contact email via `PATCH /api/merchant/me`), embedded self-service password reset (App Bridge session-token verified), store-connection status note.
9. **Embedded Shopify app fixes** — host param preserved, App Bridge CDN init, frame-ancestors CSP, cross-origin widget.js (CORP), `/privacy` page live (required for review).
10. **Theme app extension** `extensions/uen-widget` (App embeds block: position/offsets/label/accent) — released to the new UENITE app as `uenite-public-1`.
11. **UENITE public app created** (custom-distribution app couldn't install on 2nd store): Dev Dashboard org `146273490`, app id `380513386497`, client_id `08ec74e897988cc82a16bd80b5bad0d2`, **public distribution chosen**, protected customer data (App functionality + Email + Name fields) saved. Railway env `SHOPIFY_API_KEY/SECRET` now = UENITE. `shopify.app.toml` points at it; CLI is authed (deploys via `npx @shopify/cli@latest app deploy --allow-updates`).
12. **App icon final**: `D:\uenite-icon.png` (1200×1200; gold heart-in-hands coin, emerald glass, embossed UENITE + "THE ORIGINAL LOVE NOTE"). Brand rule (in memory): NO infinity symbols / Greek letters / occult-adjacent marks — radiant heart, light, giving imagery only. Loading asset copy: `public/uenite-coin.png`.

## Open items (in priority order)

1. **Shopify app review submission** (the gate for all future merchant installs):
   - Zah uploads `D:\uenite-icon.png`: Dev Dashboard → UENITE → Settings → Upload icon.
   - Change API contact email to **work@zahbrandsolutions.com** (Settings page; currently cleannlawful@gmail.com). Support email for listing: same.
   - Fill listing via Partners → UENITE → Distribution → "Manage submission" (copy already drafted in prior chat: tagline "Accept Universal Exchange Notes as ready-to-use discounts on your store", category Discounts, pricing Free) + the 16-question data-protection form (answers derive from /privacy page: app-functionality only, Railway Postgres, GDPR webhooks implemented at /shopify/webhooks/privacy, no data sale).
   - Drive Zah's Chrome ("Cleann Lawful" browser has the Dev Dashboard session; "Main" browser has Railway + HebrewCare admin sessions).
2. **Connect Nubreed store** (`nubreed-love.myshopify.com`; public domain nubreedglobaltruth.com): waiting on `D:\nubreed-shpat.txt` (Zah creates store custom app "UEN Connector", scopes read/write_discounts + read_orders + read_products). Then: mint connection token `POST /api/merchants/cmpxhbqbw0000w3agc3m7f3ya/api-keys`, connect via `POST https://uenite.com/shopify/api/platform-connection` `{connectionToken, shopDomain, accessToken}` (auto-runs webhook subscribe + grandfather mark-present), then backfill `POST /api/shopify-connections/nubreed-love.myshopify.com/import-historical` with codePrefix `LOVE` then `UNLIMITEDLOVE`. Note: store-app webhooks won't HMAC-verify (different secret) — known limitation; periodic re-backfill is the mitigation.
3. **Hub product picker** (Zah wants): hub portal UI to browse their store's products and pick which = the Note (creates `ShopifyIssuanceProduct`). Requires a products-list endpoint + portal UI; depends on store connection.
4. **Hub revenue / notes-sold stats** (Nubreed dashboard) — fed by issuance logs + historical backfill; depends on #2.
5. **Post-review**: HebrewCare reinstalls under UENITE (mint onboarding link via `POST /api/merchants/cmpeqeptd0006b2xttrmsnaf1/onboarding-link`; the domain-fallback binding is deployed). Until then HebrewCare order webhooks fail HMAC (old app signs, env has new secret) — Zah accepted this; codes still work at checkout, dashboards fine.
6. **"Connect my store" self-serve button** in merchant Settings once review passes.

## Key IDs / endpoints

- Prod hubs: Nubreed Global Truth `cmpxhbqvj0001w3agdbsqui1u`; Exchange Hub A (test) `cmpeqep4j0001b2xtw3l8tpyz`.
- Prod merchants: Nubreed `cmpxhbqbw0000w3agc3m7f3ya` (no connection yet); hebrew care `cmpeqeptd0006b2xttrmsnaf1`.
- Local dev: hub `cmoxditpi0001mxi9rh9h41nn`, merchant `cmoxdiu3m0006mxi90aecyzsz` (merchant-a.myshopify.com, mock).
- Admin auth: `Authorization: Bearer $(cat D:\uen-token.txt)` (prod PLATFORM_ADMIN_TOKEN; **rotate in Railway when work settles, then delete the file**).
- Admin endpoints added: `/api/exchange-hubs/:id/code-inventory/import-grandfathered`, `/api/exchange-hubs/:id/holders/preload`, `/api/merchants/:id/api-keys`, `/api/merchants/:id/onboarding-link`, `/api/shopify-connections/:shop/sync-grandfathered` (202 async; result in `/api/sync-logs`), `/api/shopify-connections/:shop/import-historical`.
- Old custom app "UEN Platform": client `7a960874850e6cfd7ca95d07b1415249` (still installed on HebrewCare; its stored access token keeps working for API calls).

## Hard-won gotchas

- **Orphan dev servers**: TaskStop on `npm run dev` leaves a node child holding :3000 serving STALE code → new server EADDRINUSE → mystery 404s/old behavior. Always `Get-NetTCPConnection -LocalPort 3000 -State Listen | Stop-Process` before restarting, and check the task log for EADDRINUSE.
- **Cloudflare 100s origin timeout** on uenite.com: any admin batch endpoint must be bulk-shaped (one findMany + one createMany), or fire-and-forget (202 + sync-logs). Railway deploys restart the app and kill in-flight background jobs (grandfather sync is per-chunk resumable).
- **Permissions**: `D:\.claude\settings.local.json` allowlist gained `Bash(curl:*)` and `Bash(env:*)` for prod API work (commands must literally START with curl/env). Remove `Bash(env:*)` when prod work is done. The auto-mode classifier blocks: secrets in command lines/disk writes, self-editing permissions, unapproved prod writes — have Zah pre-approve and keep tokens in user-created files.
- **Shopify**: distribution choice is permanent per app; public apps need review even unlisted; custom-distribution = ONE store. Dev Dashboard apps configure via CLI deploys (versions); `include_config_on_deploy` is dead — toml config always ships, keep it mirroring the dashboard.
- **lucide-react 0.468**: type declarations are missing some icons (`Lock`) — runtime has them, tsc fails; pick icons that typecheck.
- Zah's UI bar: premium luster + animations always (palette above), mobile-first, no emojis, "set apart" language rules for HebrewCare, biblical brand constraints for UENITE (no infinity/Greek/occult symbols).
