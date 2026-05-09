CREATE TABLE "UenCodeInventory" (
    "id" TEXT NOT NULL,
    "exchangeHubId" TEXT NOT NULL,
    "issuanceProductId" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "source" TEXT NOT NULL DEFAULT 'GENERATED',
    "issuedToEmail" TEXT,
    "universalExchangeNoteId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UenCodeInventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UenCodeInventory_code_key" ON "UenCodeInventory"("code");
CREATE UNIQUE INDEX "UenCodeInventory_universalExchangeNoteId_key" ON "UenCodeInventory"("universalExchangeNoteId");
CREATE INDEX "UenCodeInventory_exchangeHubId_status_idx" ON "UenCodeInventory"("exchangeHubId", "status");
CREATE INDEX "UenCodeInventory_issuanceProductId_status_idx" ON "UenCodeInventory"("issuanceProductId", "status");

ALTER TABLE "UenCodeInventory" ADD CONSTRAINT "UenCodeInventory_exchangeHubId_fkey" FOREIGN KEY ("exchangeHubId") REFERENCES "ExchangeHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UenCodeInventory" ADD CONSTRAINT "UenCodeInventory_issuanceProductId_fkey" FOREIGN KEY ("issuanceProductId") REFERENCES "ShopifyIssuanceProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UenCodeInventory" ADD CONSTRAINT "UenCodeInventory_universalExchangeNoteId_fkey" FOREIGN KEY ("universalExchangeNoteId") REFERENCES "UniversalExchangeNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
