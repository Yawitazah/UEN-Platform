import { z } from "zod";

// Single source of truth for password strength, reused everywhere a password is
// set (signup, setup, reset). Industry-standard baseline: at least 8 characters
// with at least one letter and one number. Keep the message in sync with the
// client-side hint in main.tsx so users see the same rule on both sides.
export const PASSWORD_MIN_MESSAGE = "Use at least 8 characters, including a letter and a number.";
export const passwordRule = z
  .string()
  .min(8, PASSWORD_MIN_MESSAGE)
  .regex(/[A-Za-z]/, PASSWORD_MIN_MESSAGE)
  .regex(/[0-9]/, PASSWORD_MIN_MESSAGE);

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

export const updateHubSchema = createHubSchema.partial();

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
  productImageUrl: z.string().url().optional().or(z.literal("")),
  digitalAssetUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "PAUSED", "DISABLED"]).default("ACTIVE")
});

export const bulkGenerateCodesSchema = z.object({
  count: z.coerce.number().int().min(1).max(500),
  issuanceProductId: z.string().optional()
});

export const bulkImportCodesSchema = z.object({
  codes: z.array(z.string().min(4).max(64).regex(/^[A-Z0-9]+UEN$/i)).min(1).max(500),
  issuanceProductId: z.string().optional()
});

// Grandfathered legacy codes (e.g. 2022 Love Notes) don't follow the UEN
// suffix convention and carry an email reservation from the original purchase.
export const importGrandfatheredCodesSchema = z.object({
  campaignId: z.string().min(1).max(64).default("LOVE-NOTES-2022"),
  entries: z
    .array(
      z.object({
        code: z.string().min(4).max(64).regex(/^[A-Za-z0-9]+$/),
        email: z.string().email().nullable().optional(),
        purchasedAt: z.string().datetime({ offset: true }).optional(),
        orderName: z.string().max(32).optional()
      })
    )
    .min(1)
    .max(500)
});

export const merchantOnboardingSchema = z.object({
  businessName: z.string().min(2).max(120),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email(),
  shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  requestedExchangeHubId: z.string().optional()
});
