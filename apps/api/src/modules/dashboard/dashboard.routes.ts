import type { FastifyInstance } from "fastify";
import { requireRole } from "../../common/middleware/auth.js";
import { addLocalDays, getLocalDayBounds, getLocalDayBoundsFromDateString } from "../../common/utilities/datetime.js";
import { appointmentDto } from "../appointments/appointment.presenter.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/dashboard/summary", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const clinicId = request.authUser!.clinicId;
    const userId = request.authUser!.id;
    const clinic = await app.prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const todayRange = getLocalDayBounds(new Date(), clinic.timezone);
    const tomorrow = addLocalDays(new Date(), 1, clinic.timezone);
    const tomorrowRange = getLocalDayBoundsFromDateString(tomorrow, clinic.timezone);

    const [today, tomorrowItems, nextAppointment, unreadNotificationCount] = await app.prisma.$transaction([
      app.prisma.appointment.findMany({
        where: { clinicId, startAt: { gte: todayRange.start, lt: todayRange.end }, status: { not: "CANCELLED" } },
        include: { doctor: true, patient: true },
        orderBy: { startAt: "asc" }
      }),
      app.prisma.appointment.findMany({
        where: { clinicId, startAt: { gte: tomorrowRange.start, lt: tomorrowRange.end }, status: { not: "CANCELLED" } },
        include: { doctor: true, patient: true },
        orderBy: { startAt: "asc" }
      }),
      app.prisma.appointment.findFirst({
        where: { clinicId, startAt: { gte: new Date() }, status: { not: "CANCELLED" } },
        include: { doctor: true, patient: true },
        orderBy: { startAt: "asc" }
      }),
      app.prisma.notification.count({ where: { clinicId, userId, readAt: null } })
    ]);

    return {
      data: {
        today: today.map(appointmentDto),
        tomorrow: tomorrowItems.map(appointmentDto),
        nextAppointment: nextAppointment ? appointmentDto(nextAppointment) : null,
        unreadNotificationCount
      },
      error: null
    };
  });
}
