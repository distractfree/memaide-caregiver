# MemAide / GuardiaNova Backend Handoff

## Project Summary
MemAide (GuardiaNova) is a senior care project backend designed to support wellness tracking, activity trends, and caregiver coordination. The backend provides a RESTful API for both a caregiver web portal (React/Tailwind) and a mobile patient application (Android/Wear OS).

**Product Positioning:**
- Provides wellness/activity trends and caregiver coordination.
- **Not** for medical diagnosis or medical monitoring.
- BLE distance calculation is approximate.
- WhatsApp call integration is opened separately on the mobile device, not controlled or replaced by this app.
- Stream status is currently metadata only (no real WebRTC/MJPEG transport implemented yet).

## Current Supported Features
The backend MVP currently supports:
- **Auth**: Caregiver registration, login, and session management.
- **Patients**: Patient CRUD operations.
- **Reminders**: Reminder CRUD and mobile device sync.
- **Reminder Events & Reports**: Ingestion of reminder status updates and report generation.
- **Help/Emergency**: Help contact configuration and help event ingestion.
- **Beacons**: BLE beacon configuration, event ingestion, and reports.
- **Vitals**: Vitals (heart rate, step count, motion) event ingestion and reports.
- **Streams**: Stream session status tracking (metadata only).

## Tech Stack
- **Node.js** & **TypeScript**
- **Express.js** for REST API
- **Prisma** for ORM
- **PostgreSQL** as the database (runs in Docker)
- **Zod** for schema validation
- **JWT** for authentication
- **Jest** & **Supertest** for automated testing

## Folder Structure Overview
```text
C:\MemAide\
├── docs/                # Documentation package
└── server/              # Backend service
    ├── prisma/          # Database schema and migrations
    │   ├── schema.prisma
    │   └── seed.ts      # Seed data script
    ├── src/             # Source code
    │   ├── config/      # Environment/app configuration
    │   ├── lib/         # Shared libraries
    │   ├── middleware/  # Express middlewares (auth, error handling)
    │   ├── modules/     # Feature modules (auth, patients, reminders, etc.)
    │   ├── routes/      # Global route aggregation
    │   ├── types/       # TypeScript type definitions
    │   ├── utils/       # Utility functions
    │   ├── app.ts       # Express app setup
    │   └── server.ts    # Server entry point
    ├── __tests__/       # Smoke tests and global test setup
    └── package.json     # Scripts and dependencies
```

## Security Model
- **Caregiver Auth:** Standard JWT bearer token mechanism for the caregiver web portal.
- **Ownership Enforcement:** Strict caregiver ownership enforcement on all patient data. Cross-caregiver access attempts return `404 Not Found`.
- **Mobile MVP Endpoints:** Mobile API endpoints are currently unprotected by JWT and use an exact `deviceId` lookup for simplicity in the MVP.

## Known Limitations / Future Work
- **Frontend Integration:** Full integration with the frontend web portal is pending.
- **Android/Wear OS Implementation:** Full implementation on the mobile side is pending.
- **BLE Scanning:** Actual BLE scanning and smoothing are simulated on the backend side/waiting for mobile implementation.
- **Streaming:** Real smart-glasses stream transport (WebRTC/MJPEG) is not yet implemented.
- **Mobile Security:** Production auth hardening is needed for mobile endpoints (currently relying on `deviceId`).
- **Deployment:** General deployment hardening and CI/CD pipelines are needed.

## Local Development Setup

### Environment Variables
Create a `.env` file in `C:\MemAide\server` with the following variables:
```env
PORT=4000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/memaide?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
```

### PostgreSQL / Docker Setup
Start the PostgreSQL container:
```bash
docker start memaide-postgres
# Or if not created yet: docker run --name memaide-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
```

### Prisma Migration Steps
Apply the latest schema changes to the database:
```bash
cd C:\MemAide\server
npx prisma migrate dev
```

### Seed Data Steps
Populate the database with initial demo data:
```bash
npm run prisma:seed
```

### Testing & Build Commands
Run the following commands in the `server` directory to ensure system stability:
```bash
# Run unit tests
npm test

# Build the TypeScript project
npm run build

# Validate Prisma schema
npx prisma validate

# Run end-to-end smoke tests
npm run smoke:test
```

### Starting the Server
Start the development server:
```bash
npm run dev
```

## Demo Credentials & Data

### Demo Login
- **Email:** `demo@memaide.local`
- **Password:** `Password123!`

### Demo Patients
- **Mary Johnson** (Device ID: `android-demo-001`)
- **Robert Lee** (Device ID: `android-demo-002`)
