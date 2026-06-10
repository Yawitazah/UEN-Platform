import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import express from "express";
import { ZodError } from "zod";
import { audit } from "../audit";
import { config } from "../config";
import { AuditAction, MerchantStatus } from "../constants";
import { prisma } from "../db";
import { hashSecret } from "../security";
import { syncCodesToGroupedShopifyDiscount, syncGrandfatheredCodesToMerchant, syncMerchantUensToShopify } from "../services/sync";
import { createOfferSchema, platformConnectionSchema } from "../validators";

const router = express.Router();

function requireMerchantSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.auth || req.auth.actorType !== "merchant") {
    return res.status(401).json({ error: "Merchant login required" });
  }
  next();
}

function normalizeShop(value: unknown) {
  const shop = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return null;
  return shop;
}

function verifyShopifyHmac(query: express.Request["query"]) {
  if (!config.shopifyApiSecret) return false;
  const hmac = String(query.hmac ?? "");
  const entries = Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const message = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const digest = crypto.createHmac("sha256", config.shopifyApiSecret).update(message).digest("hex");
  return hmac.length === digest.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

function verifyShopifyWebhook(req: express.Request) {
  const hmac = req.header("x-shopify-hmac-sha256") ?? "";
  if (!config.shopifyApiSecret || !req.rawBody || !hmac) return false;
  const digest = crypto.createHmac("sha256", config.shopifyApiSecret).update(req.rawBody).digest("base64");
  return hmac.length === digest.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

// Verifies an App Bridge session token (JWT signed by Shopify with the app
// secret). A valid token is proof the caller is logged into the shop's admin
// with this app open — the ownership check behind self-service resets.
function verifyShopifySessionToken(token: string): { shop: string } | null {
  try {
    if (!config.shopifyApiSecret || !config.shopifyApiKey) return null;
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const expected = crypto.createHmac("sha256", config.shopifyApiSecret).update(`${headerB64}.${payloadB64}`).digest("base64url");
    if (signatureB64.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expected))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      exp?: number;
      aud?: string;
      dest?: string;
    };
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.aud !== config.shopifyApiKey) return null;
    const shop = normalizeShop(String(payload.dest ?? "").replace(/^https:\/\//, ""));
    return shop ? { shop } : null;
  } catch {
    return null;
  }
}

function shopifyScopes(value: string) {
  return new Set(
    value
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

function missingRequiredScopes(grantedScope = "") {
  const granted = shopifyScopes(grantedScope);
  return [...shopifyScopes(config.shopifyScopes)].filter((required) => {
    if (granted.has(required)) return false;
    if (required.startsWith("read_") && granted.has(required.replace(/^read_/, "write_"))) return false;
    return true;
  });
}

function privacyWebhookTopic(req: express.Request) {
  return (req.header("x-shopify-topic") ?? "").toLowerCase();
}

function privacyWebhookShop(req: express.Request) {
  return normalizeShop(req.header("x-shopify-shop-domain") ?? req.body?.shop_domain);
}

async function generateIssuedCode(prefix = "") {
  const normalizedPrefix = prefix.replace(/[^a-z0-9]/gi, "").toUpperCase();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const number = Math.floor(Math.random() * 9_999_999) + 1;
    const code = `${normalizedPrefix}${number}UEN`;
    const [existingNote, existingInventory] = await Promise.all([
      prisma.universalExchangeNote.findUnique({ where: { code } }),
      prisma.uenCodeInventory.findUnique({ where: { code } })
    ]);
    if (!existingNote && !existingInventory) return code;
  }
  throw new Error("Could not generate a unique UEN code");
}

function numericProductId(gidOrId: string) {
  return gidOrId.split("/").pop() ?? gidOrId;
}

function normalizedSearchText(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function hubForShopDomain(shopDomain: string) {
  const shopName = normalizedSearchText(shopDomain.replace(/\.myshopify\.com$/, ""));
  const hubs = await prisma.exchangeHub.findMany({ where: { status: "ACTIVE" } });
  return hubs.find((hub) => {
    const name = normalizedSearchText(hub.name);
    const displayName = normalizedSearchText(hub.displayName);
    return (name.length >= 4 && shopName.includes(name)) || (displayName.length >= 4 && shopName.includes(displayName));
  }) ?? null;
}

async function ensureShopMerchantAccess(shopDomain: string, merchantId: string) {
  const hub = await hubForShopDomain(shopDomain);
  if (!hub) return null;

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      businessName: hub.displayName,
      isExchangeHub: true,
      linkedExchangeHubId: hub.id
    }
  });

  await prisma.merchantAccessRule.upsert({
    where: { merchantId_exchangeHubId: { merchantId, exchangeHubId: hub.id } },
    update: { status: "ACTIVE" },
    create: { merchantId, exchangeHubId: hub.id, status: "ACTIVE" }
  });

  return hub;
}

async function nextCodeForIssuance(exchangeHubId: string, issuanceProductId: string, prefix = "") {
  const inventoryCode =
    (await prisma.uenCodeInventory.findFirst({
      where: { issuanceProductId, status: "AVAILABLE" },
      orderBy: { createdAt: "asc" }
    })) ??
    (await prisma.uenCodeInventory.findFirst({
      where: { exchangeHubId, issuanceProductId: null, status: "AVAILABLE" },
      orderBy: { createdAt: "asc" }
    }));

  return inventoryCode ? { code: inventoryCode.code, inventoryCodeId: inventoryCode.id } : { code: await generateIssuedCode(prefix), inventoryCodeId: null };
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: error.flatten() });
  }
  console.error(error);
  return res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error" });
}

async function connectionFromRequest(req: express.Request, res: express.Response) {
  const shopDomain = String(req.query.shopDomain ?? req.body.shopDomain ?? req.header("x-shop-domain") ?? "");
  if (!shopDomain) {
    res.status(400).json({ error: "shopDomain is required" });
    return null;
  }
  const connection = await prisma.shopifyConnection.findUnique({
    where: { shopDomain },
    include: { merchant: { include: { offers: { orderBy: { createdAt: "desc" }, take: 1 } } } }
  });
  if (!connection) {
    res.status(404).json({ error: "Shopify store is not connected" });
    return null;
  }
  return connection;
}

async function subscribeOrdersPaidWebhook(shopDomain: string, accessToken: string) {
  const uri = `${config.shopifyAppUrl.replace(/\/$/, "")}/shopify/webhooks/orders-paid`;
  const response = await fetch(`https://${shopDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": accessToken
    },
    body: JSON.stringify({
      query: `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id topic uri }
            userErrors { field message }
          }
        }
      `,
      variables: {
        topic: "ORDERS_PAID",
        webhookSubscription: {
          uri,
          includeFields: ["id", "email", "customer", "line_items", "discount_codes", "total_price"]
        }
      }
    })
  });
  const payload = await response.json();
  const errors = payload.data?.webhookSubscriptionCreate?.userErrors ?? payload.errors ?? [];
  if (errors.length) {
    console.warn("Shopify webhook subscription warning", errors);
  }
}

async function createIssuanceDiscount(shopDomain: string, note: { id: string; code: string }, accessToken: string) {
  const connection = await prisma.shopifyConnection.findUnique({
    where: { shopDomain },
    include: { merchant: { include: { offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 } } } }
  });
  const offer = connection?.merchant.offers[0];
  if (!connection || !offer || (offer.discountType !== "PERCENTAGE" && offer.discountType !== "FIXED_AMOUNT")) {
    return;
  }

  await syncCodesToGroupedShopifyDiscount({
    connection: {
      merchantId: connection.merchantId,
      shopDomain,
      accessToken,
      merchantName: connection.merchant.businessName
    },
    offer,
    codes: [{ id: note.id, code: note.code, kind: "note" }]
  });
}

router.get("/auth", async (req, res) => {
  const onboardingToken = typeof req.query.onboardingToken === "string" ? req.query.onboardingToken : "";
  const onboarding = onboardingToken ? await prisma.merchantOnboarding.findUnique({ where: { token: onboardingToken } }) : null;
  const shop = normalizeShop(req.query.shop ?? onboarding?.shopDomain);
  if (!shop) return res.status(400).send("Missing or invalid shop parameter");
  if (onboardingToken && !onboarding) return res.status(404).send("Merchant onboarding link not found");
  if (onboarding && onboarding.shopDomain !== shop) return res.status(400).send("Onboarding link does not match this Shopify store");
  // If the store is already connected and this isn't a fresh onboarding flow,
  // skip OAuth and send the merchant straight to their portal. Forward the
  // host/embedded params so App Bridge can initialize inside the admin iframe.
  // Runs before the credential check because no OAuth is needed on this path.
  if (!onboardingToken) {
    const existingConn = await prisma.shopifyConnection.findUnique({ where: { shopDomain: shop } });
    if (existingConn?.status === "ACTIVE") {
      const portalParams = new URLSearchParams({ shopDomain: shop, shop });
      if (typeof req.query.host === "string" && req.query.host) portalParams.set("host", req.query.host);
      if (typeof req.query.embedded === "string" && req.query.embedded) portalParams.set("embedded", req.query.embedded);
      return res.redirect(`/shopify/merchant?${portalParams.toString()}`);
    }
  }

  if (!config.shopifyApiKey || !config.shopifyApiSecret) {
    return res.status(500).send("SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be configured");
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${config.shopifyAppUrl.replace(/\/$/, "")}/shopify/auth/callback`;
  const params = new URLSearchParams({
    client_id: config.shopifyApiKey,
    scope: config.shopifyScopes,
    redirect_uri: redirectUri,
    state
  });

  res.cookie("shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.shopifyAppUrl.startsWith("https://"),
    maxAge: 10 * 60 * 1000
  });
  if (onboarding) {
    res.cookie("shopify_onboarding_token", onboarding.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.shopifyAppUrl.startsWith("https://"),
      maxAge: 10 * 60 * 1000
    });
  }

  const oauthUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`;

  // When loaded inside the Shopify admin iframe the redirect must happen at
  // the top level, otherwise the OAuth page is sandboxed inside the frame.
  if (req.query.host) {
    return res.send(
      `<!doctype html><html><head><script>window.top.location.href=${JSON.stringify(oauthUrl)}</script></head><body></body></html>`
    );
  }
  res.redirect(oauthUrl);
});

router.get("/auth/callback", async (req, res) => {
  try {
    const shop = normalizeShop(req.query.shop);
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!shop || !code) return res.status(400).send("Missing Shopify OAuth callback parameters");
    if (state !== req.cookies?.shopify_oauth_state) return res.status(403).send("Invalid OAuth state");
    if (!verifyShopifyHmac(req.query)) return res.status(403).send("Invalid Shopify HMAC");

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: config.shopifyApiKey,
        client_secret: config.shopifyApiSecret,
        code
      })
    });

    if (!tokenResponse.ok) {
      return res.status(502).send(`Shopify token exchange failed with ${tokenResponse.status}`);
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token: string; scope?: string };
    const missingScopes = missingRequiredScopes(tokenPayload.scope ?? "");
    if (missingScopes.length) {
      return res.status(403).send(`Shopify did not grant required scopes: ${missingScopes.join(", ")}`);
    }

    const onboardingToken = String(req.cookies?.shopify_onboarding_token ?? "");
    const onboarding =
      (onboardingToken
        ? await prisma.merchantOnboarding.findUnique({ where: { token: onboardingToken }, include: { merchant: true } })
        : null) ??
      // Custom-distribution installs arrive via Shopify-generated links that
      // never pass through our onboarding URL, so the cookie is absent. A
      // pending onboarding record for this exact shop domain still identifies
      // the intended merchant — without it the name matcher below could
      // create a duplicate (e.g. renamed brands).
      (await prisma.merchantOnboarding.findFirst({
        where: { shopDomain: shop, status: { not: "INSTALLED" } },
        orderBy: { createdAt: "desc" },
        include: { merchant: true }
      }));
    if (onboarding && onboarding.shopDomain !== shop) return res.status(400).send("Onboarding link does not match this Shopify store");
    const existingConnection = await prisma.shopifyConnection.findUnique({ where: { shopDomain: shop } });
    const matchedHub = await hubForShopDomain(shop);
    let merchant =
      onboarding?.merchant ??
      (existingConnection ? await prisma.merchant.findUnique({ where: { id: existingConnection.merchantId } }) : null) ??
      (matchedHub ? await prisma.merchant.findFirst({ where: { linkedExchangeHubId: matchedHub.id } }) : null) ??
      (matchedHub
        ? await prisma.merchant.create({
            data: {
              businessName: matchedHub.displayName,
              platformType: "SHOPIFY",
              status: "ACTIVE",
              isExchangeHub: true,
              linkedExchangeHubId: matchedHub.id
            }
          })
        : null);

    // Fresh self-serve install: auto-create an ACTIVE merchant so the store owner
    // can configure their offer immediately without waiting for admin approval.
    let freshInstall = false;
    if (!merchant) {
      const shopName = shop.replace(/\.myshopify\.com$/, "").replace(/-/g, " ");
      merchant = await prisma.merchant.create({
        data: {
          businessName: shopName,
          platformType: "SHOPIFY",
          status: "ACTIVE"
        }
      });
      await prisma.merchantOffer.create({
        data: {
          merchantId: merchant.id,
          discountType: "PERCENTAGE",
          discountValue: 15,
          usageLimitPerNote: 1,
          status: "ACTIVE"
        }
      });
      freshInstall = true;
    }

    const connection = await prisma.shopifyConnection.upsert({
      where: { shopDomain: shop },
      update: {
        merchantId: merchant.id,
        accessToken: tokenPayload.access_token,
        scopes: tokenPayload.scope ?? config.shopifyScopes,
        status: "ACTIVE"
      },
      create: {
        merchantId: merchant.id,
        shopDomain: shop,
        accessToken: tokenPayload.access_token,
        scopes: tokenPayload.scope ?? config.shopifyScopes,
        status: "ACTIVE"
      }
    });

    if (onboarding) {
      await prisma.merchant.update({ where: { id: merchant.id }, data: { status: MerchantStatus.ACTIVE } });
      if (onboarding.requestedExchangeHubId) {
        await prisma.merchantAccessRule.upsert({
          where: { merchantId_exchangeHubId: { merchantId: merchant.id, exchangeHubId: onboarding.requestedExchangeHubId } },
          update: { status: "ACTIVE" },
          create: { merchantId: merchant.id, exchangeHubId: onboarding.requestedExchangeHubId, status: "ACTIVE" }
        });
      }
      await prisma.merchantOnboarding.update({
        where: { id: onboarding.id },
        data: { status: "INSTALLED", installedAt: new Date(), shopDomain: shop }
      });
    } else {
      await ensureShopMerchantAccess(shop, merchant.id);
    }

    await audit({
      action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
      actorType: "merchant",
      entityType: "ShopifyConnection",
      entityId: connection.id,
      message: "Shopify OAuth install completed"
    });

    await subscribeOrdersPaidWebhook(shop, tokenPayload.access_token);

    // Load existing UEN codes and the grandfathered legacy code list into the
    // newly connected store. Runs after the response so the OAuth redirect
    // isn't held up by ~30 bulk-add calls; progress lands in the sync logs.
    const merchantIdForSync = merchant.id;
    setImmediate(async () => {
      try {
        await syncMerchantUensToShopify(merchantIdForSync, shop, "AUTO_INSTALL");
      } catch (syncError) {
        console.warn("Auto-sync on merchant install failed (non-fatal):", syncError);
      }
      try {
        await syncGrandfatheredCodesToMerchant(merchantIdForSync, shop, "AUTO_INSTALL");
      } catch (syncError) {
        console.warn("Grandfather sync on merchant install failed (non-fatal):", syncError);
      }
    });

    // Notify all holders in the linked hub about the new merchant
    try {
      const linkedHubId = merchant.linkedExchangeHubId;
      if (linkedHubId) {
        const holders = await prisma.holder.findMany({
          where: { exchangeHubId: linkedHubId, status: "ACTIVE" }
        });
        if (holders.length) {
          await prisma.holderNotification.createMany({
            data: holders.map((h) => ({
              holderId: h.id,
              title: "New merchant joined the network",
              body: `${merchant.businessName} is now accepting your Universal Exchange Notes. All your purchased UENs are ready to use at their store.`
            }))
          });
        }
      }
    } catch (notifyError) {
      console.warn("Holder notification on merchant install failed (non-fatal):", notifyError);
    }

    res.clearCookie("shopify_oauth_state");
    res.clearCookie("shopify_onboarding_token");
    if (onboarding) {
      res.redirect(`/merchant/install/${encodeURIComponent(onboarding.token)}?installed=1`);
    } else if (freshInstall || config.shopifyApiKey) {
      // Send the merchant back into the Shopify admin embedded context.
      // /shopify/auth will detect the active connection and serve the merchant portal.
      const embeddedUrl = config.shopifyApiKey
        ? `https://${shop}/admin/apps/${config.shopifyApiKey}`
        : `/shopify/merchant?shopDomain=${encodeURIComponent(shop)}`;
      res.redirect(embeddedUrl);
    } else {
      res.redirect(`/shopify/merchant?shopDomain=${encodeURIComponent(shop)}`);
    }
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/webhooks/orders-paid", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      return res.status(401).send("Invalid Shopify webhook HMAC");
    }

    const shopDomain = normalizeShop(req.header("x-shopify-shop-domain"));
    if (!shopDomain) return res.status(400).send("Missing shop domain");

    const order = req.body as {
      id?: number | string;
      email?: string;
      total_price?: string;
      customer?: { email?: string; first_name?: string; last_name?: string };
      line_items?: Array<{ id?: number | string; product_id?: number | string; title?: string }>;
      discount_codes?: Array<{ code?: string; amount?: string; type?: string }>;
    };
    const orderId = String(order.id ?? "");
    // Lowercased so holder records line up with self-registration and the
    // grandfathered-code email reservations.
    const customerEmail = (order.email ?? order.customer?.email)?.trim().toLowerCase();
    if (!orderId || !customerEmail) return res.status(200).send("Order missing id or customer email");

    for (const lineItem of order.line_items ?? []) {
      const productId = String(lineItem.product_id ?? "");
      if (!productId) continue;

      const mappedProduct = await prisma.shopifyIssuanceProduct.findFirst({
        where: { shopDomain, shopifyProductId: productId, status: "ACTIVE" },
        include: { exchangeHub: true }
      });
      if (!mappedProduct) continue;

      const lineItemId = String(lineItem.id ?? productId);
      const existingLog = await prisma.uenIssuanceLog.findUnique({
        where: { shopDomain_shopifyOrderId_shopifyLineItemId: { shopDomain, shopifyOrderId: orderId, shopifyLineItemId: lineItemId } }
      });
      if (existingLog) continue;

      const holder = await prisma.holder.upsert({
        where: { exchangeHubId_email: { exchangeHubId: mappedProduct.exchangeHubId, email: customerEmail } },
        update: {
          firstName: order.customer?.first_name ?? "Shopify",
          lastName: order.customer?.last_name ?? "Customer"
        },
        create: {
          exchangeHubId: mappedProduct.exchangeHubId,
          firstName: order.customer?.first_name ?? "Shopify",
          lastName: order.customer?.last_name ?? "Customer",
          email: customerEmail
        }
      });

      const issuedCode = await nextCodeForIssuance(mappedProduct.exchangeHubId, mappedProduct.id, mappedProduct.exchangeHub.codePrefix ?? "");
      const note = await prisma.universalExchangeNote.create({
        data: {
          exchangeHubId: mappedProduct.exchangeHubId,
          holderId: holder.id,
          code: issuedCode.code
        }
      });
      if (issuedCode.inventoryCodeId) {
        await prisma.uenCodeInventory.update({
          where: { id: issuedCode.inventoryCodeId },
          data: {
            status: "ISSUED",
            issuedToEmail: customerEmail,
            issuedAt: new Date(),
            universalExchangeNoteId: note.id
          }
        });
      }

      await prisma.uenIssuanceLog.create({
        data: {
          issuanceProductId: mappedProduct.id,
          shopDomain,
          shopifyOrderId: orderId,
          shopifyLineItemId: lineItemId,
          customerEmail,
          universalExchangeNoteId: note.id,
          status: "ISSUED",
          message: mappedProduct.digitalAssetUrl ? `Digital asset: ${mappedProduct.digitalAssetUrl}; UEN: ${note.code}` : `UEN: ${note.code}`
        }
      });
    }

    // ── Redemption tracking: mark UEN codes used via discount codes ──
    const discountCodes = order.discount_codes ?? [];
    if (discountCodes.length > 0 && shopDomain) {
      const orderTotal = order.total_price ? Number(order.total_price) : null;
      for (const dc of discountCodes) {
        const code = String(dc.code ?? "").trim().toUpperCase();
        if (!code) continue;
        try {
          await prisma.shopifySyncedNote.updateMany({
            where: {
              shopDomain,
              uenCode: code,
              redeemedAt: null
            },
            data: {
              redeemedAt: new Date(),
              redeemedOrderId: orderId,
              redeemedOrderAmount: orderTotal
            }
          });
        } catch (redeemError) {
          console.warn("Could not mark UEN redemption for code", code, redeemError);
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Webhook processing failed");
  }
});

router.post("/webhooks/privacy", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      return res.status(401).send("Invalid Shopify webhook HMAC");
    }

    const topic = privacyWebhookTopic(req);
    const shopDomain = privacyWebhookShop(req);
    if (!shopDomain) return res.status(400).send("Missing shop domain");

    const payload = req.body as {
      customer?: { id?: number | string; email?: string; phone?: string };
      shop_id?: number | string;
      data_request?: { id?: number | string };
    };
    const email = payload.customer?.email?.trim().toLowerCase();

    if (topic === "customers/data_request") {
      await audit({
        action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
        actorType: "system",
        entityType: "ShopifyPrivacyRequest",
        entityId: String(payload.data_request?.id ?? payload.customer?.id ?? shopDomain),
        message: `Customer data request received for ${shopDomain}${email ? ` (${email})` : ""}`
      });
      return res.status(200).send("OK");
    }

    if (topic === "customers/redact") {
      if (email) {
        const holders = await prisma.holder.findMany({ where: { email } });
        await prisma.$transaction([
          prisma.holderNotification.deleteMany({ where: { holderId: { in: holders.map((holder) => holder.id) } } }),
          prisma.uenIssuanceLog.updateMany({
            where: { shopDomain, customerEmail: email },
            data: { customerEmail: `redacted-${crypto.createHash("sha256").update(`${shopDomain}:${email}`).digest("hex").slice(0, 16)}@redacted.local` }
          }),
          prisma.uenCodeInventory.updateMany({
            where: { issuedToEmail: email },
            data: { issuedToEmail: null }
          }),
          prisma.holder.updateMany({
            where: { email },
            data: {
              firstName: "Redacted",
              lastName: "Customer",
              email: `redacted-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 16)}@redacted.local`,
              phone: null,
              portalToken: null,
              status: "REDACTED"
            }
          })
        ]);
      }
      return res.status(200).send("OK");
    }

    if (topic === "shop/redact") {
      const connections = await prisma.shopifyConnection.findMany({ where: { shopDomain } });
      await prisma.$transaction([
        prisma.shopifyConnection.updateMany({ where: { shopDomain }, data: { accessToken: "", status: "REDACTED" } }),
        prisma.shopifySyncedNote.updateMany({ where: { shopDomain }, data: { syncStatus: "REDACTED", errorMessage: null } }),
        prisma.shopifyInventorySyncedCode.updateMany({ where: { shopDomain }, data: { syncStatus: "REDACTED", errorMessage: null } }),
        prisma.shopifyDiscountGroup.updateMany({ where: { shopDomain }, data: { status: "REDACTED" } }),
        prisma.shopifyIssuanceProduct.updateMany({ where: { shopDomain }, data: { status: "REDACTED", digitalAssetUrl: null } }),
        prisma.auditLog.create({
          data: {
            action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
            actorType: "system",
            entityType: "ShopifyPrivacyRequest",
            entityId: connections[0]?.id ?? shopDomain,
            message: `Shop redaction received for ${shopDomain}`
          }
        })
      ]);
      return res.status(200).send("OK");
    }

    return res.status(400).send("Unsupported privacy webhook topic");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Privacy webhook processing failed");
  }
});

router.post("/platform-connection", async (req, res) => {
  try {
    const data = platformConnectionSchema.parse(req.body);
    const apiKey = await prisma.merchantApiKey.findUnique({
      where: { keyHash: hashSecret(data.connectionToken) },
      include: { merchant: true }
    });
    if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt <= new Date())) {
      return res.status(401).json({ error: "Invalid or expired platform connection token" });
    }

    const connection = await prisma.shopifyConnection.upsert({
      where: { shopDomain: data.shopDomain },
      update: {
        merchantId: apiKey.merchantId,
        accessToken: data.accessToken ?? "shpat_placeholder_local_dev",
        scopes: config.shopifyScopes,
        status: "ACTIVE"
      },
      create: {
        merchantId: apiKey.merchantId,
        shopDomain: data.shopDomain,
        accessToken: data.accessToken ?? "shpat_placeholder_local_dev",
        scopes: config.shopifyScopes,
        status: "ACTIVE"
      }
    });
    await audit({
      action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
      actorId: apiKey.id,
      actorType: "merchant",
      entityType: "ShopifyConnection",
      entityId: connection.id,
      message: "Shopify store linked to merchant"
    });
    res.status(201).json({ id: connection.id, merchantId: connection.merchantId, shopDomain: connection.shopDomain, status: connection.status });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/dashboard", requireMerchantSession, async (req, res) => {
  const connection = await connectionFromRequest(req, res);
  if (!connection) return;
  await ensureShopMerchantAccess(connection.shopDomain, connection.merchantId);
  const [syncedCount, lastLog] = await Promise.all([
    prisma.shopifySyncedNote.count({ where: { merchantId: connection.merchantId, shopDomain: connection.shopDomain, syncStatus: "SYNCED" } }),
    prisma.syncLog.findFirst({ where: { merchantId: connection.merchantId, shopDomain: connection.shopDomain }, orderBy: { createdAt: "desc" } })
  ]);
  res.json({
    platformConnectionStatus: connection.status,
    merchantStatus: connection.merchant.status,
    activeOffer: connection.merchant.offers[0] ?? null,
    totalSyncedUens: syncedCount,
    lastSyncTime: connection.lastSyncAt ?? lastLog?.createdAt ?? null,
    merchantId: connection.merchantId,
    shopDomain: connection.shopDomain
  });
});

router.get("/products", requireMerchantSession, async (req, res) => {
  try {
    const connection = await connectionFromRequest(req, res);
    if (!connection) return;
    const search = String(req.query.query ?? "");
    const response = await fetch(`https://${connection.shopDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-access-token": connection.accessToken
      },
      body: JSON.stringify({
        query: `
          query Products($first: Int!, $query: String) {
            products(first: $first, query: $query) {
              nodes {
                id
                title
                handle
                featuredMedia {
                  preview {
                    image { url }
                  }
                }
              }
            }
          }
        `,
        variables: { first: 100, query: search || null }
      })
    });
    if (!response.ok) return res.status(response.status).json({ error: "Could not fetch Shopify products" });
    const payload = await response.json();
    if (payload.errors?.length) return res.status(502).json({ error: payload.errors.map((error: { message: string }) => error.message).join("; ") });
    res.json(
      payload.data.products.nodes.map((product: { id: string; title: string; handle: string; featuredMedia?: { preview?: { image?: { url?: string } } } }) => ({
        id: numericProductId(product.id),
        gid: product.id,
        title: product.title,
        handle: product.handle,
        imageUrl: product.featuredMedia?.preview?.image?.url
      }))
    );
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/offer-settings", requireMerchantSession, async (req, res) => {
  try {
    const connection = await connectionFromRequest(req, res);
    if (!connection) return;
    const data = createOfferSchema.parse(req.body);
    const offer = await prisma.merchantOffer.create({
      data: {
        ...data,
        merchantId: connection.merchantId,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined
      }
    });
    await audit({
      action: AuditAction.MERCHANT_OFFER_CHANGED,
      actorType: "merchant",
      entityType: "MerchantOffer",
      entityId: offer.id,
      message: "Merchant changed offer settings in Shopify app"
    });
    res.status(201).json(offer);
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/pause", requireMerchantSession, async (req, res) => {
  try {
    const connection = await connectionFromRequest(req, res);
    if (!connection) return;
    const merchant = await prisma.merchant.update({
      where: { id: connection.merchantId },
      data: { status: MerchantStatus.PAUSED }
    });
    res.json({ merchantId: merchant.id, status: merchant.status });
  } catch (error) {
    handleError(res, error);
  }
});

// Self-service credential reset from inside the Shopify admin. No emails:
// a valid App Bridge session token proves the caller owns the store, which
// is stronger proof of identity than any email round trip.
router.post("/merchant/reset-credentials", async (req, res) => {
  try {
    const authHeader = String(req.header("authorization") ?? "");
    const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionToken ? verifyShopifySessionToken(sessionToken) : null;
    if (!session) {
      return res.status(401).json({ error: "Could not verify store ownership. Open this app from your Shopify admin and try again." });
    }

    const { newEmail, newPassword } = req.body as { newEmail?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const connection = await prisma.shopifyConnection.findUnique({
      where: { shopDomain: session.shop },
      include: { merchant: true }
    });
    if (!connection) return res.status(404).json({ error: "This store is not connected to the UEN platform yet" });

    const updates: Record<string, unknown> = { passwordHash: await bcrypt.hash(newPassword, 12) };
    if (newEmail) updates.contactEmail = newEmail.trim().toLowerCase();
    try {
      await prisma.merchant.update({ where: { id: connection.merchantId }, data: updates });
    } catch (updateError) {
      if ((updateError as { code?: string }).code === "P2002") {
        return res.status(409).json({ error: "That email is already used by another merchant account" });
      }
      throw updateError;
    }

    await audit({
      action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
      actorType: "merchant",
      entityType: "Merchant",
      entityId: connection.merchantId,
      message: `Merchant credentials reset from embedded app (${session.shop})`
    });

    res.json({ ok: true, contactEmail: newEmail?.trim().toLowerCase() ?? connection.merchant.contactEmail ?? null });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/sync", requireMerchantSession, async (req, res) => {
  try {
    const connection = await connectionFromRequest(req, res);
    if (!connection) return;
    await ensureShopMerchantAccess(connection.shopDomain, connection.merchantId);
    const log = await syncMerchantUensToShopify(connection.merchantId, connection.shopDomain, "MANUAL");
    const grandfather = await syncGrandfatheredCodesToMerchant(connection.merchantId, connection.shopDomain, "MANUAL");
    res.json({ ...log, grandfather });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/sync-logs", requireMerchantSession, async (req, res) => {
  const connection = await connectionFromRequest(req, res);
  if (!connection) return;
  res.json(
    await prisma.syncLog.findMany({
      where: { merchantId: connection.merchantId, shopDomain: connection.shopDomain },
      orderBy: { createdAt: "desc" }
    })
  );
});

router.get("/analytics", requireMerchantSession, async (req, res) => {
  try {
    const connection = await connectionFromRequest(req, res);
    if (!connection) return;
    const merchantId = connection.merchantId;
    const period = String(req.query.period ?? "month");
    const now = new Date();
    const since =
      period === "day" ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : period === "year" ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      : period === "max" ? null
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const redemptionFilter = since
      ? { merchantId, redeemedAt: { gte: since } }
      : { merchantId, redeemedAt: { not: null } };

    const historicalFilter = since
      ? { merchantId, redeemedAt: { gte: since } }
      : { merchantId };

    const [
      totalSynced,
      redemptionsInPeriod,
      allTimeRedemptions,
      allTimeRevenue,
      historicalInPeriod,
      allTimeHistorical,
      syncLogs
    ] = await Promise.all([
      prisma.shopifySyncedNote.count({ where: { merchantId, syncStatus: "SYNCED" } }),
      prisma.shopifySyncedNote.findMany({
        where: redemptionFilter,
        select: { redeemedOrderAmount: true }
      }),
      prisma.shopifySyncedNote.count({ where: { merchantId, redeemedAt: { not: null } } }),
      prisma.shopifySyncedNote.findMany({
        where: { merchantId, redeemedAt: { not: null } },
        select: { redeemedOrderAmount: true }
      }),
      prisma.merchantHistoricalRedemption.findMany({
        where: historicalFilter,
        select: { orderAmount: true }
      }),
      prisma.merchantHistoricalRedemption.findMany({
        where: { merchantId },
        select: { orderAmount: true }
      }),
      prisma.syncLog.findMany({
        where: { merchantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { status: true, totalCreated: true, totalErrors: true, message: true, createdAt: true }
      })
    ]);

    const liveRevenueInPeriod = redemptionsInPeriod.reduce((sum, r) => sum + (r.redeemedOrderAmount ? Number(r.redeemedOrderAmount) : 0), 0);
    const liveAllTimeRevenue = allTimeRevenue.reduce((sum, r) => sum + (r.redeemedOrderAmount ? Number(r.redeemedOrderAmount) : 0), 0);
    const histRevenueInPeriod = historicalInPeriod.reduce((sum, r) => sum + (r.orderAmount ? Number(r.orderAmount) : 0), 0);
    const histAllTimeRevenue = allTimeHistorical.reduce((sum, r) => sum + (r.orderAmount ? Number(r.orderAmount) : 0), 0);

    res.json({
      totalSyncedUens: totalSynced,
      // Live + historical combined
      allTimeRedemptions: allTimeRedemptions + allTimeHistorical.length,
      allTimeRevenue: liveAllTimeRevenue + histAllTimeRevenue,
      redemptionsInPeriod: redemptionsInPeriod.length + historicalInPeriod.length,
      revenueInPeriod: liveRevenueInPeriod + histRevenueInPeriod,
      // Breakdown for transparency
      historicalRedemptions: allTimeHistorical.length,
      historicalRevenue: histAllTimeRevenue,
      recentSyncLogs: syncLogs
    });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
