# Reminder Worker Placeholder

Phase 1 creates the worker structure only.

Future worker responsibilities:

- Poll PostgreSQL for due reminders where `status = PENDING` and `scheduledFor <= now`.
- Claim due rows transactionally before processing.
- Use `idempotencyKey` to prevent duplicate notifications.
- Create durable in-app `Notification` records.
- Mark reminders `SENT` only after notification persistence succeeds.
- Record `FAILED`, `attemptCount`, `failedAt`, and `errorMessage` when processing fails.
- Reschedule or cancel reminders when appointments move or are cancelled.

Long-running `setTimeout` calls are intentionally avoided because they are lost on restarts and are unsafe when multiple API or worker instances run at the same time.
