ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "departmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_projectId_idx" ON "Invoice" ("projectId");
CREATE INDEX IF NOT EXISTS "Expense_departmentId_idx" ON "Expense" ("departmentId");
CREATE INDEX IF NOT EXISTS "Expense_projectId_idx" ON "Expense" ("projectId");

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
