ALTER TABLE "Contact"
ADD COLUMN "monthlyContribution" DECIMAL(14,2),
ADD COLUMN "contributionStartDate" TIMESTAMP(3),
ADD COLUMN "contributionActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ContributionPayment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "amountDue" DECIMAL(14,2) NOT NULL,
  "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'UNPAID',
  "paidAt" TIMESTAMP(3),
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContributionPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContributionPayment_tenantId_contactId_period_key" ON "ContributionPayment"("tenantId", "contactId", "period");
CREATE INDEX "ContributionPayment_tenantId_period_status_idx" ON "ContributionPayment"("tenantId", "period", "status");
ALTER TABLE "ContributionPayment" ADD CONSTRAINT "ContributionPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionPayment" ADD CONSTRAINT "ContributionPayment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
