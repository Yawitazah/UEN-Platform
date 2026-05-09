-- Add uenValue to ExchangeHub
ALTER TABLE "ExchangeHub" ADD COLUMN "uenValue" DECIMAL(65,30) NOT NULL DEFAULT 1.00;

-- Add portalToken to Holder
ALTER TABLE "Holder" ADD COLUMN "portalToken" TEXT;
CREATE UNIQUE INDEX "Holder_portalToken_key" ON "Holder"("portalToken");

-- Add redemption tracking fields to ShopifySyncedNote
ALTER TABLE "ShopifySyncedNote" ADD COLUMN "redeemedAt" TIMESTAMP(3);
ALTER TABLE "ShopifySyncedNote" ADD COLUMN "redeemedOrderId" TEXT;
ALTER TABLE "ShopifySyncedNote" ADD COLUMN "redeemedOrderAmount" DECIMAL(65,30);
CREATE INDEX "ShopifySyncedNote_merchantId_redeemedAt_idx" ON "ShopifySyncedNote"("merchantId", "redeemedAt");

-- Create PortalBanner table
CREATE TABLE "PortalBanner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "bgColor" TEXT NOT NULL DEFAULT '#1f6f5b',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "targetScope" TEXT NOT NULL DEFAULT 'ALL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalBanner_pkey" PRIMARY KEY ("id")
);

-- Create HolderNotification table
CREATE TABLE "HolderNotification" (
    "id" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolderNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HolderNotification_holderId_idx" ON "HolderNotification"("holderId");

ALTER TABLE "HolderNotification" ADD CONSTRAINT "HolderNotification_holderId_fkey"
    FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
