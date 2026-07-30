# CLINIC

Arabic-first clinic appointment and reminder management system.

## Architecture

This repository is a pnpm monorepo:

- `apps/web`: Next.js App Router frontend with Arabic RTL UI.
- `apps/api`: Fastify API, Prisma schema, and future worker entry points.
- `packages/shared`: Browser-safe shared TypeScript types and Zod schemas.

All appointment and reminder timestamps are stored as UTC `DateTime` values. Display conversion will use each clinic timezone, defaulting to `Asia/Beirut`.

## Folder Structure

```text
CLINIC/
  apps/
    web/
    api/
  packages/
    shared/
  package.json
  pnpm-workspace.yaml
  .gitignore
  README.md
```

## Prerequisites

- Node.js 20 or newer
- pnpm 10
- PostgreSQL database, planned for Neon

## Installation

```powershell
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install
```

## Environment Setup

Copy the examples before running locally:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

API variables:

- `DATABASE_URL`: Neon pooled connection string for Prisma Client.
- `DIRECT_URL`: Neon direct connection string for migrations.
- `WEB_ORIGIN`: frontend origin, default `http://localhost:3000`.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: required later for auth.

Frontend variables:

- `NEXT_PUBLIC_API_URL`: default `http://localhost:4000/api/v1`.

Do not place database credentials in the frontend environment.

## Development Commands

```powershell
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

Run one app:

```powershell
pnpm --filter @clinic/web dev
pnpm --filter @clinic/api dev
```

Ports:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`

## Neon and Prisma

Create a Neon project later, then add `DATABASE_URL` and `DIRECT_URL` to `apps/api/.env`.

Phase 1 intentionally does not run a database migration without credentials and explicit approval. After credentials are configured, migrations should be created with:

```powershell
pnpm --filter @clinic/api prisma migrate dev
```

Never run `prisma migrate reset` against production or shared data.

## Reminder Architecture

Reminders are database-backed. The application will not use long-running JavaScript `setTimeout` calls for 24-hour reminders because process restarts, deployments, crashes, and multiple server instances would make those timers unreliable.

Future appointment creation will calculate `scheduledFor = appointment.startAt - 24 hours`, save a `Reminder` row, and let a dedicated worker periodically claim due rows. Claiming must be transactional and idempotent so multiple workers do not send duplicate notifications. A reminder is marked `SENT` only after the in-app `Notification` is persisted successfully. Cancelled or moved appointments will cancel or reschedule associated reminders.

See `apps/api/src/workers/reminders/README.md` for the worker placeholder.

## Phase Roadmap

- Phase 1: Foundation, frontend shell, API shell and schema.
- Phase 2: Authentication, clinic setup, users and roles.
- Phase 3: Doctors and patients CRUD.
- Phase 4: Appointment creation, calendar and conflict prevention.
- Phase 5: Reminder worker and in-app notifications.
- Phase 6: Reports, search, audit history and settings.
- Phase 7: WhatsApp/SMS/email integrations, deployment and production hardening.
