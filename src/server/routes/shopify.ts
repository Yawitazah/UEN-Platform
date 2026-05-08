import crypto from "node:crypto";
import express from "express";
import { ZodError } from "zod";
import { audit } from "../audit";
import { config } from "../config";
import { AuditAction, MerchantStatus } from "../constants";
import { prisma } from "../db";
import { hashSecret } from "../security";
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
    const merchant = await prisma.merchant.findFirst({ where: { businessName: "Merchant A" } });
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

    await audit({
      action: AuditAction.SHOPIFY_CONNECTION_CHANGED,
      actorType: "merchant",
      entityType: "ShopifyConnection",
      entityId: connection.id,
      message: "Shopify OAuth install completed"
    });

    res.clearCookie("shopify_oauth_state");
    res.redirect(`/shopify?shopDomain=${encodeURIComponent(shop)}`);
  } catch (error) {
    handleError(res, error);
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
        scopes: "read_discounts,write_discounts",
        status: "ACTIVE"
      },
      create: {
        merchantId: apiKey.merchantId,
        shopDomain: data.shopDomain,
        accessToken: data.accessToken ?? "shpat_placeholder_local_dev",
        scopes: "read_discounts,write_discounts",
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
