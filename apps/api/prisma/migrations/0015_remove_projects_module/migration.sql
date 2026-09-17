ALTER TABLE "Tenant"
ALTER COLUMN "enabledModules" SET DEFAULT ARRAY['crm', 'accounting', 'hr', 'attendance', 'assets', 'users', 'settings']::TEXT[];

UPDATE "Tenant"
SET "enabledModules" = array_remove("enabledModules", 'projects');
