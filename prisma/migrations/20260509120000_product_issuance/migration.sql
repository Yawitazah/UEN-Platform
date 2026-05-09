ALTER TABLE "ExchangeHub" ADD COLUMN "codePrefix" TEXT;

CREATE TABLE "ShopifyIssuanceProduct" (
    "id" TEXT NOT NULL,
    "exchangeHubId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT,
    "digitalAssetUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyIssuanceProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UenIssuanceLog" (
    "id" TEXT NOT NULL,
    "issuanceProductId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "universalExchangeNoteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UenIssuanceLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyIssuanceProduct_shopDomain_shopifyProductId_key" ON "ShopifyIssuanceProduct"("shopDomain", "shopifyProductId");
CREATE INDEX "ShopifyIssuanceProduct_exchangeHubId_idx" ON "ShopifyIssuanceProduct"("exchangeHubId");
CREATE UNIQUE INDEX "UenIssuanceLog_shopDomain_shopifyOrderId_shopifyLineItemId_key" ON "UenIssuanceLog"("shopDomain", "shopifyOrderId", "shopifyLineItemId");
CREATE INDEX "UenIssuanceLog_customerEmail_idx" ON "UenIssuanceLog"("customerEmail");

ALTER TABLE "ShopifyIssuanceProduct" ADD CONSTRAINT "ShopifyIssuanceProduct_exchangeHubId_fkey" FOREIGN KEY ("exchangeHubId") REFERENCES "ExchangeHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UenIssuanceLog" ADD CONSTRAINT "UenIssuanceLog_issuanceProductId_fkey" FOREIGN KEY ("issuanceProductId") REFERENCES "ShopifyIssuanceProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
