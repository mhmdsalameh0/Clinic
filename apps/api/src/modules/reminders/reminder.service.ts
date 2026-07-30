import type { FastifyBaseLogger } from "fastify";
import { Prisma, type PrismaClient } from "@prisma/client";
import { formatLocalTime } from "../../common/utilities/datetime.js";

const DAY_MS = 24 * 60 * 60 * 1000;
type ReminderDb = PrismaClient | Prisma.TransactionClient;
type ReminderWithAppointment = Prisma.ReminderGetPayload<{
  include: {
    appointment: {
      include: {
        clinic: true;
        doctor: true;
        patient: true;
      };
    };
  };
}>;

export function getReminderSchedule(startAt: Date, now = new Date()) {
  const target = new Date(startAt.getTime() - DAY_MS);
  return target < now ? now : target;
}

export function buildAppointmentReminderMessage(input: {
  patientName: string;
  doctorName: string;
  startAt: Date;
  timezone: string;
}) {
  const time = formatLocalTime(input.startAt, input.timezone);
  return `تذكير: غداً الساعة ${time}، موعد المريض ${input.patientName} مع الدكتور ${input.doctorName}.`;
}

export async function upsertAppointmentReminder(prisma: ReminderDb, clinicId: string, appointmentId: string, startAt: Date) {
  const now = new Date();
  const scheduledFor = getReminderSchedule(startAt, now);
  const reminder = await prisma.reminder.upsert({
    where: { idempotencyKey: `appointment:${appointmentId}:24h:in_app` },
    create: {
      clinicId,
      appointmentId,
      type: "APPOINTMENT_24_HOURS",
      channel: "IN_APP",
      status: "PENDING",
      scheduledFor,
      idempotencyKey: `appointment:${appointmentId}:24h:in_app`
    },
    update: {
      status: "PENDING",
      scheduledFor,
      sentAt: null,
      failedAt: null,
      errorMessage: null
    },
    include: {
      appointment: {
        include: {
          clinic: true,
          doctor: true,
          patient: true
        }
      }
    }
  });

  if (scheduledFor <= now) {
    await syncReminderNotifications(prisma, reminder, { createMissing: true });
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: "SENT", sentAt: new Date(), errorMessage: null }
    });
  } else {
    await syncReminderNotifications(prisma, reminder, { createMissing: false });
  }
}

export async function cancelAppointmentReminders(prisma: ReminderDb, appointmentId: string) {
  await prisma.reminder.updateMany({
    where: { appointmentId, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
    data: { status: "CANCELLED" }
  });
}

export async function reconcileDueAppointmentReminders(prisma: PrismaClient, logger?: FastifyBaseLogger) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + DAY_MS);
  const appointments = await prisma.appointment.findMany({
    where: {
      status: { not: "CANCELLED" },
      startAt: { gt: now, lte: cutoff }
    },
    select: { id: true, clinicId: true, startAt: true }
  });

  for (const appointment of appointments) {
    try {
      await prisma.$transaction(async (tx) => {
        await upsertAppointmentReminder(tx, appointment.clinicId, appointment.id, appointment.startAt);
      });
    } catch (error) {
      logger?.error({ err: error, appointmentId: appointment.id }, "failed to reconcile appointment reminder");
    }
  }

  return appointments.length;
}

export async function processDueReminders(prisma: PrismaClient, logger?: FastifyBaseLogger) {
  const reminderIds = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Reminder"
      WHERE status = 'PENDING'::"ReminderStatus"
        AND "scheduledFor" <= NOW()
      ORDER BY "scheduledFor" ASC
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) return [];

    await tx.reminder.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { status: "PROCESSING", processingStartedAt: new Date(), attemptCount: { increment: 1 } }
    });

    return rows.map((row) => row.id);
  });

  for (const id of reminderIds) {
    await processReminder(prisma, id, logger);
  }

  return reminderIds.length;
}

async function processReminder(prisma: PrismaClient, reminderId: string, logger?: FastifyBaseLogger) {
  try {
    await prisma.$transaction(async (tx) => {
      const reminder = await tx.reminder.findUnique({
        where: { id: reminderId },
        include: {
          appointment: {
            include: {
              clinic: true,
              doctor: true,
              patient: true
            }
          }
        }
      });

      if (!reminder || reminder.status !== "PROCESSING" || !reminder.appointment) return;

      if (reminder.appointment.status === "CANCELLED") {
        await tx.reminder.update({
          where: { id: reminder.id },
          data: { status: "CANCELLED", errorMessage: null }
        });
        return;
      }

      await syncReminderNotifications(tx, reminder, { createMissing: true });

      await tx.reminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", sentAt: new Date(), errorMessage: null }
      });
    });
  } catch (error) {
    logger?.error({ err: error, reminderId }, "failed to process reminder");
    await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown reminder error"
      }
    });
  }
}

async function syncReminderNotifications(
  prisma: ReminderDb,
  reminder: ReminderWithAppointment,
  options: { createMissing: boolean }
) {
  if (!reminder.appointment || reminder.appointment.status === "CANCELLED") return;

  const appointment = reminder.appointment;
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
  const title = "تذكير بموعد الغد";
  const message = buildAppointmentReminderMessage({
    patientName,
    doctorName: appointment.doctor.fullName,
    startAt: appointment.startAt,
    timezone: appointment.clinic.timezone
  });
  const users = await prisma.user.findMany({
    where: {
      clinicId: reminder.clinicId,
      isActive: true,
      role: { in: ["CLINIC_ADMIN", "RECEPTIONIST"] }
    },
    select: { id: true }
  });

  for (const user of users) {
    await lockAppointmentNotification(prisma, appointment.id, user.id);
    const exists = await prisma.notification.findFirst({
      where: {
        userId: user.id,
        appointmentId: appointment.id,
        type: "APPOINTMENT_REMINDER"
      }
    });
    if (exists) {
      await prisma.notification.update({
        where: { id: exists.id },
        data: { title, message, readAt: null }
      });
      continue;
    }
    if (!options.createMissing) continue;

    await prisma.notification.create({
      data: {
        clinicId: reminder.clinicId,
        userId: user.id,
        appointmentId: appointment.id,
        type: "APPOINTMENT_REMINDER",
        title,
        message
      }
    });
  }
}

async function lockAppointmentNotification(prisma: Pick<ReminderDb, "$executeRaw">, appointmentId: string, userId: string) {
  await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${appointmentId}:${userId}:appointment-reminder`}, 0))`);
}
