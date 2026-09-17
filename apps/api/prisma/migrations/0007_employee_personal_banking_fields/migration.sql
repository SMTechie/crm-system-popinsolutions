ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "employeeNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "idPassportNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "employmentType" TEXT,
  ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountHolder" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranch" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountType" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_employeeNumber_key" ON "Employee" ("tenantId", "employeeNumber");
