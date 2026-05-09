CREATE TABLE "MerchantOnboarding" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "requestedExchangeHubId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "installedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantOnboarding_token_key" ON "MerchantOnboarding"("token");
CREATE INDEX "MerchantOnboarding_merchantId_idx" ON "MerchantOnboarding"("merchantId");
CREATE INDEX "MerchantOnboarding_shopDomain_idx" ON "MerchantOnboarding"("shopDomain");

ALTER TABLE "MerchantOnboarding" ADD CONSTRAINT "MerchantOnboarding_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
