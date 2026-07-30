import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createPatientSchema, paginationQuerySchema, updatePatientSchema } from "@clinic/shared";
import { requireRole } from "../../common/middleware/auth.js";
import { writeAuditLog } from "../../common/utilities/audit.js";

const paramsSchema = z.object({ id: z.string().min(1) });
const querySchema = paginationQuerySchema.extend({ search: z.string().trim().optional() });

export async function registerPatientRoutes(app: FastifyInstance) {
  app.get("/api/v1/patients", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const query = querySchema.parse(request.query);
    const where = {
      clinicId: request.authUser!.clinicId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
              { phone: { contains: query.search, mode: "insensitive" as const } }
            ]
          }
        : {})
    };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.patient.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      app.prisma.patient.count({ where })
    ]);
    return { data: { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) }, error: null };
  });

  app.post("/api/v1/patients", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const body = createPatientSchema.parse(request.body);
    const patient = await app.prisma.patient.create({
      data: {
        clinicId: request.authUser!.clinicId,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        alternatePhone: body.alternatePhone || null,
        email: body.email || null,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        gender: body.gender || null,
        notes: body.notes || null
      }
    });
    await writeAuditLog(app.prisma, request, { action: "PATIENT_CREATED", entityType: "Patient", entityId: patient.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return reply.status(201).send({ data: { patient }, error: null });
  });

  app.patch("/api/v1/patients/:id", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const body = updatePatientSchema.parse(request.body);
    const existing = await app.prisma.patient.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Patient not found" } });
    const patient = await app.prisma.patient.update({
      where: { id: params.id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        alternatePhone: body.alternatePhone || undefined,
        email: body.email || undefined,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        gender: body.gender || undefined,
        notes: body.notes || undefined
      }
    });
    return { data: { patient }, error: null };
  });

  app.post("/api/v1/patients/:id/deactivate", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.patient.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Patient not found" } });
    const patient = await app.prisma.patient.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog(app.prisma, request, { action: "PATIENT_DEACTIVATED", entityType: "Patient", entityId: patient.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { patient }, error: null };
  });

  app.post("/api/v1/patients/:id/activate", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.patient.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Patient not found" } });
    const patient = await app.prisma.patient.update({ where: { id: params.id }, data: { isActive: true } });
    await writeAuditLog(app.prisma, request, { action: "PATIENT_ACTIVATED", entityType: "Patient", entityId: patient.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { patient }, error: null };
  });

  app.delete("/api/v1/patients/:id", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const existing = await app.prisma.patient.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Patient not found" } });
    const appointmentCount = await app.prisma.appointment.count({ where: { clinicId: request.authUser!.clinicId, patientId: existing.id } });
    if (appointmentCount > 0) {
      return reply.status(409).send({ error: { code: "PATIENT_HAS_APPOINTMENTS", message: "لا يمكن حذف المريض لوجود مواعيد مرتبطة به. يمكنك تعطيله بدلاً من ذلك." } });
    }
    await app.prisma.patient.delete({ where: { id: existing.id } });
    await writeAuditLog(app.prisma, request, { action: "PATIENT_DELETED", entityType: "Patient", entityId: existing.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return { data: { ok: true }, error: null };
  });
}
