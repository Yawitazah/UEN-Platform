import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import express from "express";
import { z, ZodError } from "zod";
import { prisma } from "../db";
import {
  createAdminSession,
  createMerchantSession,
  createPasswordResetToken,
  verifyPasswordResetToken,
  passwordFingerprint,
  createHolderLoginToken
} from "../security";
import { passwordRule } from "../validators";
import { loginRateLimited, publicBaseUrl } from "../util/http";
import { sendPasswordResetEmail, sendPasswordChangedEmail, sendHolderLoginEmail } from "../services/mailer";

const router = express.Router();

// Password is optional: wallet (holder) members who never set one can sign in
// with just their email (we send them a one-time link). Admins and merchants
// still need a password — they simply won't match without one.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
  remember: z.boolean().optional()
});

// "Remember me" controls cookie persistence: when true the cookie carries a
// maxAge so it survives browser restarts; when false we omit maxAge, making it a
// session cookie that the browser clears on close. The signed token's own expiry
// is the upper bound either way.
function cookieOptions(req: express.Request, remember = true) {
  const secure = req.secure || req.header("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    // Admin panel is always accessed directly (never in a cross-origin iframe)
    // so Lax is correct and works in all browsers without third-party cookie issues.
    sameSite: "lax" as const,
    secure,
    ...(remember ? { maxAge: 1000 * 60 * 60 * 24 * 7 } : {})
  };
}

function merchantCookieOptions(req: express.Request, remember = true) {
  const secure = req.secure || req.header("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    secure,
    ...(remember ? { maxAge: 1000 * 60 * 60 * 24 * 30 } : {})
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
    const password = data.password ?? "";
    const remember = data.remember !== false; // default to staying signed in

    // Throttle brute-force attempts, keyed by IP + email so one attacker can't
    // grind a single account and one IP can't spray many accounts.
    if (loginRateLimited(`login:${req.ip}:${email}`)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }

    // 1) Admin account (requires a password)
    const admin = password ? await prisma.adminUser.findUnique({ where: { email } }) : null;
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      const sessionToken = createAdminSession(admin);
      res.cookie("uen_session", sessionToken, cookieOptions(req, remember));
      return res.json({
        actorType: "admin",
        redirect: "/admin",
        user: { id: admin.id, email: admin.email, role: admin.role },
        token: sessionToken
      });
    }

    // 2) Merchant / creator account (requires a password)
    const merchant = password
      ? await prisma.merchant.findUnique({
          where: { contactEmail: email },
          include: { shopifyConnections: { where: { status: "ACTIVE" }, take: 1 } }
        })
      : null;
    if (merchant?.passwordHash && (await bcrypt.compare(password, merchant.passwordHash))) {
      const merchantToken = createMerchantSession({ id: merchant.id, merchantId: merchant.id });
      res.cookie("uen_merchant_session", merchantToken, merchantCookieOptions(req, remember));
      const shopDomain = merchant.shopifyConnections[0]?.shopDomain ?? null;
      return res.json({
        actorType: "merchant",
        redirect: shopDomain ? `/shopify/merchant?shop=${encodeURIComponent(shopDomain)}` : "/shopify/merchant",
        merchant: { id: merchant.id, businessName: merchant.businessName, contactEmail: merchant.contactEmail }
      });
    }

    // 3) Wallet (holder) account. The same Sign In form works for shoppers —
    // they shouldn't have to know they're a "holder". If they set a password and
    // it matches, open their wallet straight away. Otherwise (no password set, or
    // password didn't match) email them a one-time sign-in link so they still get
    // in without bouncing to another page.
    const holders = await prisma.holder.findMany({
      where: { email, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });
    if (holders.length) {
      if (password) {
        for (const h of holders) {
          if (h.passwordHash && (await bcrypt.compare(password, h.passwordHash))) {
            const portalToken = h.portalToken ?? crypto.randomBytes(24).toString("base64url");
            if (!h.portalToken) {
              await prisma.holder.update({ where: { id: h.id }, data: { portalToken } });
            }
            return res.json({
              actorType: "holder",
              redirect: `/holder/portal?token=${encodeURIComponent(portalToken)}`,
              portalToken
            });
          }
        }
      }

      // No password match (or none supplied): send the wallet a sign-in link.
      // We already know which hub this holder belongs to, so no hub picker.
      const target = holders[0];
      const hub = await prisma.exchangeHub.findUnique({ where: { id: target.exchangeHubId } });
      if (hub && hub.status === "ACTIVE") {
        const loginToken = createHolderLoginToken({ email, exchangeHubId: target.exchangeHubId });
        const link = `${publicBaseUrl(req)}/api/holder/verify?lt=${encodeURIComponent(loginToken)}`;
        try {
          await sendHolderLoginEmail(email, link, hub.displayName);
        } catch (mailError) {
          console.error("[login] wallet sign-in link failed", mailError);
        }
        return res.json({ actorType: "holder", linkSent: true, email });
      }
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

// Start a password reset. Looks up an admin first, then a merchant/creator.
// Always responds with a generic success regardless of whether the email
// exists, so the endpoint can't be used to discover which emails have accounts
// (same anti-enumeration stance as the holder magic-link flow). When a matching
// account is found, a signed, single-use, 60-minute reset link is emailed.
router.post("/forgot-password", async (req, res) => {
  const generic = { ok: true };
  try {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) return res.json(generic); // don't reveal validation outcome
    const email = parsed.data.email.toLowerCase();

    if (loginRateLimited(`forgot:${req.ip}:${email}`, 5, 15 * 60 * 1000)) {
      // Still generic to avoid leaking that the email is being targeted.
      return res.json(generic);
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    const account = admin
      ? { accountType: "admin" as const, id: admin.id, email: admin.email, pwd: passwordFingerprint(admin.passwordHash) }
      : await (async () => {
          const merchant = await prisma.merchant.findUnique({ where: { contactEmail: email } });
          return merchant
            ? { accountType: "merchant" as const, id: merchant.id, email: merchant.contactEmail!, pwd: passwordFingerprint(merchant.passwordHash) }
            : null;
        })();

    if (account) {
      const token = createPasswordResetToken(account);
      const resetUrl = `${publicBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await sendPasswordResetEmail(account.email, resetUrl);
      } catch (mailError) {
        // Log, but still return generic success — surfacing send failures here
        // would leak that the account exists.
        console.error("[forgot-password] reset email failed", mailError);
      }
    }

    return res.json(generic);
  } catch (error) {
    console.error(error);
    return res.json(generic);
  }
});

// Resolve the account a reset token points at, re-checking the password-hash
// fingerprint so a link already used (or invalidated by a later change) reads
// as expired. Returns the masked email so the UI can confirm which account.
async function resolveResetToken(token?: string) {
  const parsed = verifyPasswordResetToken(token);
  if (!parsed) return null;
  if (parsed.accountType === "admin") {
    const admin = await prisma.adminUser.findUnique({ where: { id: parsed.id } });
    if (!admin || passwordFingerprint(admin.passwordHash) !== parsed.pwd) return null;
    return { kind: "admin" as const, admin, email: admin.email };
  }
  const merchant = await prisma.merchant.findUnique({ where: { id: parsed.id } });
  if (!merchant || passwordFingerprint(merchant.passwordHash) !== parsed.pwd) return null;
  return { kind: "merchant" as const, merchant, email: merchant.contactEmail ?? parsed.email };
}

// Lets the reset page decide whether to show the form or an "expired link"
// message before the user types a new password.
router.get("/reset-password/validate", async (req, res) => {
  const resolved = await resolveResetToken(String(req.query.token ?? ""));
  if (!resolved) return res.json({ valid: false });
  res.json({ valid: true, email: resolved.email });
});

// Complete the reset: validate the token + fingerprint, enforce the shared
// password rule, write the new hash to the right directory, send a confirmation
// notice, and sign the user straight in (mirrors /login's cookie handling) so
// they land in their portal without a second sign-in step.
router.post("/reset-password", async (req, res) => {
  try {
    if (loginRateLimited(`reset:${req.ip}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }
    const data = z.object({ token: z.string().min(1), password: passwordRule }).parse(req.body);
    const resolved = await resolveResetToken(data.token);
    if (!resolved) {
      return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    if (resolved.kind === "admin") {
      const admin = await prisma.adminUser.update({ where: { id: resolved.admin.id }, data: { passwordHash } });
      const sessionToken = createAdminSession(admin);
      res.cookie("uen_session", sessionToken, cookieOptions(req));
      void sendPasswordChangedEmail(admin.email).catch((e) => console.error("[reset-password] notice failed", e));
      return res.json({ actorType: "admin", redirect: "/admin", token: sessionToken });
    }

    const merchant = await prisma.merchant.update({
      where: { id: resolved.merchant.id },
      data: { passwordHash },
      include: { shopifyConnections: { where: { status: "ACTIVE" }, take: 1 } }
    });
    const merchantToken = createMerchantSession({ id: merchant.id, merchantId: merchant.id });
    res.cookie("uen_merchant_session", merchantToken, merchantCookieOptions(req));
    if (merchant.contactEmail) {
      void sendPasswordChangedEmail(merchant.contactEmail).catch((e) => console.error("[reset-password] notice failed", e));
    }
    const shopDomain = merchant.shopifyConnections[0]?.shopDomain ?? null;
    return res.json({
      actorType: "merchant",
      redirect: shopDomain ? `/shopify/merchant?shop=${encodeURIComponent(shopDomain)}` : "/shopify/merchant"
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed" });
    }
    console.error(error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

export default router;
