import bcrypt from "bcryptjs";
import express from "express";
import { z, ZodError } from "zod";
import { prisma } from "../db";
import { createAdminSession, createMerchantSession } from "../security";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function cookieOptions(req: express.Request) {
  const secure = req.secure || req.header("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    // Admin panel is always accessed directly (never in a cross-origin iframe)
    // so Lax is correct and works in all browsers without third-party cookie issues.
    sameSite: "lax" as const,
    secure,
    maxAge: 1000 * 60 * 60 * 24 * 7
  };
}

function merchantCookieOptions(req: express.Request) {
  const secure = req.secure || req.header("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    secure,
    maxAge: 1000 * 60 * 60 * 24 * 30
  };
}

// Unified sign-in. Tries the admin directory first, then falls back to the
// merchant directory (creators / Exchange Hub applicants are merchants until
// approved, and stay merchant-authenticated afterward). This means one login
// form works for every account type — admins land on the platform dashboard,
// merchants/creators land on the merchant portal. The response says which kind
// of account signed in and where the client should send them.
router.post("/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const email = data.email.toLowerCase();

    // 1) Admin account
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (admin && (await bcrypt.compare(data.password, admin.passwordHash))) {
      const sessionToken = createAdminSession(admin);
      res.cookie("uen_session", sessionToken, cookieOptions(req));
      return res.json({
        actorType: "admin",
        redirect: "/admin",
        user: { id: admin.id, email: admin.email, role: admin.role },
        token: sessionToken
      });
    }

    // 2) Merchant / creator account
    const merchant = await prisma.merchant.findUnique({
      where: { contactEmail: email },
      include: { shopifyConnections: { where: { status: "ACTIVE" }, take: 1 } }
    });
    if (merchant?.passwordHash && (await bcrypt.compare(data.password, merchant.passwordHash))) {
      const merchantToken = createMerchantSession({ id: merchant.id, merchantId: merchant.id });
      res.cookie("uen_merchant_session", merchantToken, merchantCookieOptions(req));
      const shopDomain = merchant.shopifyConnections[0]?.shopDomain ?? null;
      return res.json({
        actorType: "merchant",
        redirect: shopDomain ? `/shopify/merchant?shop=${encodeURIComponent(shopDomain)}` : "/shopify/merchant",
        merchant: { id: merchant.id, businessName: merchant.businessName, contactEmail: merchant.contactEmail }
      });
    }

    return res.status(401).json({ error: "Invalid email or password" });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error(error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("uen_session", cookieOptions(req));
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.auth || req.auth.actorType !== "admin") return res.status(401).json({ error: "Unauthorized" });
  res.json({ user: { id: req.auth.actorId, role: req.auth.role } });
});

export default router;
