import type { FastifyRequest } from "fastify";
import { Prisma, type PrismaClient } from "@prisma/client";

export async function writeAuditLog(
  prisma: PrismaClient,
  request: FastifyRequest,
  input: {
    action: string;
    entityType: string;
    entityId?: string | null;
    clinicId?: string | null;
    userId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      clinicId: input.clinicId,
      userId: input.userId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    }
  });
}
