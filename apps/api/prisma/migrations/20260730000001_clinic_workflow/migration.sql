-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "durationMinutes" INTEGER;

-- CreateIndex
CREATE INDEX "Patient_clinicId_phone_idx" ON "Patient"("clinicId", "phone");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startAt_status_idx" ON "Appointment"("clinicId", "startAt", "status");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_doctorId_startAt_endAt_idx" ON "Appointment"("clinicId", "doctorId", "startAt", "endAt");
