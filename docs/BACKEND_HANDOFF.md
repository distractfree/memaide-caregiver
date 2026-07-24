# MemAide / GuardiaNova Backend Handoff

## Project Summary
MemAide (GuardiaNova) is a senior care project backend designed to support wellness tracking, activity trends, and caregiver coordination. The backend provides a RESTful API for both a caregiver web portal (React/Tailwind) and a mobile patient application (Android/Wear OS).

**Product Positioning:**
- Provides wellness/activity trends and caregiver coordination.
- **Not** for medical diagnosis or medical monitoring.
- BLE distance calculation is approximate.
- WhatsApp call integration is opened separately on the mobile device, not controlled or replaced by this app.
- Egocentric streaming uses authenticated JPEG-frame polling in the embedded caregiver Stream Status viewer. It is not WebRTC, HLS, or MJPEG.

## Current Supported Features
The backend MVP currently supports:
- **Auth**: Caregiver registration, login, and session management.
- **Patients**: Patient CRUD operations.
- **Reminders**: Reminder CRUD and mobile device sync.
- **Reminder Events & Reports**: Ingestion of reminder status updates and report generation.
- **Help/Emergency**: Help contact configuration and help event ingestion.
- **Beacons**: BLE beacon configuration, event ingestion, and reports.
- **Vitals**: Vitals (heart rate, step count, motion) event ingestion and reports.
- **AI Sessions**: Authenticated mobile session start, Anthony registration, and the WebSocket hello contract.
- **Egocentric Streams**: Anthony frame callbacks, bounded latest-frame caching, stream-session lifecycle tracking, and the authenticated caregiver viewer.

## Tech Stack
- **Node.js** & **TypeScript**
- **Express.js** for REST API
- **Prisma** for ORM
- **PostgreSQL** as the database (runs in Docker)
- **Zod** for schema validation
- **JWT** for authentication
- **Vitest** & **Supertest** for automated testing

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
- **Mobile Endpoints:** Every `/api/mobile/*` route except `POST /api/mobile/patient-login` requires a bearer token, and accepts either a caregiver JWT or a patient JWT.
  - **Caregiver token:** unchanged. Device-based requests verify that the `deviceId` belongs to that authenticated caregiver; cross-caregiver attempts return `404 Not Found`. Caregiver tokens issued before this feature (no `typ` claim) are still accepted.
  - **Patient token:** issued by `POST /api/mobile/patient-login`, carries `typ: "patient"` and the patient id in `sub`. The patient is resolved from the verified token; a client-supplied `deviceId` is ignored for identity and can never select a different patient. Cross-patient access returns `404 Not Found`.
  - **`GET /api/mobile/patients` is caregiver-only** (`403 CAREGIVER_ONLY` for patient tokens), so the patient app never sees or selects a patient list. Patient tokens are also rejected on the caregiver portal API.
- **Patient Login Limitation:** Phone-number login is **demo/prototype authentication only** and is not suitable for real production patient data without SMS OTP, a PIN, or another factor. There is no rate limiting on the login route yet. See `docs/MOBILE_API_CONTRACT.md` → "Security limitations".
- **Anthony Callback:** `POST /api/ai-sessions/:sessionId/frames` accepts only `X-Api-Key: <AI_CALLBACK_API_KEY>`. It does not accept a caregiver JWT.
- **WebSocket Boundary:** The caregiver JWT must never be sent to `wss://ai.guardianova.com`. The WebSocket hello is only `{ "type": "hello", "session_id": "..." }`.

## Production Integration
- **Portal and API base URL:** `https://caregiver.guardianova.com`
- **AI session start:** The mobile app starts a session at `/api/mobile/ai-sessions/start` — a caregiver token posts its owned `deviceId`, a patient token posts no `deviceId`. The response returns the Anthony WebSocket URL and the minimal hello payload.
- **Frame path:** Arian glasses/phone → Anthony AI server → keyed frame callback → Koko latest-frame cache → authenticated caregiver Stream Status viewer.
- **Viewer:** The portal renders the latest JPEG in its embedded Stream Status frame viewer; it never connects directly to Anthony.

## Egocentric Frame Cache Limitation
- The latest JPEG frame is held only in the single backend process's memory.
- A backend restart clears the currently displayed image; Anthony's next accepted frame restores it.
- Run exactly one PM2 backend process for this MVP.
- PostgreSQL stores lightweight frame metadata only. It stores neither frame history nor JPEG/base64 image data.

## Known Limitations / Future Work
- **Android/Wear OS Verification:** Continue real-device validation of the documented JWT, `deviceId`, session-start, and stream-status contracts.
- **BLE Scanning:** Actual BLE scanning and smoothing are simulated on the backend side/waiting for mobile implementation.
- **Frame Continuity:** The MVP has no persistent frame history or multi-process frame cache; Anthony must send a new frame after a backend restart.
- **Deployment:** General deployment hardening and CI/CD pipelines are needed.

## Local Development Setup

### Environment Variables
Create a local `.env` file in `C:\MemAide_github\server` using the repository's environment example and locally managed credentials. Do not commit or document real secrets.
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

## Demo Data

Use the local seed process only in an approved development database. Keep real credentials, JWTs, callback keys, and patient data out of handoff documents.

### Example Patients
- **Mary Johnson** (Device ID: `android-demo-001`)
- **Robert Lee** (Device ID: `android-demo-002`)
