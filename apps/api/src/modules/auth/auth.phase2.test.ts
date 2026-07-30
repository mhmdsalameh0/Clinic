import type { PrismaClient, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { hashPassword } from "../../common/utilities/security.js";

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

type ClinicRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  appointmentDefaultDurationMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = {
  id: string;
  clinicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
};

function makeId(prefix: string, count: number) {
  return `${prefix}_${count}`;
}

function createFakePrisma() {
  const clinics: ClinicRecord[] = [];
  const users: UserRecord[] = [];
  const sessions: SessionRecord[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const fake = {
    clinic: {
      count: async () => clinics.length,
      create: async ({ data }: { data: Partial<ClinicRecord> }) => {
        const now = new Date();
        const clinic: ClinicRecord = {
          id: makeId("clinic", clinics.length + 1),
          name: String(data.name),
          phone: data.phone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          timezone: data.timezone ?? "Asia/Beirut",
          appointmentDefaultDurationMinutes: data.appointmentDefaultDurationMinutes ?? 30,
          isActive: data.isActive ?? true,
          createdAt: now,
          updatedAt: now
        };
        clinics.push(clinic);
        return clinic;
      },
      findUnique: async ({ where }: { where: { id: string } }) => clinics.find((clinic) => clinic.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<ClinicRecord> }) => {
        const clinic = clinics.find((item) => item.id === where.id);
        if (!clinic) throw new Error("clinic not found");
        Object.assign(clinic, data, { updatedAt: new Date() });
        return clinic;
      }
    },
    user: {
      count: async ({ where }: { where?: Partial<UserRecord> } = {}) =>
        users.filter((user) => matchesWhere(user, where)).length,
      create: async ({ data }: { data: Partial<UserRecord> }) => {
        const now = new Date();
        const user: UserRecord = {
          id: makeId("user", users.length + 1),
          clinicId: String(data.clinicId),
          fullName: String(data.fullName),
          email: String(data.email),
          phone: data.phone ?? null,
          passwordHash: String(data.passwordHash),
          role: data.role ?? "RECEPTIONIST",
          isActive: data.isActive ?? true,
          lastLoginAt: data.lastLoginAt ?? null,
          createdAt: now,
          updatedAt: now
        };
        users.push(user);
        return user;
      },
      findFirst: async (input: { where?: Partial<UserRecord>; include?: { clinic?: boolean }; select?: Record<string, boolean> }) => {
        const user = users.find((item) => matchesWhere(item, input.where));
        return shapeUser(user, input.include, input.select, clinics);
      },
      findUnique: async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null,
      findMany: async ({ where, skip = 0, take = 20 }: { where?: Partial<UserRecord>; skip?: number; take?: number }) =>
        users.filter((user) => matchesWhere(user, where)).slice(skip, skip + take),
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRecord> }) => {
        const user = users.find((item) => item.id === where.id);
        if (!user) throw new Error("user not found");
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      }
    },
    refreshSession: {
      create: async ({ data }: { data: Partial<SessionRecord> }) => {
        const now = new Date();
        const session: SessionRecord = {
          id: makeId("session", sessions.length + 1),
          userId: String(data.userId),
          tokenHash: String(data.tokenHash),
          expiresAt: data.expiresAt ?? new Date(Date.now() + 86_400_000),
          revokedAt: data.revokedAt ?? null,
          createdAt: now,
          updatedAt: now,
          userAgent: data.userAgent ?? null,
          ipAddress: data.ipAddress ?? null
        };
        sessions.push(session);
        return session;
      },
      findUnique: async ({ where, include }: { where: { tokenHash: string }; include?: { user?: { include?: { clinic?: boolean } } } }) => {
        const session = sessions.find((item) => item.tokenHash === where.tokenHash);
        if (!session) return null;
        const user = users.find((item) => item.id === session.userId);
        return include?.user ? { ...session, user: shapeUser(user, { clinic: true }, undefined, clinics) } : session;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<SessionRecord> }) => {
        const session = sessions.find((item) => item.id === where.id);
        if (!session) throw new Error("session not found");
        Object.assign(session, data, { updatedAt: new Date() });
        return session;
      },
      updateMany: async ({ where, data }: { where: Partial<SessionRecord>; data: Partial<SessionRecord> }) => {
        const matched = sessions.filter((session) => matchesWhere(session, where));
        matched.forEach((session) => Object.assign(session, data, { updatedAt: new Date() }));
        return { count: matched.length };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      if (typeof input === "function") {
        return (input as (tx: typeof fake) => unknown)(fake);
      }
      return null;
    },
    $queryRaw: async () => [{ "?column?": 1 }],
    $disconnect: async () => undefined,
    _data: { clinics, users, sessions, auditLogs }
  };

  return fake;
}

function matchesWhere<T extends Record<string, unknown>>(record: T, where?: Partial<T>) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR" && Array.isArray(value)) {
      return value.some((item) => matchesSearch(record, item as Record<string, unknown>));
    }
    return value === undefined || record[key] === value;
  });
}

function matchesSearch(record: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).some(([key, value]) => {
    const condition = value as { contains?: string };
    return String(record[key] ?? "").toLowerCase().includes(String(condition.contains ?? "").toLowerCase());
  });
}

function shapeUser(
  user: UserRecord | undefined,
  include: { clinic?: boolean } | undefined,
  select: Record<string, boolean> | undefined,
  clinics: ClinicRecord[]
) {
  if (!user) return null;
  if (select) {
    return Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, user[key as keyof UserRecord]]));
  }
  if (include?.clinic) {
    return { ...user, clinic: clinics.find((clinic) => clinic.id === user.clinicId) };
  }
  return user;
}

function cookieHeader(response: { cookies: Array<{ name: string; value: string }> }) {
  return response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function createAppWithFakePrisma() {
  const prisma = createFakePrisma();
  const app = await buildApp({ env: testEnv, prisma: prisma as unknown as PrismaClient });
  return { app, prisma };
}

async function bootstrap(app: Awaited<ReturnType<typeof buildApp>>) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/bootstrap",
    payload: {
      clinicName: "عيادة الاختبار",
      adminFullName: "مدير الاختبار",
      adminEmail: "admin@example.com",
      adminPhone: "+961000000",
      password: "Password123!"
    }
  });
}

describe("phase 2 authentication and authorization", () => {
  it("allows bootstrap only once and never returns password hashes", async () => {
    const { app } = await createAppWithFakePrisma();
    const first = await bootstrap(app);
    const second = await bootstrap(app);

    expect(first.statusCode).toBe(201);
    expect(JSON.stringify(first.json())).not.toContain("passwordHash");
    expect(second.statusCode).toBe(403);
    await app.close();
  });

  it("logs in successfully and rejects invalid or inactive users", async () => {
    const { app, prisma } = await createAppWithFakePrisma();
    await bootstrap(app);

    const success = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "Password123!" }
    });
    const failure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "wrong-password" }
    });
    prisma._data.users[0]!.isActive = false;
    const inactive = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "Password123!" }
    });

    expect(success.statusCode).toBe(200);
    expect(failure.statusCode).toBe(401);
    expect(inactive.statusCode).toBe(401);
    await app.close();
  });

  it("rotates refresh tokens and revokes logout sessions", async () => {
    const { app, prisma } = await createAppWithFakePrisma();
    await bootstrap(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "Password123!" }
    });

    const refresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: cookieHeader(login) }
    });
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: cookieHeader(refresh) }
    });

    expect(refresh.statusCode).toBe(200);
    expect(logout.statusCode).toBe(200);
    expect(prisma._data.sessions.filter((session) => session.revokedAt).length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it("rejects unauthenticated and role-forbidden access", async () => {
    const { app, prisma } = await createAppWithFakePrisma();
    await bootstrap(app);
    const user = await prisma.user.create({
      data: {
        clinicId: prisma._data.clinics[0]!.id,
        fullName: "موظف استقبال",
        email: "reception@example.com",
        passwordHash: await hashPassword("Password123!"),
        role: "RECEPTIONIST"
      }
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: user.email, password: "Password123!" }
    });

    const unauthenticated = await app.inject({ method: "GET", url: "/api/v1/users" });
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: cookieHeader(login) },
      payload: { fullName: "طبيب", email: "doctor@example.com", role: "DOCTOR", password: "Password123!" }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(forbidden.statusCode).toBe(403);
    await app.close();
  });

  it("preserves clinic tenant isolation in user reads", async () => {
    const { app, prisma } = await createAppWithFakePrisma();
    const setup = await bootstrap(app);
    const otherClinic = await prisma.clinic.create({ data: { name: "عيادة أخرى" } });
    await prisma.user.create({
      data: {
        clinicId: otherClinic.id,
        fullName: "مستخدم آخر",
        email: "other@example.com",
        passwordHash: await hashPassword("Password123!"),
        role: "CLINIC_ADMIN"
      }
    });

    const users = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie: cookieHeader(setup) }
    });

    expect(users.statusCode).toBe(200);
    expect(users.json().data.items).toHaveLength(1);
    await app.close();
  });

  it("prevents deactivation of the final clinic admin", async () => {
    const { app } = await createAppWithFakePrisma();
    const setup = await bootstrap(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users/user_1/deactivate",
      headers: { cookie: cookieHeader(setup) }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("SELF_DEACTIVATION");
    await app.close();
  });
});
