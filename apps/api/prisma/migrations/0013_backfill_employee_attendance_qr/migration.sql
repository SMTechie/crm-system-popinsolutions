UPDATE "Employee"
SET "attendanceQrToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "attendanceQrToken" IS NULL;
