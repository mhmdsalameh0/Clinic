import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createDoctorSchema, paginationQuerySchema, updateDoctorSchema } from "@clinic/shared";
import { requireRole } from "../../common/middleware/auth.js";
import { writeAuditLog } from "../../common/utilities/audit.js";
import { normalizeEmail } from "../../common/utilities/security.js";

const paramsSchema = z.object({ id: z.string().min(1) });
const querySchema = paginationQuerySchema.extend({ search: z.string().trim().optional() });

export async function registerDoctorRoutes(app: FastifyInstance) {
  app.get("/api/v1/doctors", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const query = querySchema.parse(request.query);
    const where = {
      clinicId: request.authUser!.clinicId,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: "insensitive" as const } },
              { specialty: { contains: query.search, mode: "insensitive" as const } },
              { phone: { contains: query.search, mode: "insensitive" as const } }
            ]
          }
        : {})
    };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.doctor.findMany({ where, orderBy: { fullName: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      app.prisma.doctor.count({ where })
    ]);
    return { data: { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) }, error: null };
  });

  app.post("/api/v1/doctors", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const body = createDoctorSchema.parse(request.body);
    const email = body.email ? normalizeEmail(body.email) : null;
    const doctor = await app.prisma.doctor
      .create({
        data: {
          clinicId: request.authUser!.clinicId,
          fullName: body.fullName,
          specialty: body.specialty || null,
          phone: body.phone || null,
          email,
          appointmentDurationMinutes: body.appointmentDurationMinutes ?? null
        }
      })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "DUPLICATE" as const;
        throw error;
      });
    if (doctor === "DUPLICATE") {
      return reply.status(409).send({ error: { code: "DOCTOR_EMAIL_EXISTS", message: "يوجد طبيب مسجل بهذا البريد الإلكتروني" } });
    }
    await writeAuditLog(app.prisma, request, { action: "DOCTOR_CREATED", entityType: "Doctor", entityId: doctor.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return reply.status(201).send({ data: { doctor }, error: null });
  });

  app.patch("/api/v1/doctors/:id", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const body = updateDoctorSchema.parse(request.body);
    const existing = await app.prisma.doctor.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Doctor not found" } });
    const doctor = await app.prisma.doctor.update({
      where: { id: params.id },
      data: {
        fullName: body.fullName,
        specialty: body.specialty || undefined,
        phone: body.phone || undefined,
        email: body.email || undefined,
        appointmentDurationMinutes: body.appointmentDurationMinutes
      }
    });
    await writeAuditLog(app.prisma, request, { action: "DOCTOR_UPDATED", entityType: "Doctor", entityId: doctor.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { doctor }, error: null };
  });

  app.post("/api/v1/doctors/:id/deactivate", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.doctor.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Doctor not found" } });
    const doctor = await app.prisma.doctor.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog(app.prisma, request, { action: "DOCTOR_DEACTIVATED", entityType: "Doctor", entityId: doctor.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { doctor }, error: null };
  });

  app.post("/api/v1/doctors/:id/activate", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.doctor.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Doctor not found" } });
    const doctor = await app.prisma.doctor.update({ where: { id: params.id }, data: { isActive: true } });
    await writeAuditLog(app.prisma, request, { action: "DOCTOR_ACTIVATED", entityType: "Doctor", entityId: doctor.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { doctor }, error: null };
  });

  app.delete("/api/v1/doctors/:id", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.doctor.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Doctor not found" } });
    const appointmentCount = await app.prisma.appointment.count({ where: { clinicId: request.authUser!.clinicId, doctorId: existing.id } });
    if (appointmentCount > 0) {
      return reply.status(409).send({ error: { code: "DOCTOR_HAS_APPOINTMENTS", message: "لا يمكن حذف الطبيب لوجود مواعيد مرتبطة به. يمكنك تعطيله بدلاً من ذلك." } });
    }
    await app.prisma.doctor.delete({ where: { id: existing.id } });
    await writeAuditLog(app.prisma, request, { action: "DOCTOR_DELETED", entityType: "Doctor", entityId: existing.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { ok: true }, error: null };
  });
}
