-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATIONS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeHub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "hubType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "billingStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "customDomain" TEXT,
    "subdomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeHub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holder" (
    "id" TEXT NOT NULL,
    "exchangeHubId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalExchangeNote" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "exchangeHubId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalExchangeNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "platformType" TEXT NOT NULL DEFAULT 'SHOPIFY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isExchangeHub" BOOLEAN NOT NULL DEFAULT false,
    "linkedExchangeHubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantOffer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(65,30),
    "minimumOrderAmount" DECIMAL(65,30),
    "usageLimitPerNote" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantAccessRule" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "exchangeHubId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantAccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifySyncedNote" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "universalExchangeNoteId" TEXT NOT NULL,
    "uenCode" TEXT NOT NULL,
    "shopifyDiscountId" TEXT,
    "shopifyDiscountCodeId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifySyncedNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalCreated" INTEGER NOT NULL DEFAULT 0,
    "totalUpdated" INTEGER NOT NULL DEFAULT 0,
    "totalSkipped" INTEGER NOT NULL DEFAULT 0,
    "totalErrors" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeHub_subdomain_key" ON "ExchangeHub"("subdomain");

-- CreateIndex
CREATE INDEX "Holder_exchangeHubId_idx" ON "Holder"("exchangeHubId");

-- CreateIndex
CREATE UNIQUE INDEX "Holder_exchangeHubId_email_key" ON "Holder"("exchangeHubId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalExchangeNote_code_key" ON "UniversalExchangeNote"("code");

-- CreateIndex
CREATE INDEX "UniversalExchangeNote_exchangeHubId_idx" ON "UniversalExchangeNote"("exchangeHubId");

-- CreateIndex
CREATE INDEX "UniversalExchangeNote_holderId_idx" ON "UniversalExchangeNote"("holderId");

-- CreateIndex
CREATE INDEX "MerchantOffer_merchantId_idx" ON "MerchantOffer"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantAccessRule_exchangeHubId_idx" ON "MerchantAccessRule"("exchangeHubId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAccessRule_merchantId_exchangeHubId_key" ON "MerchantAccessRule"("merchantId", "exchangeHubId");

-- CreateIndex
CREATE INDEX "ShopifyConnection_merchantId_idx" ON "ShopifyConnection"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_shopDomain_key" ON "ShopifyConnection"("shopDomain");

-- CreateIndex
CREATE INDEX "ShopifySyncedNote_shopDomain_idx" ON "ShopifySyncedNote"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifySyncedNote_merchantId_universalExchangeNoteId_key" ON "ShopifySyncedNote"("merchantId", "universalExchangeNoteId");

-- CreateIndex
CREATE INDEX "SyncLog_merchantId_idx" ON "SyncLog"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantApiKey_keyHash_key" ON "MerchantApiKey"("keyHash");

-- AddForeignKey
ALTER TABLE "Holder" ADD CONSTRAINT "Holder_exchangeHubId_fkey" FOREIGN KEY ("exchangeHubId") REFERENCES "ExchangeHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalExchangeNote" ADD CONSTRAINT "UniversalExchangeNote_exchangeHubId_fkey" FOREIGN KEY ("exchangeHubId") REFERENCES "ExchangeHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalExchangeNote" ADD CONSTRAINT "UniversalExchangeNote_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_linkedExchangeHubId_fkey" FOREIGN KEY ("linkedExchangeHubId") REFERENCES "ExchangeHub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantOffer" ADD CONSTRAINT "MerchantOffer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAccessRule" ADD CONSTRAINT "MerchantAccessRule_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAccessRule" ADD CONSTRAINT "MerchantAccessRule_exchangeHubId_fkey" FOREIGN KEY ("exchangeHubId") REFERENCES "ExchangeHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifySyncedNote" ADD CONSTRAINT "ShopifySyncedNote_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifySyncedNote" ADD CONSTRAINT "ShopifySyncedNote_universalExchangeNoteId_fkey" FOREIGN KEY ("universalExchangeNoteId") REFERENCES "UniversalExchangeNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantApiKey" ADD CONSTRAINT "MerchantApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

