CREATE TABLE "ShopifyDiscountGroup" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "discountKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" TEXT,
    "minimumOrderAmount" TEXT,
    "usageLimitPerNote" INTEGER NOT NULL,
    "shopifyDiscountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyDiscountGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyDiscountGroup_merchantId_shopDomain_discountKey_key" ON "ShopifyDiscountGroup"("merchantId", "shopDomain", "discountKey");
CREATE INDEX "ShopifyDiscountGroup_shopDomain_idx" ON "ShopifyDiscountGroup"("shopDomain");

ALTER TABLE "ShopifyDiscountGroup" ADD CONSTRAINT "ShopifyDiscountGroup_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
