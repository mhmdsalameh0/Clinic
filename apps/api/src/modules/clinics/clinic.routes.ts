import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clinicSettingsSchema } from "@clinic/shared";
import { requireRole } from "../../common/middleware/auth.js";
import { writeAuditLog } from "../../common/utilities/audit.js";

const allowedTimezones = new Set(["Asia/Beirut", "UTC"]);
const demoCleanupSchema = z.object({ confirmation: z.literal("مسح") });

export async function registerClinicRoutes(app: FastifyInstance) {
  app.get("/api/v1/clinic", { preHandler: requireRole(["CLINIC_ADMIN", "DOCTOR", "RECEPTIONIST"]) }, async (request, reply) => {
    const clinic = await app.prisma.clinic.findUnique({ where: { id: request.authUser!.clinicId } });
    if (!clinic) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Clinic not found" } });
    }

    return { data: { clinic }, error: null };
  });

  app.patch("/api/v1/clinic", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const body = clinicSettingsSchema.parse(request.body);

    if (body.timezone && !allowedTimezones.has(body.timezone)) {
      return reply.status(400).send({ error: { code: "INVALID_TIMEZONE", message: "Unsupported timezone" } });
    }

    const clinic = await app.prisma.clinic.update({
      where: { id: request.authUser!.clinicId },
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        address: body.address,
        timezone: body.timezone,
        appointmentDefaultDurationMinutes: body.appointmentDefaultDurationMinutes
      }
    });

    await writeAuditLog(app.prisma, request, {
      action: "CLINIC_UPDATED",
      entityType: "Clinic",
      entityId: clinic.id,
      clinicId: clinic.id,
      userId: request.authUser!.id,
      metadata: { fields: Object.keys(body) }
    });

    return { data: { clinic }, error: null };
  });

  app.post("/api/v1/clinic/demo-cleanup", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const body = demoCleanupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: "INVALID_CONFIRMATION", message: "يرجى كتابة كلمة مسح لتأكيد حذف بيانات التجربة" } });
    }

    const result = await app.prisma.$transaction(async (tx) => {
      const clinicId = request.authUser!.clinicId;
      const notifications = await tx.notification.deleteMany({ where: { clinicId } });
      const reminders = await tx.reminder.deleteMany({ where: { clinicId } });
      const appointments = await tx.appointment.deleteMany({ where: { clinicId } });
      const patients = await tx.patient.deleteMany({ where: { clinicId } });
      const doctors = await tx.doctor.deleteMany({ where: { clinicId } });
      await tx.auditLog.create({
        data: {
          action: "DEMO_DATA_CLEANUP",
          entityType: "Clinic",
          entityId: clinicId,
          clinicId,
          userId: request.authUser!.id,
          metadata: {
            deletedNotifications: notifications.count,
            deletedReminders: reminders.count,
            deletedAppointments: appointments.count,
            deletedPatients: patients.count,
            deletedDoctors: doctors.count
          }
        }
      });
      return { notifications: notifications.count, reminders: reminders.count, appointments: appointments.count, patients: patients.count, doctors: doctors.count };
    });

    return { data: result, error: null };
  });
}
