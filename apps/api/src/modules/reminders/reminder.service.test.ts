import { describe, expect, it, vi } from "vitest";
import { buildAppointmentReminderMessage, getReminderSchedule, processDueReminders, reconcileDueAppointmentReminders, upsertAppointmentReminder } from "./reminder.service.js";

type AppointmentStatus = "SCHEDULED" | "CANCELLED";
type ReminderStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED";

function createFakeReminderDb(options: { startAt: Date; appointmentStatus?: AppointmentStatus; scheduledFor?: Date }) {
  const clinic = { id: "clinic_1", timezone: "Asia/Beirut" };
  const doctor = { id: "doctor_1", fullName: "سامر" };
  const patient = { id: "patient_1", firstName: "أحمد", lastName: "محمد" };
  const appointment = {
    id: "appointment_1",
    clinicId: clinic.id,
    doctorId: doctor.id,
    patientId: patient.id,
    startAt: options.startAt,
    status: options.appointmentStatus ?? "SCHEDULED",
    clinic,
    doctor,
    patient
  };
  const users = [
    { id: "admin_1", clinicId: clinic.id, role: "CLINIC_ADMIN", isActive: true },
    { id: "reception_1", clinicId: clinic.id, role: "RECEPTIONIST", isActive: true }
  ];
  const reminders = options.scheduledFor
    ? [
        {
          id: "reminder_1",
          clinicId: clinic.id,
          appointmentId: appointment.id,
          appointment,
          status: "PENDING" as ReminderStatus,
          scheduledFor: options.scheduledFor,
          idempotencyKey: "appointment:appointment_1:24h:in_app",
          sentAt: null as Date | null,
          errorMessage: null as string | null
        }
      ]
    : [];
  const notifications: Array<{ id: string; clinicId: string; userId: string; appointmentId: string; type: string; title: string; message: string; readAt: Date | null }> = [];

  const db = {
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
    $queryRaw: vi.fn(async () =>
      reminders
        .filter((reminder) => reminder.status === "PENDING" && reminder.scheduledFor.getTime() <= Date.now())
        .map((reminder) => ({ id: reminder.id }))
    ),
    appointment: {
      findMany: vi.fn(async ({ where }: { where: { status: { not: string }; startAt: { gt: Date; lte: Date } } }) =>
        appointment.status !== where.status.not && appointment.startAt > where.startAt.gt && appointment.startAt <= where.startAt.lte
          ? [{ id: appointment.id, clinicId: appointment.clinicId, startAt: appointment.startAt }]
          : []
      )
    },
    reminder: {
      upsert: vi.fn(async ({ create, update }: { create: { scheduledFor: Date; status: ReminderStatus; idempotencyKey: string }; update: { scheduledFor: Date; status: ReminderStatus } }) => {
        let reminder = reminders.find((item) => item.idempotencyKey === create.idempotencyKey);
        if (!reminder) {
          reminder = {
            id: "reminder_1",
            clinicId: clinic.id,
            appointmentId: appointment.id,
            appointment,
            status: create.status,
            scheduledFor: create.scheduledFor,
            idempotencyKey: create.idempotencyKey,
            sentAt: null,
            errorMessage: null
          };
          reminders.push(reminder);
        } else {
          reminder.status = update.status;
          reminder.scheduledFor = update.scheduledFor;
          reminder.sentAt = null;
          reminder.errorMessage = null;
        }
        return reminder;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status?: ReminderStatus; sentAt?: Date; errorMessage?: string | null } }) => {
        const reminder = reminders.find((item) => item.id === where.id);
        if (!reminder) throw new Error("REMINDER_NOT_FOUND");
        if (data.status) reminder.status = data.status;
        if ("sentAt" in data) reminder.sentAt = data.sentAt ?? null;
        if ("errorMessage" in data) reminder.errorMessage = data.errorMessage ?? null;
        return reminder;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: { in: string[] } }; data: { status?: ReminderStatus; processingStartedAt?: Date; attemptCount?: { increment: number } } }) => {
        const ids = where.id?.in ?? [];
        let count = 0;
        for (const reminder of reminders) {
          if (ids.includes(reminder.id)) {
            if (data.status) reminder.status = data.status;
            count += 1;
          }
        }
        return { count };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => reminders.find((item) => item.id === where.id) ?? null)
    },
    user: {
      findMany: vi.fn(async () => users.map((user) => ({ id: user.id })))
    },
    notification: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; appointmentId: string; type: string } }) =>
        notifications.find((item) => item.userId === where.userId && item.appointmentId === where.appointmentId && item.type === where.type) ?? null
      ),
      create: vi.fn(async ({ data }: { data: { clinicId: string; userId: string; appointmentId: string; type: string; title: string; message: string } }) => {
        const notification = { id: `notification_${notifications.length + 1}`, readAt: null, ...data };
        notifications.push(notification);
        return notification;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { title: string; message: string; readAt: Date | null } }) => {
        const notification = notifications.find((item) => item.id === where.id);
        if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
        notification.title = data.title;
        notification.message = data.message;
        notification.readAt = data.readAt;
        return notification;
      })
    },
    __state: { appointment, reminders, notifications }
  };

  return db;
}

describe("reminder service", () => {
  it("schedules one day before when the appointment is more than 24 hours in advance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    const startAt = new Date("2026-08-01T07:00:00.000Z");
    const db = createFakeReminderDb({ startAt });

    await upsertAppointmentReminder(db as never, "clinic_1", "appointment_1", startAt);

    expect(getReminderSchedule(startAt, new Date()).toISOString()).toBe("2026-07-31T07:00:00.000Z");
    expect(db.__state.reminders[0].status).toBe("PENDING");
    expect(db.__state.notifications).toHaveLength(0);
    vi.useRealTimers();
  });

  it("creates the notification immediately when the appointment is less than 24 hours in advance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T08:30:00.000Z"));
    const startAt = new Date("2026-07-31T07:00:00.000Z");
    const db = createFakeReminderDb({ startAt });

    await upsertAppointmentReminder(db as never, "clinic_1", "appointment_1", startAt);

    expect(db.__state.reminders[0].status).toBe("SENT");
    expect(db.__state.notifications).toHaveLength(2);
    expect(new Set(db.__state.notifications.map((item) => item.userId)).size).toBe(2);
    vi.useRealTimers();
  });

  it("catches up overdue pending reminders after worker restart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
    const db = createFakeReminderDb({ startAt: new Date("2026-07-31T07:00:00.000Z"), scheduledFor: new Date("2026-07-30T07:00:00.000Z") });

    const processed = await processDueReminders(db as never);

    expect(processed).toBe(1);
    expect(db.__state.reminders[0].status).toBe("SENT");
    expect(db.__state.notifications).toHaveLength(2);
    vi.useRealTimers();
  });

  it("reconciles active appointments within 24 hours when the worker starts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T08:30:00.000Z"));
    const db = createFakeReminderDb({ startAt: new Date("2026-07-31T07:00:00.000Z") });

    const reconciled = await reconcileDueAppointmentReminders(db as never);

    expect(reconciled).toBe(1);
    expect(db.__state.reminders).toHaveLength(1);
    expect(db.__state.reminders[0].status).toBe("SENT");
    expect(db.__state.notifications).toHaveLength(2);
    vi.useRealTimers();
  });

  it("does not duplicate notifications across repeated worker executions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
    const db = createFakeReminderDb({ startAt: new Date("2026-07-31T07:00:00.000Z"), scheduledFor: new Date("2026-07-30T07:00:00.000Z") });

    await processDueReminders(db as never);
    await processDueReminders(db as never);

    expect(db.__state.notifications).toHaveLength(2);
    expect(db.__state.reminders[0].status).toBe("SENT");
    vi.useRealTimers();
  });

  it("reschedules a pending reminder and sends immediately when the new reminder time is due", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    const db = createFakeReminderDb({ startAt: new Date("2026-08-01T07:00:00.000Z") });

    await upsertAppointmentReminder(db as never, "clinic_1", "appointment_1", new Date("2026-08-01T07:00:00.000Z"));
    vi.setSystemTime(new Date("2026-07-30T08:30:00.000Z"));
    db.__state.appointment.startAt = new Date("2026-07-31T07:00:00.000Z");
    await upsertAppointmentReminder(db as never, "clinic_1", "appointment_1", db.__state.appointment.startAt);

    expect(db.__state.reminders).toHaveLength(1);
    expect(db.__state.reminders[0].status).toBe("SENT");
    expect(db.__state.notifications).toHaveLength(2);
    vi.useRealTimers();
  });

  it("reschedules an already notified appointment to a future reminder without duplicating the notification", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T08:30:00.000Z"));
    const db = createFakeReminderDb({ startAt: new Date("2026-07-31T07:00:00.000Z") });

    await upsertAppointmentReminder(db as never, "clinic_1", "appointment_1", db.__state.appointment.startAt);
    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
    db.__state.appointment.startAt = new Date("2026-08-01T08:00:00.000Z");
    await upsertAppointmentReminder(db as never, "clinic_1", "appointment_1", db.__state.appointment.startAt);

    expect(db.__state.reminders).toHaveLength(1);
    expect(db.__state.reminders[0].status).toBe("PENDING");
    expect(db.__state.notifications).toHaveLength(2);
    expect(db.__state.notifications[0].message).toContain("11:00");
    vi.useRealTimers();
  });

  it("does not create reminder notifications for cancelled appointments", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
    const db = createFakeReminderDb({ appointmentStatus: "CANCELLED", startAt: new Date("2026-07-31T07:00:00.000Z"), scheduledFor: new Date("2026-07-30T07:00:00.000Z") });

    const processed = await processDueReminders(db as never);

    expect(processed).toBe(1);
    expect(db.__state.reminders[0].status).toBe("CANCELLED");
    expect(db.__state.notifications).toHaveLength(0);
    vi.useRealTimers();
  });

  it("formats the Arabic appointment reminder message", () => {
    const message = buildAppointmentReminderMessage({
      patientName: "أحمد محمد",
      doctorName: "سامر",
      startAt: new Date("2026-08-01T07:00:00.000Z"),
      timezone: "Asia/Beirut"
    });

    expect(message).toBe("تذكير: غداً الساعة 10:00، موعد المريض أحمد محمد مع الدكتور سامر.");
  });
});
