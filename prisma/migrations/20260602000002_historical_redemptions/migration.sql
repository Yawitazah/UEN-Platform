-- CreateTable
CREATE TABLE "MerchantHistoricalRedemption" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "uenCode" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderAmount" DECIMAL(65,30),
    "redeemedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SHOPIFY_BACKFILL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantHistoricalRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantHistoricalRedemption_shopDomain_shopifyOrderId_uenCode_key" ON "MerchantHistoricalRedemption"("shopDomain", "shopifyOrderId", "uenCode");

-- CreateIndex
CREATE INDEX "MerchantHistoricalRedemption_merchantId_idx" ON "MerchantHistoricalRedemption"("merchantId");

-- AddForeignKey
ALTER TABLE "MerchantHistoricalRedemption" ADD CONSTRAINT "MerchantHistoricalRedemption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
