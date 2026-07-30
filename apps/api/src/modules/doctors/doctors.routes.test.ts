import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const user = {
  id: "user_1",
  clinicId: "clinic_1",
  role: "CLINIC_ADMIN" as UserRole
};

function createFakePrisma(options: { duplicateDoctorEmail?: boolean } = {}) {
  const doctorCreate = vi.fn(async ({ data }) => {
    if (options.duplicateDoctorEmail) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["clinicId", "email"] }
      });
    }

    return {
      id: "doctor_1",
      ...data,
      userId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  return {
    user: {
      findFirst: vi.fn(async () => user)
    },
    doctor: {
      create: doctorCreate
    },
    auditLog: {
      create: vi.fn(async () => ({}))
    }
  } as unknown as PrismaClient & { doctor: { create: typeof doctorCreate } };
}

async function createApp(prisma: PrismaClient) {
  const app = await buildApp({ env: testEnv, prisma });
  const token = app.jwt.sign({ sub: user.id, clinicId: user.clinicId, role: user.role, sessionId: "session_1" });

  return { app, cookie: `access_token=${token}` };
}

describe("doctor routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts appointmentDurationMinutes from form payloads as a number", async () => {
    const prisma = createFakePrisma();
    const { app, cookie } = await createApp(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/doctors",
      cookies: { access_token: cookie.replace("access_token=", "") },
      payload: {
        fullName: "الدكتور سامر أحمد",
        specialty: "طب أسنان",
        phone: "+96171123456",
        email: "samer@clinic.com",
        appointmentDurationMinutes: "30"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.doctor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "الدكتور سامر أحمد",
        specialty: "طب أسنان",
        phone: "+96171123456",
        email: "samer@clinic.com",
        appointmentDurationMinutes: 30
      })
    });

    await app.close();
  });

  it("returns a clear Arabic error when the doctor email already exists", async () => {
    const prisma = createFakePrisma({ duplicateDoctorEmail: true });
    const { app, cookie } = await createApp(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/doctors",
      cookies: { access_token: cookie.replace("access_token=", "") },
      payload: {
        fullName: "الدكتور سامر أحمد",
        specialty: "طب أسنان",
        phone: "+96171123456",
        email: "samer@clinic.com",
        appointmentDurationMinutes: 30
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "DOCTOR_EMAIL_EXISTS",
        message: "يوجد طبيب مسجل بهذا البريد الإلكتروني"
      }
    });

    await app.close();
  });
});
