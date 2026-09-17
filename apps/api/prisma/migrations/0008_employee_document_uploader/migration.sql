ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "uploadedById" TEXT;
CREATE INDEX IF NOT EXISTS "EmployeeDocument_uploadedById_idx" ON "EmployeeDocument" ("uploadedById");
DO $$ BEGIN
  ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
