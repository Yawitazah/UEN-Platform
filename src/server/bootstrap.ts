import bcrypt from "bcryptjs";
import { AdminRole, HubStatus, MerchantStatus, UenStatus } from "./constants";
import { config } from "./config";
import { prisma } from "./db";
import { hashSecret } from "./security";

// Idempotent additive migrations applied at startup, before the server accepts
// traffic, so prod (Supabase Postgres) stays in sync without a separate migrate
// step in the deploy pipeline. Skipped on the local SQLite DB, which is managed
// with `prisma db push`. Each statement must be safe to run repeatedly.
export async function ensureSchema() {
  if (!(process.env.DATABASE_URL ?? "").startsWith("postgres")) return;
  const statements = [
    'ALTER TABLE "Holder" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT'
  ];
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      console.error(`ensureSchema failed: ${sql}`, error);
    }
  }
}

// Marks the founder's email as an original Love Note supporter so it sees the
// full supporter experience (banner, music, collectibles). Driven by env so it
// stays out of the code; set FOUNDER_SUPPORTER_EMAIL to enable. Idempotent.
export async function ensureFounderSupporter() {
  const email = (process.env.FOUNDER_SUPPORTER_EMAIL ?? "").trim().toLowerCase();
  if (!email) return;
  try {
    const existing = await prisma.uenCodeInventory.findFirst({
      where: { source: "GRANDFATHERED", issuedToEmail: email }
    });
    if (existing) return;
    const hub =
      (await prisma.exchangeHub.findFirst({ where: { status: HubStatus.ACTIVE, NOT: { displayName: "Exchange Hub A" } }, orderBy: { createdAt: "asc" } })) ??
      (await prisma.exchangeHub.findFirst({ where: { status: HubStatus.ACTIVE }, orderBy: { createdAt: "asc" } }));
    if (!hub) return;
    await prisma.uenCodeInventory.create({
      data: { exchangeHubId: hub.id, code: `FOUNDER-${email}`, source: "GRANDFATHERED", status: "RESERVED", issuedToEmail: email }
    });
    console.log(`ensureFounderSupporter: ${email} marked as Love Note supporter in ${hub.displayName}`);
  } catch (error) {
    console.error("ensureFounderSupporter failed", error);
  }
}

// Seeds the Love Note supporter music ("Filthy Coon") as a real DigitalProduct
// + Track so likes and comments persist (they FK to a real track id). Uses
// fixed ids that match the client-side LOVE_NOTE_MUSIC collectible. Idempotent.
export async function ensureLoveNoteMusic() {
  try {
    const existing = await prisma.digitalProductTrack.findUnique({ where: { id: "filthy-coon-1" } });
    if (existing) return;
    const hub =
      (await prisma.exchangeHub.findFirst({ where: { status: HubStatus.ACTIVE, NOT: { displayName: "Exchange Hub A" } }, orderBy: { createdAt: "asc" } })) ??
      (await prisma.exchangeHub.findFirst({ where: { status: HubStatus.ACTIVE }, orderBy: { createdAt: "asc" } }));
    if (!hub) return;
    await prisma.digitalProduct.upsert({
      where: { id: "love-note-music" },
      update: {},
      create: {
        id: "love-note-music",
        exchangeHubId: hub.id,
        title: "Filthy Coon",
        artist: "Nubreed ft. Yawitazah",
        type: "ALBUM",
        artworkUrl: "/music/filthy-coon-cover.jpg",
        description: "An exclusive track for original Love Note supporters.",
        status: "ACTIVE"
      }
    });
    await prisma.digitalProductTrack.create({
      data: {
        id: "filthy-coon-1",
        digitalProductId: "love-note-music",
        title: "Filthy Coon",
        trackNumber: 1,
        fileUrl: "/music/filthy-coon.mp3",
        status: "ACTIVE"
      }
    });
    console.log("ensureLoveNoteMusic: seeded Filthy Coon track");
  } catch (error) {
    console.error("ensureLoveNoteMusic failed", error);
  }
}

export async function ensureFirstBuildTarget() {
  const existingHub = await prisma.exchangeHub.findFirst({
    where: { name: "exchange-hub-a" }
  });
  if (existingHub) return;

  await prisma.adminUser.upsert({
    where: { email: config.adminEmail.toLowerCase() },
    update: {},
    create: {
      email: config.adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(config.adminPassword, 12),
      role: AdminRole.SUPER_ADMIN
    }
  });

  const exchangeHub = await prisma.exchangeHub.create({
    data: {
      name: "exchange-hub-a",
      displayName: "Exchange Hub A",
      hubType: "creator",
      status: HubStatus.ACTIVE,
      billingStatus: "ACTIVE",
      brandColor: "#1f6f5b",
      codePrefix: "",
      subdomain: "hub-a"
    }
  });

  const holder = await prisma.holder.create({
    data: {
      exchangeHubId: exchangeHub.id,
      firstName: "Holder",
      lastName: "A",
      email: "holder-a@example.com",
      phone: "+15555550100"
    }
  });

  await prisma.universalExchangeNote.create({
    data: {
      exchangeHubId: exchangeHub.id,
      holderId: holder.id,
      code: "1234567UEN",
      status: UenStatus.ACTIVE
    }
  });

  const merchant = await prisma.merchant.create({
    data: {
      businessName: "Merchant A",
      platformType: "SHOPIFY",
      status: MerchantStatus.ACTIVE,
      isExchangeHub: false
    }
  });

  await prisma.merchantOffer.create({
    data: {
      merchantId: merchant.id,
      discountType: "PERCENTAGE",
      discountValue: "15",
      usageLimitPerNote: 1,
      status: "ACTIVE"
    }
  });

  await prisma.merchantAccessRule.create({
    data: {
      merchantId: merchant.id,
      exchangeHubId: exchangeHub.id,
      status: "ACTIVE"
    }
  });

  await prisma.merchantApiKey.create({
    data: {
      merchantId: merchant.id,
      label: "Local development Shopify app token",
      keyHash: hashSecret("uen_dev_merchant_token")
    }
  });

  console.log("Bootstrapped first-build target for 1234567UEN");
}
