import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { processDueReminders, reconcileDueAppointmentReminders } from "../../modules/reminders/reminder.service.js";

export function startReminderWorker(prisma: PrismaClient, logger: FastifyBaseLogger, intervalMs = 30_000) {
  let isRunning = false;
  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await reconcileDueAppointmentReminders(prisma, logger);
      await processDueReminders(prisma, logger);
    } catch (error) {
      logger.error({ err: error }, "reminder worker tick failed");
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();

  return {
    stop() {
      clearInterval(timer);
    }
  };
}
