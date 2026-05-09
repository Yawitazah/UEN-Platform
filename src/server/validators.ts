import { z } from "zod";

export const createHubSchema = z.object({
  name: z.string().min(2),
  displayName: z.string().min(2),
  hubType: z.string().min(2),
  logoUrl: z.string().url().optional().or(z.literal("")),
  brandColor: z.string().optional(),
  codePrefix: z.string().max(24).regex(/^[A-Z0-9]*$/i).optional(),
  customDomain: z.string().optional(),
  subdomain: z.string().optional()
});

export const createHolderSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional()
});

export const createUenSchema = z.object({
  holderId: z.string().min(1),
  code: z.string().min(4).max(64).regex(/^[A-Z0-9]+UEN$/i).optional(),
  codePrefix: z.string().max(24).regex(/^[A-Z0-9]*$/i).optional(),
  campaignId: z.string().optional(),
  expiresAt: z.string().datetime().optional()
});

export const validateUenSchema = z.object({
  merchantId: z.string().min(1),
  code: z.string().min(3)
});

export const createMerchantSchema = z.object({
  businessName: z.string().min(2),
  platformType: z.enum(["SHOPIFY", "WOOCOMMERCE", "WIX", "CUSTOM", "MANUAL"]).default("SHOPIFY"),
  isExchangeHub: z.boolean().default(false),
  linkedExchangeHubId: z.string().optional()
});

export const createOfferSchema = z.object({
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING", "BONUS_ITEM", "CUSTOM"]),
  discountValue: z.coerce.number().nonnegative().optional(),
  minimumOrderAmount: z.coerce.number().nonnegative().optional(),
  usageLimitPerNote: z.coerce.number().int().positive().default(1),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "EXPIRED", "DRAFT"]).default("ACTIVE")
});

export const createAccessRuleSchema = z.object({
  exchangeHubId: z.string().min(1),
  status: z.enum(["ACTIVE", "PAUSED", "BLOCKED"]).default("ACTIVE")
});

export const platformConnectionSchema = z.object({
  connectionToken: z.string().min(8),
  shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  accessToken: z.string().optional()
});

export const createIssuanceProductSchema = z.object({
  exchangeHubId: z.string().min(1),
  shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  shopifyProductId: z.string().min(1),
  productTitle: z.string().optional(),
  digitalAssetUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "PAUSED", "DISABLED"]).default("ACTIVE")
});
