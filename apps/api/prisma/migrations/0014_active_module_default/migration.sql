ALTER TABLE "Tenant"
ALTER COLUMN "enabledModules" SET DEFAULT ARRAY['crm', 'accounting', 'hr', 'attendance', 'assets', 'projects', 'users', 'settings']::TEXT[];

UPDATE "Tenant"
SET "enabledModules" = array_remove(array_remove("enabledModules", 'forms'), 'automation');
