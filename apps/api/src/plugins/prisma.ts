import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prismaPlugin = fp(async (app) => {
  const prisma =
    process.env.NODE_ENV === "production"
      ? new PrismaClient()
      : (globalForPrisma.prisma ??= new PrismaClient());

  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});

