import type { UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

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

function createAppointment(id: string, clinicId: string, startAt: Date) {
  return {
    id,
    clinicId,
    patientId: `patient_${id}`,
    doctorId: `doctor_${id}`,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    durationMinutes: 30,
    status: "SCHEDULED",
    reason: null,
    doctor: { id: `doctor_${id}`, fullName: "Doctor", specialty: null },
    patient: { id: `patient_${id}`, firstName: "Patient", lastName: id, phone: "+961000000" }
  };
}

function createFakePrisma() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
  const state = {
    users: [{ id: "user_1", clinicId: "clinic_1", email: "admin@example.com", role: "CLINIC_ADMIN" as UserRole, isActive: true }],
    clinics: [{ id: "clinic_1", timezone: "Asia/Beirut" }, { id: "clinic_2", timezone: "Asia/Beirut" }],
    appointments: [
      createAppointment("one", "clinic_1", tomorrow),
      createAppointment("other", "clinic_2", tomorrow)
    ]
  };
  const fake = {
    $transaction: vi.fn(async (input: unknown[]) => Promise.all(input)),
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; clinicId?: string; isActive?: boolean } }) =>
        state.users.find((user) => (!where.id || user.id === where.id) && (!where.clinicId || user.clinicId === where.clinicId) && (where.isActive === undefined || user.isActive === where.isActive)) ?? null
      )
    },
    clinic: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => state.clinics.find((clinic) => clinic.id === where.id)!)
    },
    appointment: {
      findMany: vi.fn(async ({ where }: { where: { clinicId: string } }) => state.appointments.filter((appointment) => appointment.clinicId === where.clinicId)),
      findFirst: vi.fn(async ({ where }: { where: { clinicId: string } }) => state.appointments.find((appointment) => appointment.clinicId === where.clinicId) ?? null)
    },
    notification: {
      count: vi.fn(async ({ where }: { where: { clinicId: string; userId: string; readAt: null } }) => where.clinicId === "clinic_1" && where.userId === "user_1" && where.readAt === null ? 3 : 0)
    }
  };
  return fake;
}

describe("dashboard summary", () => {
  it("returns scoped dashboard data in one response", async () => {
    const prisma = createFakePrisma();
    const app = await buildApp({ env: testEnv, prisma: prisma as never });
    const token = app.jwt.sign({ sub: "user_1", clinicId: "clinic_1", role: "CLINIC_ADMIN", sessionId: "session_1" });

    const response = await app.inject({ method: "GET", url: "/api/v1/dashboard/summary", headers: { cookie: `access_token=${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.tomorrow).toHaveLength(1);
    expect(response.json().data.tomorrow[0].id).toBe("one");
    expect(response.json().data.unreadNotificationCount).toBe(3);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clinicId: "clinic_1" }) }));
    await app.close();
  });
});
