import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ensureFirstBuildTarget } from "./bootstrap";
import { config } from "./config";
import { authenticate } from "./security";
import authRoutes from "./routes/auth";
import merchantAuthRoutes from "./routes/merchant-auth";
import centralRoutes from "./routes/central";
import digitalRoutes from "./routes/digital";
import holderRoutes from "./routes/holder";
import shopifyRoutes from "./routes/shopify";

const app = express();

// Railway (and most reverse proxies) terminate SSL and forward HTTP.
// Without trust proxy, req.secure is always false and cookies get
// wrong SameSite/Secure values.
app.set("trust proxy", true);

app.use(helmet({ contentSecurityPolicy: false, xFrameOptions: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buffer) => {
    (req as express.Request).rawBody = Buffer.from(buffer);
  }
}));
app.use((req, _res, next) => {
  const cookieHeader = req.header("cookie") ?? "";
  req.cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        try {
          const [key, ...rest] = part.split("=");
          return [[decodeURIComponent(key.trim()), decodeURIComponent(rest.join("="))]];
        } catch {
          // Malformed percent-encoding in one cookie must not crash the whole parse
          return [];
        }
      })
  );
  next();
});
app.use(morgan("dev"));
app.use(authenticate);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/merchant", merchantAuthRoutes);
app.use("/api", holderRoutes);
app.use("/api", digitalRoutes);
app.use("/api", centralRoutes);
app.use("/shopify/api", shopifyRoutes);
app.use("/shopify", shopifyRoutes);

// When Shopify opens the embedded app it hits the configured App URL
// (currently /shopify) with hmac + shop params. Intercept that and route
// through /shopify/auth so the auth flow (or the merchant portal shortcut)
// handles it instead of the admin SPA.
app.get("/shopify", (req, res, next) => {
  const { shop, hmac } = req.query;
  if (shop && hmac) {
    const params = new URLSearchParams(req.query as Record<string, string>);
    return res.redirect(`/shopify/auth?${params.toString()}`);
  }
  next();
});

const clientDir = path.resolve(process.cwd(), "dist/client");
const uploadDir = path.resolve(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDir));
app.use(express.static(clientDir));
app.get("*", (_req, res) => {
  // Never cache index.html — browser must always fetch fresh so it gets
  // the latest hashed JS/CSS bundle references after each deploy.
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(clientDir, "index.html"));
});

async function start() {
  if (config.bootstrapFirstBuildTarget) {
    await ensureFirstBuildTarget();
  }

  app.listen(config.port, () => {
    console.log(`Universal Exchange Note app listening on http://localhost:${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start Universal Exchange Note app", error);
  process.exit(1);
});
