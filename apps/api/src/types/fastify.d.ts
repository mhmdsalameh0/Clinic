import type { PrismaClient, UserRole } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    authUser?: {
      id: string;
      clinicId: string;
      role: UserRole;
      sessionId?: string;
    };
  }
}

