import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createAppointmentSchema, paginationQuerySchema, updateAppointmentSchema } from "@clinic/shared";
import { requireRole } from "../../common/middleware/auth.js";
import { addLocalDays, getLocalDayBounds, getLocalDayBoundsFromDateString, localDateTimeToUtc } from "../../common/utilities/datetime.js";
import { writeAuditLog } from "../../common/utilities/audit.js";
import { appointmentDto } from "./appointment.presenter.js";
import { cancelAppointmentReminders, upsertAppointmentReminder } from "../reminders/reminder.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });
const listQuerySchema = paginationQuerySchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const appointmentConflictMessage = "يوجد موعد مسجل لهذا الطبيب في نفس الوقت.";
const appointmentTransactionOptions = { maxWait: 10_000, timeout: 20_000 };

export async function registerAppointmentRoutes(app: FastifyInstance) {
  app.get("/api/v1/appointments", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const clinic = await app.prisma.clinic.findUniqueOrThrow({ where: { id: request.authUser!.clinicId } });
    const range = query.date ? getLocalDayBoundsFromDateString(query.date, clinic.timezone) : undefined;
    const where = {
      clinicId: clinic.id,
      ...(range ? { startAt: { gte: range.start, lt: range.end } } : {})
    };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.appointment.findMany({
        where,
        include: { doctor: true, patient: true },
        orderBy: { startAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      app.prisma.appointment.count({ where })
    ]);
    return { data: { items: items.map(appointmentDto), total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) }, error: null };
  });

  app.get("/api/v1/appointments/today", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const clinic = await app.prisma.clinic.findUniqueOrThrow({ where: { id: request.authUser!.clinicId } });
    const range = getLocalDayBounds(new Date(), clinic.timezone);
    const items = await findAppointmentsForRange(app, clinic.id, range.start, range.end);
    return { data: { items: items.map(appointmentDto) }, error: null };
  });

  app.get("/api/v1/appointments/tomorrow", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const clinic = await app.prisma.clinic.findUniqueOrThrow({ where: { id: request.authUser!.clinicId } });
    const tomorrow = addLocalDays(new Date(), 1, clinic.timezone);
    const range = getLocalDayBoundsFromDateString(tomorrow, clinic.timezone);
    const items = await findAppointmentsForRange(app, clinic.id, range.start, range.end);
    return { data: { items: items.map(appointmentDto) }, error: null };
  });

  app.get("/api/v1/appointments/next", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request) => {
    const item = await app.prisma.appointment.findFirst({
      where: { clinicId: request.authUser!.clinicId, startAt: { gte: new Date() }, status: { not: "CANCELLED" } },
      include: { doctor: true, patient: true },
      orderBy: { startAt: "asc" }
    });
    return { data: { appointment: item ? appointmentDto(item) : null }, error: null };
  });

  app.post("/api/v1/appointments", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const body = createAppointmentSchema.parse(request.body);
    const appointment = await app.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: request.authUser!.clinicId } });
      const doctor = await tx.doctor.findFirst({ where: { id: body.doctorId, clinicId: clinic.id, isActive: true } });
      const patient = await tx.patient.findFirst({ where: { id: body.patientId, clinicId: clinic.id, isActive: true } });
      if (!doctor || !patient) throw new Error("INVALID_APPOINTMENT_PARTIES");

      const duration = doctor.appointmentDurationMinutes ?? clinic.appointmentDefaultDurationMinutes;
      const startAt = localDateTimeToUtc(body.date, body.time, clinic.timezone);
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      await lockDoctorSchedule(tx, clinic.id, doctor.id);
      await assertNoDoctorConflict(tx, clinic.id, doctor.id, startAt, endAt);

      const created = await tx.appointment.create({
        data: {
          clinicId: clinic.id,
          doctorId: doctor.id,
          patientId: patient.id,
          createdByUserId: request.authUser!.id,
          startAt,
          endAt,
          durationMinutes: duration,
          reason: body.reason || null
        },
        include: { doctor: true, patient: true }
      });
      await upsertAppointmentReminder(tx, clinic.id, created.id, startAt);
      return created;
    }, appointmentTransactionOptions).catch((error) => {
      if (error instanceof Error && error.message === "APPOINTMENT_CONFLICT") return null;
      if (error instanceof Error && error.message === "INVALID_APPOINTMENT_PARTIES") return "INVALID_PARTIES" as const;
      throw error;
    });

    if (!appointment) return reply.status(409).send({ error: { code: "APPOINTMENT_CONFLICT", message: appointmentConflictMessage } });
    if (appointment === "INVALID_PARTIES") return reply.status(404).send({ error: { code: "INVALID_APPOINTMENT_PARTIES", message: "يرجى اختيار مريض وطبيب نشطين من العيادة قبل إنشاء الموعد." } });
    await writeAuditLog(app.prisma, request, { action: "APPOINTMENT_CREATED", entityType: "Appointment", entityId: appointment.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id });
    return reply.status(201).send({ data: { appointment: appointmentDto(appointment) }, error: null });
  });

  app.patch("/api/v1/appointments/:id", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const body = updateAppointmentSchema.parse(request.body);
    const appointment = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
      if (!existing) return "NOT_FOUND" as const;
      if (body.status === "CANCELLED") {
        await cancelAppointmentReminders(tx, existing.id);
      }
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: request.authUser!.clinicId } });
      const doctorId = body.doctorId ?? existing.doctorId;
      const patientId = body.patientId ?? existing.patientId;
      const doctor = await tx.doctor.findFirst({ where: { id: doctorId, clinicId: clinic.id, isActive: true } });
      const patient = await tx.patient.findFirst({ where: { id: patientId, clinicId: clinic.id, isActive: true } });
      if (!doctor || !patient) return "NOT_FOUND" as const;
      const duration = doctor.appointmentDurationMinutes ?? clinic.appointmentDefaultDurationMinutes;
      const startAt = body.date && body.time ? localDateTimeToUtc(body.date, body.time, clinic.timezone) : existing.startAt;
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      if (body.status !== "CANCELLED") {
        await lockDoctorSchedule(tx, clinic.id, doctor.id);
        await assertNoDoctorConflict(tx, clinic.id, doctor.id, startAt, endAt, existing.id);
      }
      const updated = await tx.appointment.update({
        where: { id: existing.id },
        data: {
          doctorId,
          patientId,
          startAt,
          endAt,
          durationMinutes: duration,
          reason: body.reason,
          status: body.status
        },
        include: { doctor: true, patient: true }
      });
      if (updated.status === "CANCELLED") await cancelAppointmentReminders(tx, updated.id);
      else await upsertAppointmentReminder(tx, clinic.id, updated.id, updated.startAt);
      if (body.status === "CANCELLED" && existing.status !== "CANCELLED") {
        await tx.auditLog.create({
          data: { action: "APPOINTMENT_CANCELLED", entityType: "Appointment", entityId: updated.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id }
        });
      } else {
        await tx.auditLog.create({
          data: { action: "APPOINTMENT_UPDATED", entityType: "Appointment", entityId: updated.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id }
        });
      }
      return updated;
    }, appointmentTransactionOptions).catch((error) => {
      if (error instanceof Error && error.message === "APPOINTMENT_CONFLICT") return "CONFLICT" as const;
      throw error;
    });

    if (appointment === "NOT_FOUND") return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
    if (appointment === "CONFLICT") return reply.status(409).send({ error: { code: "APPOINTMENT_CONFLICT", message: appointmentConflictMessage } });
    return { data: { appointment: appointmentDto(appointment) }, error: null };
  });

  app.post("/api/v1/appointments/:id/cancel", { preHandler: requireRole(["CLINIC_ADMIN", "RECEPTIONIST"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const appointment = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId }, include: { doctor: true, patient: true } });
      if (!existing) return null;
      await cancelAppointmentReminders(tx, existing.id);
      const updated = await tx.appointment.update({
        where: { id: existing.id },
        data: { status: "CANCELLED" },
        include: { doctor: true, patient: true }
      });
      await tx.auditLog.create({
        data: { action: "APPOINTMENT_CANCELLED", entityType: "Appointment", entityId: updated.id, clinicId: request.authUser!.clinicId, userId: request.authUser!.id }
      });
      return updated;
    }, appointmentTransactionOptions);
    if (!appointment) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
    return { data: { appointment: appointmentDto(appointment) }, error: null };
  });

  app.delete("/api/v1/appointments/:id", { preHandler: requireRole(["CLINIC_ADMIN"]) }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const deleted = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id: params.id, clinicId: request.authUser!.clinicId } });
      if (!existing) return null;
      const deletedNotifications = await tx.notification.deleteMany({ where: { appointmentId: existing.id, clinicId: request.authUser!.clinicId } });
      const deletedReminders = await tx.reminder.deleteMany({ where: { appointmentId: existing.id, clinicId: request.authUser!.clinicId } });
      await tx.appointment.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          action: "APPOINTMENT_DELETED",
          entityType: "Appointment",
          entityId: existing.id,
          clinicId: request.authUser!.clinicId,
          userId: request.authUser!.id,
          metadata: { deletedNotificationCount: deletedNotifications.count, deletedReminderCount: deletedReminders.count }
        }
      });
      return { ok: true };
    }, appointmentTransactionOptions);
    if (!deleted) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
    return { data: deleted, error: null };
  });
}

async function findAppointmentsForRange(app: FastifyInstance, clinicId: string, start: Date, end: Date) {
  return app.prisma.appointment.findMany({
    where: { clinicId, startAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    include: { doctor: true, patient: true },
    orderBy: { startAt: "asc" }
  });
}

async function lockDoctorSchedule(tx: Pick<FastifyInstance["prisma"], "$executeRaw">, clinicId: string, doctorId: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${clinicId}:${doctorId}:appointments`}, 0))`);
}

async function assertNoDoctorConflict(
  tx: Pick<FastifyInstance["prisma"], "appointment">,
  clinicId: string,
  doctorId: string,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string
) {
  const conflict = await tx.appointment.findFirst({
    where: {
      clinicId,
      doctorId,
      status: { not: "CANCELLED" },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
    },
    select: { id: true }
  });
  if (conflict) throw new Error("APPOINTMENT_CONFLICT");
}
