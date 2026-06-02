import bcrypt from "bcryptjs";
import express from "express";
import { z, ZodError } from "zod";
import { prisma } from "../db";
import { createAdminSession } from "../security";

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

router.post("/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!admin || !(await bcrypt.compare(data.password, admin.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.cookie("uen_session", createAdminSession(admin), cookieOptions(req));
    res.json({ user: { id: admin.id, email: admin.email, role: admin.role } });
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
