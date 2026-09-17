CREATE UNIQUE INDEX IF NOT EXISTS "Company_tenantId_customerNumber_key" ON "Company" ("tenantId", "customerNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_tenantId_supplierNumber_key" ON "Vendor" ("tenantId", "supplierNumber");
