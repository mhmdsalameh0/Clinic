import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import fastify from "fastify";
import type { PrismaClient } from "@prisma/client";
import { env as defaultEnv, type Env } from "./config/env.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { registerAppointmentRoutes } from "./modules/appointments/appointments.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerClinicRoutes } from "./modules/clinics/clinic.routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { registerDoctorRoutes } from "./modules/doctors/doctors.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerNotificationRoutes } from "./modules/notifications/notifications.routes.js";
import { registerPatientRoutes } from "./modules/patients/patients.routes.js";
import { registerReminderRoutes } from "./modules/reminders/reminders.routes.js";
import { registerUserRoutes } from "./modules/users/users.routes.js";
import { startReminderWorker } from "./workers/reminders/runner.js";

export type BuildAppOptions = {
  env?: Env;
  prisma?: PrismaClient;
  usePrismaPlugin?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const appEnv = options.env ?? defaultEnv;
  const app = fastify({
    logger:
      appEnv.NODE_ENV === "test"
        ? false
        : {
            level: appEnv.NODE_ENV === "production" ? "info" : "debug"
          }
  });

  app.setErrorHandler(errorHandler);
  app.addHook("onResponse", async (request, reply) => {
    if (appEnv.NODE_ENV !== "test") {
      app.log.info({
        method: request.method,
        url: request.routeOptions.url ?? request.url.split("?")[0],
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime)
      }, "request duration");
    }
  });

  await app.register(helmet);
  await app.register(cookie, {
    secret: appEnv.COOKIE_SECRET || "development-cookie-secret-change-me"
  });
  await app.register(jwt, {
    secret: appEnv.JWT_ACCESS_SECRET || "development-access-secret-change-me"
  });
  await app.register(cors, {
    origin: appEnv.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
  });

  if (options.prisma) {
    app.decorate("prisma", options.prisma);
  } else if (options.usePrismaPlugin !== false) {
    await app.register(prismaPlugin);
  }

  await registerHealthRoutes(app, { env: appEnv });
  await registerAuthRoutes(app, { env: appEnv });
  await registerClinicRoutes(app);
  await registerDashboardRoutes(app);
  await registerUserRoutes(app);
  await registerDoctorRoutes(app);
  await registerPatientRoutes(app);
  await registerAppointmentRoutes(app);
  await registerNotificationRoutes(app);
  await registerReminderRoutes(app);

  if (appEnv.NODE_ENV === "development" && options.usePrismaPlugin !== false && !options.prisma) {
    const worker = startReminderWorker(app.prisma, app.log);
    app.addHook("onClose", async () => {
      worker.stop();
    });
  }

  return app;
}
