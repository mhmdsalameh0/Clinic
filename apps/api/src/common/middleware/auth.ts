import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.access_token;

  if (!token) {
    return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
  }

  try {
    const payload = request.server.jwt.verify<{
      sub: string;
      clinicId: string;
      role: UserRole;
      sessionId?: string;
    }>(token);

    const user = await request.server.prisma.user.findFirst({
      where: { id: payload.sub, clinicId: payload.clinicId, isActive: true },
      select: { id: true, clinicId: true, role: true }
    });

    if (!user) {
      return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    }

    request.authUser = {
      id: user.id,
      clinicId: user.clinicId,
      role: user.role,
      sessionId: payload.sessionId
    };
  } catch {
    return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
  }
}

export function requireRole(roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    if (!request.authUser || !roles.includes(request.authUser.role)) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
    }
  };
}

