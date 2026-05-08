import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { authenticate } from "./security";
import centralRoutes from "./routes/central";
import shopifyRoutes from "./routes/shopify";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  const cookieHeader = req.header("cookie") ?? "";
  req.cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [decodeURIComponent(key), decodeURIComponent(rest.join("="))];
      })
  );
  next();
});
app.use(morgan("dev"));
app.use(authenticate);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", centralRoutes);
app.use("/shopify/api", shopifyRoutes);

const clientDir = path.resolve(process.cwd(), "dist/client");
app.use(express.static(clientDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Universal Exchange Note app listening on http://localhost:${config.port}`);
});
