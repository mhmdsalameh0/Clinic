import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createUserSchema,
  paginationQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  userRoleSchema
} from "@clinic/shared";
import { requireRole } from "../../common/middleware/auth.js";
import { writeAuditLog } from "../../common/utilities/audit.js";
import { hashPassword, normalizeEmail } from "../../common/utilities/security.js";
import { publicUser } from "./user.presenter.js";

const userQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  role: userRoleSchema.optional()
});

const paramsSchema = z.object({ id: z.string().min(1) });

async function assertCanDeactivateAdmin(app: FastifyInstance, clinicId: string, userId: string) {
  const user = await app.prisma.user.findFirst({ where: { id: userId, clinicId } });
  if (!user) return { ok: false as const, code: "NOT_FOUND", message: "User not found" };

  if (user.role === "CLINIC_ADMIN") {
    const activeAdmins = await app.prisma.user.count({
      where: { clinicId, role: "CLINIC_ADMIN", isActive: true }
    });
    if (activeAdmins <= 1) {
      return { ok: false as const, code: "FINAL_ADMIN", message: "Cannot deactivate the final active clinic administrator" };
    }
  }

  return { ok: true as const, user };
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/v1/users", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const query = userQuerySchema.parse(request.query);
    const where = {
      clinicId: request.authUser!.clinicId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: "insensitive" as const } },
              { email: { contains: query.search, mode: "insensitive" as const } },
              { phone: { contains: query.search, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [items, total] = await app.prisma.$transaction([
      app.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      app.prisma.user.count({ where })
    ]);

    return {
      data: {
        items: items.map(publicUser),
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize)
      },
      error: null
    };
  });

  app.post("/api/v1/users", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const user = await app.prisma.user.create({
      data: {
        clinicId: request.authUser!.clinicId,
        fullName: body.fullName,
        email: normalizeEmail(body.email),
        phone: body.phone || null,
        role: body.role,
        passwordHash: await hashPassword(body.password)
      }
    });

    await writeAuditLog(app.prisma, request, {
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      clinicId: request.authUser!.clinicId,
      userId: request.authUser!.id,
      metadata: { role: user.role }
    });

    return reply.status(201).send({ data: { user: publicUser(user) }, error: null });
  });

  app.get("/api/v1/users/:id", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const user = await app.prisma.user.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!user) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
    return { data: { user: publicUser(user) }, error: null };
  });

  app.patch("/api/v1/users/:id", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const existing = await app.prisma.user.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });

    if (existing.role === "CLINIC_ADMIN" && body.role && body.role !== "CLINIC_ADMIN") {
      const activeAdmins = await app.prisma.user.count({
        where: { clinicId: request.authUser!.clinicId, role: "CLINIC_ADMIN", isActive: true }
      });
      if (activeAdmins <= 1) {
        return reply.status(400).send({ error: { code: "FINAL_ADMIN", message: "Cannot remove the final active clinic administrator" } });
      }
    }

    const user = await app.prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: body.fullName,
        email: body.email ? normalizeEmail(body.email) : undefined,
        phone: body.phone,
        role: body.role
      }
    });

    await writeAuditLog(app.prisma, request, {
      action: existing.role !== user.role ? "USER_ROLE_CHANGED" : "USER_UPDATED",
      entityType: "User",
      entityId: user.id,
      clinicId: request.authUser!.clinicId,
      userId: request.authUser!.id,
      metadata: { fields: Object.keys(body) }
    });

    return { data: { user: publicUser(user) }, error: null };
  });

  app.post("/api/v1/users/:id/deactivate", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    if (params.id === request.authUser!.id) {
      return reply.status(400).send({ error: { code: "SELF_DEACTIVATION", message: "You cannot deactivate your own account" } });
    }

    const allowed = await assertCanDeactivateAdmin(app, request.authUser!.clinicId, params.id);
    if (!allowed.ok) return reply.status(400).send({ error: { code: allowed.code, message: allowed.message } });

    const user = await app.prisma.user.update({ where: { id: params.id }, data: { isActive: false } });
    await app.prisma.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(app.prisma, request, {
      action: "USER_DEACTIVATED",
      entityType: "User",
      entityId: user.id,
      clinicId: request.authUser!.clinicId,
      userId: request.authUser!.id
    });

    return { data: { user: publicUser(user) }, error: null };
  });

  app.post("/api/v1/users/:id/activate", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.user.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });

    const user = await app.prisma.user.update({ where: { id: params.id }, data: { isActive: true } });
    await writeAuditLog(app.prisma, request, {
      action: "USER_ACTIVATED",
      entityType: "User",
      entityId: user.id,
      clinicId: request.authUser!.clinicId,
      userId: request.authUser!.id
    });

    return { data: { user: publicUser(user) }, error: null };
  });

  app.post("/api/v1/users/:id/reset-password", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const body = resetPasswordSchema.parse(request.body);
    const existing = await app.prisma.user.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });

    const user = await app.prisma.user.update({
      where: { id: params.id },
      data: { passwordHash: await hashPassword(body.password) }
    });
    await app.prisma.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(app.prisma, request, {
      action: "USER_PASSWORD_RESET",
      entityType: "User",
      entityId: user.id,
      clinicId: request.authUser!.clinicId,
      userId: request.authUser!.id
    });

    return { data: { user: publicUser(user) }, error: null };
  });
}

