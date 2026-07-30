import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  bootstrapSchema,
  changePasswordSchema,
  loginSchema
} from "@clinic/shared";
import type { User } from "@prisma/client";
import { requireAuth } from "../../common/middleware/auth.js";
import { writeAuditLog } from "../../common/utilities/audit.js";
import {
  createRefreshToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  parseDuration,
  verifyPassword
} from "../../common/utilities/security.js";
import type { Env } from "../../config/env.js";

type AuthOptions = {
  env: Env;
};

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

function publicUser(user: User) {
  return {
    id: user.id,
    clinicId: user.clinicId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null
  };
}

function cookieOptions(env: Env, maxAgeMs: number) {
  const isProduction = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProduction ? "none" as const : "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000)
  };
}

async function issueTokens(app: FastifyInstance, reply: FastifyReply, env: Env, user: User, request: FastifyRequest) {
  const refreshToken = createRefreshToken();
  const refreshExpiresMs = parseDuration(env.REFRESH_TOKEN_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + refreshExpiresMs);

  const session = await app.prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip
    }
  });

  const accessToken = app.jwt.sign(
    { sub: user.id, clinicId: user.clinicId, role: user.role, sessionId: session.id },
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN }
  );

  reply
    .setCookie(ACCESS_COOKIE, accessToken, cookieOptions(env, parseDuration(env.ACCESS_TOKEN_EXPIRES_IN)))
    .setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(env, refreshExpiresMs));

  return session;
}

function clearAuthCookies(reply: FastifyReply, env: Env) {
  reply
    .clearCookie(ACCESS_COOKIE, cookieOptions(env, 0))
    .clearCookie(REFRESH_COOKIE, cookieOptions(env, 0));
}

export async function registerAuthRoutes(app: FastifyInstance, options: AuthOptions) {
  app.get("/api/v1/auth/bootstrap-status", async () => {
    const [clinicCount, userCount] = await Promise.all([
      app.prisma.clinic.count(),
      app.prisma.user.count()
    ]);

    return { data: { initialized: clinicCount > 0 || userCount > 0 }, error: null };
  });

  app.post("/api/v1/auth/bootstrap", async (request, reply) => {
    const body = bootstrapSchema.parse(request.body);
    const clinicCount = await app.prisma.clinic.count();
    const userCount = await app.prisma.user.count();

    if (clinicCount > 0 || userCount > 0) {
      return reply.status(403).send({ error: { code: "BOOTSTRAP_DISABLED", message: "Initial setup is already complete" } });
    }

    const passwordHash = await hashPassword(body.password);
    const adminEmail = normalizeEmail(body.adminEmail);

    const result = await app.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: body.clinicName,
          phone: body.clinicPhone || null,
          email: body.clinicEmail || null,
          address: body.clinicAddress || null,
          timezone: "Asia/Beirut"
        }
      });

      const user = await tx.user.create({
        data: {
          clinicId: clinic.id,
          fullName: body.adminFullName,
          email: adminEmail,
          phone: body.adminPhone || null,
          passwordHash,
          role: "CLINIC_ADMIN"
        }
      });

      await tx.auditLog.create({
        data: {
          clinicId: clinic.id,
          userId: user.id,
          action: "BOOTSTRAP_COMPLETED",
          entityType: "Clinic",
          entityId: clinic.id,
          metadata: { adminUserId: user.id },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        }
      });

      return { clinic, user };
    });

    await issueTokens(app, reply, options.env, result.user, request);
    return reply.status(201).send({ data: { user: publicUser(result.user), clinic: result.clinic }, error: null });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await app.prisma.user.findFirst({
      where: { email: normalizeEmail(body.email) },
      include: { clinic: true }
    });

    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.status(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    }

    if (!user.isActive || !user.clinic.isActive) {
      return reply.status(401).send({ error: { code: "INACTIVE_ACCOUNT", message: "Account is inactive" } });
    }

    const updated = await app.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    await issueTokens(app, reply, options.env, updated, request);
    await writeAuditLog(app.prisma, request, {
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      clinicId: user.clinicId,
      userId: user.id
    });

    return { data: { user: publicUser(updated) }, error: null };
  });

  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    }

    const session = await app.prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { include: { clinic: true } } }
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive || !session.user.clinic.isActive) {
      clearAuthCookies(reply, options.env);
      return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    }

    await app.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    const newSession = await issueTokens(app, reply, options.env, session.user, request);
    await writeAuditLog(app.prisma, request, {
      action: "REFRESH_TOKEN_ROTATED",
      entityType: "RefreshSession",
      entityId: newSession.id,
      clinicId: session.user.clinicId,
      userId: session.user.id
    });

    return { data: { user: publicUser(session.user) }, error: null };
  });

  app.post("/api/v1/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) {
      await app.prisma.refreshSession.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    clearAuthCookies(reply, options.env);
    return { data: { ok: true }, error: null };
  });

  app.get("/api/v1/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const user = await app.prisma.user.findFirst({ where: { id: request.authUser!.id, clinicId: request.authUser!.clinicId } });
    if (!user) {
      return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    }

    return { data: { user: publicUser(user) }, error: null };
  });

  app.post("/api/v1/auth/change-password", { preHandler: requireAuth }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { id: request.authUser!.id } });

    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return reply.status(400).send({ error: { code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect" } });
    }

    await app.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) }
    });
    await app.prisma.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await writeAuditLog(app.prisma, request, {
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      clinicId: user.clinicId,
      userId: user.id
    });

    clearAuthCookies(reply, options.env);
    return { data: { ok: true }, error: null };
  });
}
