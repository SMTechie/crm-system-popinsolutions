CREATE TABLE "PayrollDeduction" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AMOUNT',
    "value" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollDeduction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollDeduction_payrollRunId_idx" ON "PayrollDeduction"("payrollRunId");
ALTER TABLE "PayrollDeduction" ADD CONSTRAINT "PayrollDeduction_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
