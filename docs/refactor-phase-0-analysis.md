# KaguWeb Refactor Phase 0 Analysis

## Scope

- This work follows the roadmap brief and preserves the existing product core.
- Route structure, API paths, auth/session flow, role behavior, and Prisma domain backbone stay intact.
- Current uncommitted frontend styling and dashboard UI changes are treated as user-owned work and are out of scope for the first backend hardening slice.

## Current critical flow map

### Auth and session

- Web login and refresh flow lives in `apps/web/components/auth-provider.tsx`.
- API auth endpoints live in `apps/api/src/auth/auth.controller.ts`.
- JWT bootstrapping lives in `apps/api/src/auth/auth.module.ts` and `apps/api/src/auth/jwt.strategy.ts`.

### Manager flows

- Dashboard route shell: `apps/web/app/(workspace)/dashboard`.
- Users flow: `apps/web/components/manager-users-module.tsx` + `apps/api/src/users`.
- Projects flow: `apps/web/components/manager-projects-module.tsx` + `apps/api/src/projects`.
- Daily program flow: `apps/web/components/manager-program-module.tsx` + `apps/api/src/programs`.
- Tracking and notifications: `apps/web/components/manager-tracking-module.tsx` + `apps/api/src/tracking` and `apps/api/src/notifications`.

### Field flows

- Field workspace lives in `apps/web/components/field-workspace.tsx`.
- Field read models live in `apps/api/src/me`.
- Critical field mutations hit `apps/api/src/programs/programs.controller.ts`:
  - `POST /assignments/:id/work-start`
  - `POST /assignments/:id/work-end`
  - `POST /program-projects/:id/entries`
  - `POST /assignments/:id/location-pings`

## Mutation surface inventory

### Auth

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `PATCH /auth/password`

### Manager-owned mutations

- Users: create, update, delete
- Customers: create
- Projects: create, update, delete
- Project files: upload, delete
- Daily programs: create, note update, reorder
- Program projects: add, remove
- Assignments: set/change
- Notifications: subscription register/unregister, manual campaign, daily reminder

### Field-owned mutations

- Work start
- Work end
- Entry create with optional files
- Location ping ingest
- Password change

## Storage access points

- Shared low-level storage helpers live in `apps/api/src/common/utils/storage.ts`.
- Project and system audit/event writes live in `apps/api/src/storage/storage.service.ts`.
- File upload/download logic lives in `apps/api/src/projects/projects.service.ts`.
- Preview/download contract already depends on stored metadata paths and must remain backward compatible.

## Environment inventory

### Present in root `.env`

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `WEB_ORIGIN`
- `STORAGE_ROOT`
- `NEXT_PUBLIC_API_URL`
- `NEXT_SERVER_API_PROXY_URL`
- `VAPID_SUBJECT`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

### Drift found

- `.env.example` is missing the VAPID keys that exist in `.env`.
- API bootstrap currently reads some secrets directly from `process.env` before `ConfigModule` has loaded `.env`.

## Current tests and gaps

### Existing coverage

- Bootstrap admin CLI
- Dashboard service
- Projects service
- Programs service
- File policy helper

### Major gaps against roadmap

- No auth login/refresh/logout/password flow coverage
- No notification flow tests
- No tracking flow tests
- No health/readiness tests
- No API contract-oriented or e2e coverage for critical manager/field flows
- No offline queue or retry/idempotency tests

## Initial risk list

1. JWT secret bootstrapping can silently fall back to the default secret before `.env` loading.
2. There is no dedicated `health` or `readiness` endpoint for operational diagnostics.
3. Environment validation is missing, so config drift is only detected at runtime failure points.
4. Push notification config is optional in code but not documented consistently in `.env.example`.
5. Critical field actions are still fully network-bound on the web client.
6. There is no request correlation or structured logging baseline yet.
7. Auth and upload throttling are not in place yet.

## First implementation slice

The first low-risk, high-value hardening slice is:

1. Add API environment validation.
2. Fix auth bootstrap so JWT config is loaded from validated config, not an implicit default.
3. Add `GET /api/health` and `GET /api/readiness`.
4. Add focused tests for env validation and readiness behavior.

## Expected file touch area for the first slice

- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/jwt.strategy.ts`
- new config helper under `apps/api/src/common/config`
- new health module under `apps/api/src/health`
- `apps/api/test/*`
- `.env.example`
