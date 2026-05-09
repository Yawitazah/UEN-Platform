CREATE TABLE "ShopifyInventorySyncedCode" (
    "id" TEXT NOT NULL,
    "inventoryCodeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "uenCode" TEXT NOT NULL,
    "shopifyDiscountId" TEXT,
    "shopifyDiscountCodeId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyInventorySyncedCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyInventorySyncedCode_merchantId_inventoryCodeId_key" ON "ShopifyInventorySyncedCode"("merchantId", "inventoryCodeId");
CREATE INDEX "ShopifyInventorySyncedCode_shopDomain_idx" ON "ShopifyInventorySyncedCode"("shopDomain");

ALTER TABLE "ShopifyInventorySyncedCode" ADD CONSTRAINT "ShopifyInventorySyncedCode_inventoryCodeId_fkey" FOREIGN KEY ("inventoryCodeId") REFERENCES "UenCodeInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopifyInventorySyncedCode" ADD CONSTRAINT "ShopifyInventorySyncedCode_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
