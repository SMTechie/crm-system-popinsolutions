ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "externalSystem" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "externalUpdatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_tenantId_externalSystem_externalId_key" ON "Contact"("tenantId", "externalSystem", "externalId");
