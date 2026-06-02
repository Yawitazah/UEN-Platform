ALTER TABLE "Merchant" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "Merchant_contactEmail_key" ON "Merchant"("contactEmail");
