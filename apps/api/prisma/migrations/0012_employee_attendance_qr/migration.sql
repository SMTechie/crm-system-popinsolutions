ALTER TABLE "Employee" ADD COLUMN "attendanceQrToken" TEXT;
CREATE UNIQUE INDEX "Employee_attendanceQrToken_key" ON "Employee"("attendanceQrToken");
