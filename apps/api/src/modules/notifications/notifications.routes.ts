import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paginationQuerySchema } from "@clinic/shared";
import { requireRole } from "../../common/middleware/auth.js";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const [items, total] = await app.prisma.$transaction([
      app.prisma.notification.findMany({
        where: { clinicId: request.authUser!.clinicId, userId: request.authUser!.id },
        include: { appointment: { include: { doctor: true, patient: true } } },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      app.prisma.notification.count({ where: { clinicId: request.authUser!.clinicId, userId: request.authUser!.id } })
    ]);
    return { data: { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) }, error: null };
  });

  app.get("/api/v1/notifications/unread-count", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const count = await app.prisma.notification.count({
      where: { clinicId: request.authUser!.clinicId, userId: request.authUser!.id, readAt: null }
    });
    return { data: { count }, error: null };
  });

  app.post("/api/v1/notifications/:id/read", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const where = { id: params.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id };
    const result = await app.prisma.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() }
    });
    const notification = await app.prisma.notification.findFirst({ where });
    if (!notification) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "لم يتم العثور على التذكير" } });
    if (result.count === 0 && !notification.readAt) {
      return reply.status(409).send({ error: { code: "NOTIFICATION_NOT_MARKED", message: "تعذر تعليم التذكير كمقروء" } });
    }
    return { data: { notification }, error: null };
  });

  app.post("/api/v1/notifications/read-all", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const result = await app.prisma.notification.updateMany({
      where: { clinicId: request.authUser!.clinicId, userId: request.authUser!.id, readAt: null },
      data: { readAt: new Date() }
    });
    return { data: { count: result.count }, error: null };
  });

  app.delete("/api/v1/notifications/read", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request) => {
    const result = await app.prisma.notification.deleteMany({
      where: { clinicId: request.authUser!.clinicId, userId: request.authUser!.id, readAt: { not: null } }
    });
    await app.prisma.auditLog.create({
      data: { action: "READ_NOTIFICATIONS_DELETED", entityType: "Notification", clinicId: request.authUser!.clinicId, userId: request.authUser!.id, metadata: { deletedCount: result.count } }
    });
    return { data: { count: result.count }, error: null };
  });

  app.delete("/api/v1/notifications/:id", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.notification.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "لم يتم العثور على الإشعار" } });
    await app.prisma.notification.delete({ where: { id: existing.id } });
    await app.prisma.auditLog.create({
      data: { action: "NOTIFICATION_DELETED", entityType: "Notification", entityId: existing.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id }
    });
    return { data: { ok: true }, error: null };
  });
}
