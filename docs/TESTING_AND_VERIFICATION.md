# Testing and Verification Guide

This document captures the necessary commands and steps to verify the MemAide backend locally. Use these steps before submitting code or deploying.

## Verification Commands

Run these commands inside the `C:\MemAide\server` directory.

### 1. Prisma Validation
Ensure your Prisma schema is syntactically valid and the types can be generated.
```bash
npx prisma validate
```

### 2. TypeScript Build
Verify there are no TypeScript compilation errors.
```bash
npm run build
```

### 3. Unit Tests
Run the Jest test suite to execute unit and integration tests for services and controllers.
```bash
npm test
```

### 4. End-to-End Smoke Test
The smoke test programmatically registers a caregiver, creates patients, creates reminders/beacons, and then simulates the mobile device calling the `/api/mobile/*` endpoints to upload telemetry. Finally, it checks the dashboard report endpoints to ensure the data was processed correctly.

Before running the smoke test, ensure the database is reset and seeded, and the development server is running in another terminal.
```bash
npm run smoke:test
```

## Database Management

### Start PostgreSQL Docker Container
If your local database is not running:
```bash
docker start memaide-postgres
```

### Run Migrations
Apply any pending schema changes:
```bash
npx prisma migrate dev
```

### Seed Data
Reset the database and insert the initial demo caregiver and patients:
```bash
npm run prisma:seed
```

## Common Troubleshooting

- **PostgreSQL Connection Refused:**
  Ensure the Docker container `memaide-postgres` is actually running. Check with `docker ps`. Verify it is bound to localhost port 5432.

- **Prisma Engine DLL Locked (Windows):**
  If `npx prisma migrate dev` fails because a file is in use, stop the running `npm run dev` Node process before attempting to migrate or generate the Prisma client.

- **Port 4000 Already in Use:**
  Ensure you don't have multiple instances of the backend running.

- **Test Failures (Database Constraints):**
  If `npm test` or `npm run smoke:test` fails due to unique constraint violations (e.g., email already exists), the test suite might not be properly cleaning up the database, or you ran tests against the seeded database without it dropping data. The `smoke:test` usually handles creating unique dynamic emails, but keep your test environment isolated if possible.
