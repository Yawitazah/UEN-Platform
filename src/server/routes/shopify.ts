import crypto from "node:crypto";
import express from "express";
import { ZodError } from "zod";
import { audit } from "../audit";
import { config } from "../config";
import { AuditAction, MerchantStatus } from "../constants";
import { prisma } from "../db";
import { hashSecret } from "../security";
import { createShopifyDiscountCode } from "../services/shopifyGraphql";
import { syncMerchantUensToShopify } from "../services/sync";
import { createOfferSchema, platformConnectionSchema } from "../validators";

const router = express.Router();

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
          includeFields: ["id", "email", "customer", "line_items"]
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

  const result = await createShopifyDiscountCode({
    shopDomain,
    accessToken,
    code: note.code,
    title: `${note.code} Universal Exchange Note`,
    discountType: offer.discountType,
    discountValue: Number(offer.discountValue ?? 0),
    usageLimitPerNote: offer.usageLimitPerNote,
    minimumOrderAmount: offer.minimumOrderAmount ? Number(offer.minimumOrderAmount) : undefined,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt
  });

  await prisma.shopifySyncedNote.upsert({
    where: { merchantId_universalExchangeNoteId: { merchantId: connection.merchantId, universalExchangeNoteId: note.id } },
    update: {
      shopDomain,
      uenCode: note.code,
      shopifyDiscountId: result.shopifyDiscountId,
      shopifyDiscountCodeId: result.shopifyDiscountCodeId,
      syncStatus: "SYNCED",
      lastSyncedAt: new Date(),
      errorMessage: null
    },
    create: {
      merchantId: connection.merchantId,
      shopDomain,
      universalExchangeNoteId: note.id,
      uenCode: note.code,
      shopifyDiscountId: result.shopifyDiscountId,
      shopifyDiscountCodeId: result.shopifyDiscountCodeId,
      syncStatus: "SYNCED",
      lastSyncedAt: new Date()
    }
  });
}

router.get("/auth", async (req, res) => {
  const shop = normalizeShop(req.query.shop);
  if (!shop) return res.status(400).send("Missing or invalid shop parameter");
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
  res.redirect(`https://${shop}/admin/oauth/authorize?${params.toString()}`);
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
    const existingConnection = await prisma.shopifyConnection.findUnique({ where: { shopDomain: shop } });
    const matchedHub = await hubForShopDomain(shop);
    const merchant =
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
        : await prisma.merchant.findFirst({ where: { businessName: "Merchant A" } }));
    if (!merchant) return res.status(404).send("Merchant A is not seeded");

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

    await ensureShopMerchantAccess(shop, merchant.id);

    await audit({
      action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
      actorType: "merchant",
      entityType: "ShopifyConnection",
      entityId: connection.id,
      message: "Shopify OAuth install completed"
    });

    await subscribeOrdersPaidWebhook(shop, tokenPayload.access_token);

    res.clearCookie("shopify_oauth_state");
    res.redirect(`/shopify?shopDomain=${encodeURIComponent(shop)}`);
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
      customer?: { email?: string; first_name?: string; last_name?: string };
      line_items?: Array<{ id?: number | string; product_id?: number | string; title?: string }>;
    };
    const orderId = String(order.id ?? "");
    const customerEmail = order.email ?? order.customer?.email;
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

      const connection = await prisma.shopifyConnection.findUnique({ where: { shopDomain } });
      if (connection) {
        await createIssuanceDiscount(shopDomain, note, connection.accessToken);
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

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Webhook processing failed");
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

router.get("/dashboard", async (req, res) => {
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

router.get("/products", async (req, res) => {
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

router.post("/offer-settings", async (req, res) => {
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

router.post("/pause", async (req, res) => {
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

router.post("/sync", async (req, res) => {
  try {
    const connection = await connectionFromRequest(req, res);
    if (!connection) return;
    await ensureShopMerchantAccess(connection.shopDomain, connection.merchantId);
    const log = await syncMerchantUensToShopify(connection.merchantId, connection.shopDomain, "MANUAL");
    res.json(log);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/sync-logs", async (req, res) => {
  const connection = await connectionFromRequest(req, res);
  if (!connection) return;
  res.json(
    await prisma.syncLog.findMany({
      where: { merchantId: connection.merchantId, shopDomain: connection.shopDomain },
      orderBy: { createdAt: "desc" }
    })
  );
});

export default router;
