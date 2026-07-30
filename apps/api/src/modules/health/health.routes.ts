import type { FastifyInstance } from "fastify";
import type { Env } from "../../config/env.js";

type HealthOptions = {
  env: Env;
};

export async function registerHealthRoutes(app: FastifyInstance, options: HealthOptions) {
  const handler = async () => ({
    status: "ok" as const,
    service: "clinic-api",
    timestamp: new Date().toISOString(),
    environment: options.env.NODE_ENV,
    database: await getDatabaseStatus(app)
  });

  app.get("/health", handler);
  app.get("/api/v1/health", handler);
}

async function getDatabaseStatus(app: FastifyInstance) {
  if (!("prisma" in app)) {
    return "disconnected" as const;
  }

  try {
    await app.prisma.$queryRaw`SELECT 1`;
    return "connected" as const;
  } catch {
    return "disconnected" as const;
  }
}
