# MemAide / GuardiaNova — Task Progress

## Task 1 — Backend Foundation ✅ COMPLETE

### Implemented

- [x] Node.js + Express + TypeScript project scaffold
- [x] `tsconfig.json` targeting ES2020/CommonJS
- [x] `package.json` with all required dependencies and scripts
- [x] Environment config (`src/config/env.ts`) validated with Zod
- [x] `.env.example` with all required variables documented
- [x] Express app with Helmet, CORS, Morgan, JSON body parsing
- [x] `GET /api/health` endpoint returns `status: ok` + timestamp
- [x] Centralized error middleware (handles `AppError`, `ZodError`, and unknown errors)
- [x] Centralized 404 middleware
- [x] `asyncHandler` utility for clean async route handlers
- [x] Shared TypeScript types (`ApiResponse`, `PaginatedResponse`, `ApiError`)
- [x] Prisma schema with PostgreSQL provider
- [x] `Caregiver` model (id, name, email, passwordHash, timestamps)
- [x] `Patient` model (id, caregiverId FK, name, phoneNumber?, deviceId?, timestamps)
- [x] `server/README.md` with full setup instructions

### Intentionally Not Implemented in Task 1

- Auth (register / login / JWT middleware) — Task 2
- Patient CRUD API routes — Task 2
- Reminders — Task 3
- Reminder events / reports — Task 4
- Help contacts / help events — Task 5
- Beacons / beacon events — Task 6
- Vitals events / reports — Task 7
- Stream session APIs — Task 8
- Swagger / OpenAPI docs — Task 2+
- Seed data — Task 2
- React portal — separate track

---

## Task 2 — Database Migration + Auth Foundation ✅ COMPLETE

### Implemented

- [x] `bcryptjs` + `@types/bcryptjs` added to dependencies
- [x] `JWT_EXPIRES_IN` added to env config and `.env.example`
- [x] Prisma client singleton (`src/lib/prisma.ts`) — prevents duplicate instances on hot reload
- [x] Express `Request` type augmented with `caregiverId` (`src/types/express.d.ts`)
- [x] Zod schemas for register + login with email normalization (`src/modules/auth/auth.schemas.ts`)
- [x] Auth service: `registerCaregiver`, `loginCaregiver`, `getCaregiverById` (`src/modules/auth/auth.service.ts`)
- [x] Auth middleware: Bearer JWT verification, attaches `req.caregiverId` (`src/middleware/auth.middleware.ts`)
- [x] Auth controller + routes mounted at `/api/auth` (`src/modules/auth/auth.routes.ts`)
- [x] `postinstall` auto-generates Prisma client on `npm install`
- [x] Vitest + Supertest: 11 tests, all passing (`src/__tests__/auth.test.ts`)
- [x] Password hash never returned in any API response

### Intentionally Not Implemented in Task 2

- Patient CRUD API routes — Task 3
- Swagger/OpenAPI — Task 3
- Seed data — Task 3
- Reminders, events, beacons, vitals, help, streams — later tasks

---

## Recommended Next Task: Task 3 — Patient CRUD + Seed Data + Swagger

### Task 2 Goals

1. Run Prisma migration to create `caregivers` and `patients` tables in PostgreSQL.
2. Add `bcryptjs` + `jsonwebtoken` to implement `POST /api/auth/register` and `POST /api/auth/login`.
3. Create `auth.middleware.ts` to protect routes with JWT.
4. Implement `GET /api/patients`, `POST /api/patients`, `GET /api/patients/:id`, `PUT /api/patients/:id`, `DELETE /api/patients/:id`.
5. Enforce caregiver ownership — a caregiver can only see/edit their own patients.
6. Add Swagger/OpenAPI scaffold.
7. Add seed script for demo data.

### Task 2 Acceptance Criteria

- `POST /api/auth/register` creates a caregiver with hashed password, returns JWT.
- `POST /api/auth/login` validates credentials, returns JWT.
- `GET /api/auth/me` returns current caregiver (protected route).
- All `/api/patients` routes require valid JWT.
- Caregiver cannot access another caregiver's patients.
- Prisma migration runs cleanly.
- Seed data creates 1 caregiver and 2 demo patients.

---

## Future Tasks (Brief)

| Task | Focus |
|------|-------|
| Task 3 | Reminder model + CRUD + mobile sync endpoint |
| Task 4 | Reminder event ingestion + acknowledgment report |
| Task 5 | Help contact + help event ingestion |
| Task 6 | Beacon config + beacon event ingestion |
| Task 7 | Vitals event ingestion + reports |
| Task 8 | Stream session APIs + optional SSE |
| Task 9 | Full integration testing + hardening |
| Task 10 | Deployment + final docs |
