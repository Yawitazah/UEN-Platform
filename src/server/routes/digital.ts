import express from "express";
import { prisma } from "../db";

const router = express.Router();

async function holderFromToken(token: string) {
  if (!token) return null;
  return prisma.holder.findUnique({ where: { portalToken: token } });
}

// GET /api/holder/digital-products?token=
router.get("/holder/digital-products", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    // Find digital products linked to issuance products that issued this holder's UENs
    const logs = await prisma.uenIssuanceLog.findMany({
      where: { customerEmail: holder.email },
      include: {
        issuanceProduct: {
          include: {
            digitalProduct: {
              include: { tracks: { where: { status: "ACTIVE" }, orderBy: { trackNumber: "asc" } } }
            }
          }
        }
      }
    });

    const seen = new Set<string>();
    const products = logs
      .map((log) => log.issuanceProduct.digitalProduct)
      .filter((dp): dp is NonNullable<typeof dp> => dp !== null && dp.status === "ACTIVE")
      .filter((dp) => { if (seen.has(dp.id)) return false; seen.add(dp.id); return true; });

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load digital products" });
  }
});

// GET /api/holder/digital-products/:id?token=
router.get("/holder/digital-products/:id", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const product = await prisma.digitalProduct.findUnique({
      where: { id: req.params.id },
      include: { tracks: { where: { status: "ACTIVE" }, orderBy: { trackNumber: "asc" } } }
    });
    if (!product || product.status !== "ACTIVE") return res.status(404).json({ error: "Not found" });

    // Attach like counts and whether this holder liked each track
    const trackIds = product.tracks.map((t) => t.id);
    const [likeCounts, holderLikes] = await Promise.all([
      prisma.digitalProductLike.groupBy({ by: ["trackId"], where: { trackId: { in: trackIds } }, _count: true }),
      prisma.digitalProductLike.findMany({ where: { holderId: holder.id, trackId: { in: trackIds } } })
    ]);
    const likeCountMap = Object.fromEntries(likeCounts.map((l: { trackId: string; _count: number }) => [l.trackId, l._count]));
    const holderLikedSet = new Set(holderLikes.map((l: { trackId: string }) => l.trackId));

    const tracks = product.tracks.map((t) => ({
      ...t,
      likeCount: likeCountMap[t.id] ?? 0,
      likedByHolder: holderLikedSet.has(t.id)
    }));

    res.json({ ...product, tracks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load digital product" });
  }
});

// GET /api/holder/digital-products/:trackId/comments?token=
router.get("/holder/digital-products/:trackId/comments", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const comments = await prisma.digitalProductComment.findMany({
      where: { trackId: req.params.trackId },
      include: { holder: { select: { firstName: true, lastName: true } } },
      orderBy: { timestampSeconds: "asc" }
    });
    res.json(comments.map((c) => ({ ...c, isMine: c.holderId === holder.id })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load comments" });
  }
});

// POST /api/holder/digital-products/:trackId/comments?token=
router.post("/holder/digital-products/:trackId/comments", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const { body, timestampSeconds = 0 } = req.body as { body?: string; timestampSeconds?: number };
    if (!body?.trim()) return res.status(400).json({ error: "Comment body is required" });

    const comment = await prisma.digitalProductComment.create({
      data: { holderId: holder.id, trackId: req.params.trackId, body: body.trim(), timestampSeconds: Math.floor(Number(timestampSeconds)) },
      include: { holder: { select: { firstName: true, lastName: true } } }
    });
    res.status(201).json({ ...comment, isMine: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not post comment" });
  }
});

// POST /api/holder/digital-products/:trackId/like?token=  (toggle)
router.post("/holder/digital-products/:trackId/like", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });

    const existing = await prisma.digitalProductLike.findUnique({
      where: { holderId_trackId: { holderId: holder.id, trackId: req.params.trackId } }
    });
    if (existing) {
      await prisma.digitalProductLike.delete({ where: { id: existing.id } });
      res.json({ liked: false });
    } else {
      await prisma.digitalProductLike.create({ data: { holderId: holder.id, trackId: req.params.trackId } });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not toggle like" });
  }
});

// PATCH /api/holder/digital-products/comments/:commentId?token=  — edit own comment
router.patch("/holder/digital-products/comments/:commentId", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });
    const { body } = req.body as { body?: string };
    if (!body?.trim()) return res.status(400).json({ error: "Comment body is required" });
    const existing = await prisma.digitalProductComment.findUnique({ where: { id: req.params.commentId } });
    if (!existing) return res.status(404).json({ error: "Comment not found" });
    if (existing.holderId !== holder.id) return res.status(403).json({ error: "You can only edit your own comment" });
    const updated = await prisma.digitalProductComment.update({
      where: { id: req.params.commentId },
      data: { body: body.trim() },
      include: { holder: { select: { firstName: true, lastName: true } } }
    });
    res.json({ ...updated, isMine: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not edit comment" });
  }
});

// DELETE /api/holder/digital-products/comments/:commentId?token=  — delete own comment
router.delete("/holder/digital-products/comments/:commentId", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    const holder = await holderFromToken(token);
    if (!holder) return res.status(404).json({ error: "Invalid portal token" });
    const existing = await prisma.digitalProductComment.findUnique({ where: { id: req.params.commentId } });
    if (!existing) return res.status(404).json({ error: "Comment not found" });
    if (existing.holderId !== holder.id) return res.status(403).json({ error: "You can only delete your own comment" });
    await prisma.digitalProductComment.delete({ where: { id: req.params.commentId } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not delete comment" });
  }
});

// Admin: POST /api/digital-products  (create album)
router.post("/digital-products", async (req, res) => {
  try {
    const { exchangeHubId, title, artist, type = "ALBUM", artworkUrl, description, tracks = [] } = req.body as {
      exchangeHubId: string; title: string; artist?: string; type?: string;
      artworkUrl?: string; description?: string;
      tracks: Array<{ title: string; trackNumber: number; fileUrl: string; durationSeconds?: number }>;
    };
    if (!exchangeHubId || !title) return res.status(400).json({ error: "exchangeHubId and title required" });

    const product = await prisma.digitalProduct.create({
      data: {
        exchangeHubId, title, artist, type, artworkUrl, description,
        tracks: { create: tracks.map((t) => ({ title: t.title, trackNumber: t.trackNumber, fileUrl: t.fileUrl, durationSeconds: t.durationSeconds })) }
      },
      include: { tracks: true }
    });
    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create digital product" });
  }
});

// Admin: GET /api/digital-products?exchangeHubId=
router.get("/digital-products", async (req, res) => {
  try {
    const exchangeHubId = String(req.query.exchangeHubId ?? "");
    const products = await prisma.digitalProduct.findMany({
      where: exchangeHubId ? { exchangeHubId, status: "ACTIVE" } : { status: "ACTIVE" },
      include: { tracks: { where: { status: "ACTIVE" }, orderBy: { trackNumber: "asc" } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load digital products" });
  }
});

export default router;
