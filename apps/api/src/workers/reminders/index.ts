export type ReminderWorkerState = "idle" | "polling" | "stopped";

export type ReminderWorkerOptions = {
  pollIntervalMs: number;
  batchSize: number;
};

export const defaultReminderWorkerOptions: ReminderWorkerOptions = {
  pollIntervalMs: 60_000,
  batchSize: 25
};
