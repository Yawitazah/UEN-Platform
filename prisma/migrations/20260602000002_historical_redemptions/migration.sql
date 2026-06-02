CREATE TABLE "MerchantHistoricalRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "uenCode" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderAmount" DECIMAL,
    "redeemedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SHOPIFY_BACKFILL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantHistoricalRedemption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MerchantHistoricalRedemption_shopDomain_shopifyOrderId_uenCode_key" ON "MerchantHistoricalRedemption"("shopDomain", "shopifyOrderId", "uenCode");
CREATE INDEX "MerchantHistoricalRedemption_merchantId_idx" ON "MerchantHistoricalRedemption"("merchantId");
