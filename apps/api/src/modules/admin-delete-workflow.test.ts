import type { UserRole } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";

const testEnv = {
  NODE_ENV: "test" as const,
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: undefined,
  DIRECT_URL: undefined,
  JWT_ACCESS_SECRET: "test-access-secret",
  JWT_REFRESH_SECRET: "test-refresh-secret",
  COOKIE_SECRET: "test-cookie-secret",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d"
};

function createFakePrisma(role: UserRole = "CLINIC_ADMIN", counts: { doctorAppointments?: number; patientAppointments?: number } = {}) {
  const state = {
    clinic: { id: "clinic_1" },
    users: [{ id: "user_1", clinicId: "clinic_1", email: "admin@example.com", role, isActive: true }],
    doctors: [{ id: "doctor_1", clinicId: "clinic_1", fullName: "Doctor" }],
    patients: [{ id: "patient_1", clinicId: "clinic_1", firstName: "Patient" }],
    appointments: [{ id: "appointment_1", clinicId: "clinic_1", doctorId: "doctor_1", patientId: "patient_1" }],
    reminders: [{ id: "reminder_1", clinicId: "clinic_1", appointmentId: "appointment_1" }],
    notifications: [{ id: "notification_1", clinicId: "clinic_1", appointmentId: "appointment_1", userId: "user_1" }],
    auditLogs: [] as unknown[]
  };

  const fake = {
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") return input(fake);
      if (Array.isArray(input)) return Promise.all(input);
      return input;
    }),
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; email?: string; clinicId?: string; isActive?: boolean } }) =>
        state.users.find((user) => (!where.id || user.id === where.id) && (!where.email || user.email === where.email) && (!where.clinicId || user.clinicId === where.clinicId) && (where.isActive === undefined || user.isActive === where.isActive)) ?? null
      )
    },
    clinic: {
      deleteMany: vi.fn(),
      count: vi.fn(async () => 1)
    },
    doctor: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; clinicId?: string } }) => state.doctors.find((doctor) => doctor.id === where.id && doctor.clinicId === where.clinicId) ?? null),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.doctors = state.doctors.filter((doctor) => doctor.id !== where.id);
        return {};
      }),
      deleteMany: vi.fn(async ({ where }: { where: { clinicId: string } }) => {
        const count = state.doctors.filter((doctor) => doctor.clinicId === where.clinicId).length;
        state.doctors = state.doctors.filter((doctor) => doctor.clinicId !== where.clinicId);
        return { count };
      })
    },
    patient: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; clinicId?: string } }) => state.patients.find((patient) => patient.id === where.id && patient.clinicId === where.clinicId) ?? null),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.patients = state.patients.filter((patient) => patient.id !== where.id);
        return {};
      }),
      deleteMany: vi.fn(async ({ where }: { where: { clinicId: string } }) => {
        const count = state.patients.filter((patient) => patient.clinicId === where.clinicId).length;
        state.patients = state.patients.filter((patient) => patient.clinicId !== where.clinicId);
        return { count };
      })
    },
    appointment: {
      count: vi.fn(async ({ where }: { where: { doctorId?: string; patientId?: string } }) => {
        if (where.doctorId) return counts.doctorAppointments ?? 0;
        if (where.patientId) return counts.patientAppointments ?? 0;
        return state.appointments.length;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; clinicId?: string } }) => state.appointments.find((appointment) => appointment.id === where.id && appointment.clinicId === where.clinicId) ?? null),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.appointments = state.appointments.filter((appointment) => appointment.id !== where.id);
        return {};
      }),
      deleteMany: vi.fn(async ({ where }: { where: { clinicId: string } }) => {
        const count = state.appointments.filter((appointment) => appointment.clinicId === where.clinicId).length;
        state.appointments = state.appointments.filter((appointment) => appointment.clinicId !== where.clinicId);
        return { count };
      })
    },
    reminder: {
      deleteMany: vi.fn(async ({ where }: { where: { clinicId?: string; appointmentId?: string } }) => {
        const count = state.reminders.filter((reminder) => (!where.clinicId || reminder.clinicId === where.clinicId) && (!where.appointmentId || reminder.appointmentId === where.appointmentId)).length;
        state.reminders = state.reminders.filter((reminder) => !((!where.clinicId || reminder.clinicId === where.clinicId) && (!where.appointmentId || reminder.appointmentId === where.appointmentId)));
        return { count };
      })
    },
    notification: {
      deleteMany: vi.fn(async ({ where }: { where: { clinicId?: string; appointmentId?: string } }) => {
        const count = state.notifications.filter((notification) => (!where.clinicId || notification.clinicId === where.clinicId) && (!where.appointmentId || notification.appointmentId === where.appointmentId)).length;
        state.notifications = state.notifications.filter((notification) => !((!where.clinicId || notification.clinicId === where.clinicId) && (!where.appointmentId || notification.appointmentId === where.appointmentId)));
        return { count };
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        state.auditLogs.push(data);
        return data;
      })
    },
    __state: state
  };

  return fake;
}

async function createApp(role: UserRole = "CLINIC_ADMIN", counts: { doctorAppointments?: number; patientAppointments?: number } = {}) {
  const prisma = createFakePrisma(role, counts);
  const app = await buildApp({ env: testEnv, prisma: prisma as never });
  const token = app.jwt.sign({ sub: "user_1", clinicId: "clinic_1", role, sessionId: "session_1" });
  return { app, prisma, headers: { cookie: `access_token=${token}` } };
}

describe("admin delete workflow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows clinic admins to permanently delete doctors with no appointments", async () => {
    const { app, prisma, headers } = await createApp();
    const response = await app.inject({ method: "DELETE", url: "/api/v1/doctors/doctor_1", headers });
    expect(response.statusCode).toBe(200);
    expect(prisma.doctor.delete).toHaveBeenCalledWith({ where: { id: "doctor_1" } });
    await app.close();
  });

  it("rejects permanent deletes for receptionists", async () => {
    const { app, prisma, headers } = await createApp("RECEPTIONIST");
    const response = await app.inject({ method: "DELETE", url: "/api/v1/doctors/doctor_1", headers });
    expect(response.statusCode).toBe(403);
    expect(prisma.doctor.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it("blocks doctor and patient deletion when appointments exist", async () => {
    const { app, headers } = await createApp("CLINIC_ADMIN", { doctorAppointments: 1, patientAppointments: 1 });
    const doctor = await app.inject({ method: "DELETE", url: "/api/v1/doctors/doctor_1", headers });
    const patient = await app.inject({ method: "DELETE", url: "/api/v1/patients/patient_1", headers });
    expect(doctor.statusCode).toBe(409);
    expect(doctor.json().error.message).toBe("لا يمكن حذف الطبيب لوجود مواعيد مرتبطة به. يمكنك تعطيله بدلاً من ذلك.");
    expect(patient.statusCode).toBe(409);
    expect(patient.json().error.message).toBe("لا يمكن حذف المريض لوجود مواعيد مرتبطة به. يمكنك تعطيله بدلاً من ذلك.");
    await app.close();
  });

  it("permanently deletes an appointment with its reminder and notification", async () => {
    const { app, prisma, headers } = await createApp();
    const response = await app.inject({ method: "DELETE", url: "/api/v1/appointments/appointment_1", headers });
    expect(response.statusCode).toBe(200);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { appointmentId: "appointment_1", clinicId: "clinic_1" } });
    expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({ where: { appointmentId: "appointment_1", clinicId: "clinic_1" } });
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: "appointment_1" } });
    await app.close();
  });

  it("demo cleanup deletes only clinic workflow data and keeps clinic and admin", async () => {
    const { app, prisma, headers } = await createApp();
    const response = await app.inject({ method: "POST", url: "/api/v1/clinic/demo-cleanup", headers, payload: { confirmation: "مسح" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ notifications: 1, reminders: 1, appointments: 1, patients: 1, doctors: 1 });
    expect(prisma.clinic.deleteMany).not.toHaveBeenCalled();
    expect(prisma.__state.users).toHaveLength(1);
    expect(prisma.__state.clinic.id).toBe("clinic_1");
    expect(prisma.__state.auditLogs).toHaveLength(1);
    await app.close();
  });
});
