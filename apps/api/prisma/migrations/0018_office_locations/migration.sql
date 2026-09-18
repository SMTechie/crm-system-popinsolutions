CREATE TABLE "OfficeLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfficeLocation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Employee" ADD COLUMN "officeLocationId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN "officeLocationId" TEXT;
ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "OfficeLocation_tenantId_active_idx" ON "OfficeLocation"("tenantId", "active");
INSERT INTO "OfficeLocation" ("id", "tenantId", "name", "latitude", "longitude", "radiusMeters", "active", "updatedAt")
SELECT 'legacy-office-' || "id", "id", COALESCE("name", 'Main office'), "attendanceLatitude", "attendanceLongitude", "attendanceRadiusMeters", true, CURRENT_TIMESTAMP
FROM "Tenant" WHERE "attendanceLatitude" IS NOT NULL AND "attendanceLongitude" IS NOT NULL;
UPDATE "Employee" e SET "officeLocationId" = 'legacy-office-' || e."tenantId"
WHERE EXISTS (SELECT 1 FROM "OfficeLocation" o WHERE o."id" = 'legacy-office-' || e."tenantId");
