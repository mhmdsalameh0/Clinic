import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../../common/middleware/auth.js";
import { writeAuditLog } from "../../common/utilities/audit.js";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function registerReminderRoutes(app: FastifyInstance) {
  app.get("/api/v1/reminders", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const items = await app.prisma.reminder.findMany({
      where: { clinicId: request.authUser!.clinicId },
      include: { appointment: { include: { doctor: true, patient: true } } },
      orderBy: { scheduledFor: "desc" },
      take: 100
    });
    return {
      data: {
        items: items.map((item) => ({
          id: item.id,
          appointmentId: item.appointmentId,
          status: item.status,
          scheduledFor: item.scheduledFor.toISOString(),
          sentAt: item.sentAt?.toISOString() ?? null,
          appointment: item.appointment
            ? {
                startAt: item.appointment.startAt.toISOString(),
                doctor: { fullName: item.appointment.doctor.fullName },
                patient: { firstName: item.appointment.patient.firstName, lastName: item.appointment.patient.lastName }
              }
            : null
        }))
      },
      error: null
    };
  });

  app.delete("/api/v1/reminders/:id", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.reminder.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "لم يتم العثور على التذكير" } });
    await app.prisma.reminder.delete({ where: { id: existing.id } });
    await writeAuditLog(app.prisma, request, { action: "REMINDER_DELETED", entityType: "Reminder", entityId: existing.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { ok: true }, error: null };
  });
}
