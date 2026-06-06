Email: demo@memaide.local
Password: Password123!


# MemAide / GuardiaNova — Student 2 Professional Roadmap Plan

**Project title:** MemAide: A Multi-Device Caregiver Assistance Platform for Independent Living  
**Student role:** Student 2 — Backend + Database + API + Dashboard Data Lead  
**Primary goal:** Build the backend, database, REST API layer, reporting endpoints, authentication, deployment foundation, and the data layer that powers the caregiver web portal.

---

## 1. Project Summary

MemAide / GuardiaNova is a 3-month MVP assistive caregiving platform for independent living. The system helps a caregiver:

- Configure medication/reminder schedules.
- Monitor reminder acknowledgments.
- View passive wellness/activity signals.
- Configure BLE room beacons.
- View beacon proximity events.
- Set a WhatsApp help contact.
- Track help events from phone/watch.
- View optional patient-perspective stream status when smart glasses are available.

The project uses several connected devices:

1. **Caregiver Web Portal**
   - React dashboard used by caregivers.
   - Manages patients, reminders, beacon configuration, reports, and help/stream status.

2. **Cloud Backend API**
   - Central REST API and data store.
   - Handles authentication, patients, reminders, events, reports, beacons, vitals, help events, and stream sessions.

3. **Patient Android App**
   - Receives reminder schedules.
   - Plays audible reminders.
   - Allows acknowledgment.
   - Opens WhatsApp help contact.
   - Detects BLE beacons.
   - Uploads events to the backend.

4. **Wear OS Watch App**
   - Displays reminders.
   - Allows acknowledgment.
   - Sends help requests to Android phone.
   - Collects basic heart rate/activity/motion data.

5. **Smart Glasses / Egocentric Stream**
   - Optional MVP-lite feature.
   - If available, patient-side stream starts during a help session.
   - The caregiver portal shows stream status or unavailable status.

---

## 2. Product Positioning

This MVP must be described carefully.

### Correct positioning

Use wording like:

- Wellness trends
- Activity trends
- Reminder assistance
- Safety awareness
- Caregiver coordination
- Passive context
- Independent living support

### Avoid wording like:

- Medical monitoring
- Diagnosis
- Emergency medical system
- Certified fall detection
- HIPAA-grade production platform
- Medical-grade vitals interpretation

The system should be presented as a student MVP for wellness/activity awareness and caregiver coordination, not as a medical device.

---

## 3. Recommended Team Split

The PDF contains two related splits:

- In one place, Student 2 is described as Backend/Web Portal Lead.
- In the detailed work breakdown, Student 2 is Backend + Database Lead, while Student 3 owns Web Portal + Stream/Glasses.

To avoid confusion, use this clean team split:

### Student 1 — Android + Wear OS Lead

Owns:

- Android patient app.
- Wear OS watch app.
- Reminder alerts on device.
- Reminder acknowledgment from phone/watch.
- BLE beacon scanner.
- WhatsApp help intent.
- Watch-to-phone communication.
- Vitals/activity collection.
- Uploading mobile events to Student 2 backend APIs.

### Student 2 — Backend + Database + API + Dashboard Data Lead

Owns:

- REST API.
- PostgreSQL schema.
- Authentication.
- Reminder data model.
- Report endpoints.
- Beacon/vitals/help event ingestion.
- Stream session status APIs.
- API documentation.
- Test/demo data.
- Cloud deployment.
- Dashboard backend integration.
- Optional: core caregiver dashboard pages if Student 3 focuses on streaming/glasses.

### Student 3 — Web Portal + Stream/Glasses Lead

Owns:

- Caregiver portal UI if team keeps original detailed split.
- Dashboard charts and UI polish.
- Smart glasses abstraction.
- Egocentric streaming MVP.
- Stream viewer.
- Stream status module.
- End-to-end demo integration.

### Recommended practical split for a 3-person team

Because Student 3 has the difficult glasses/streaming part, Student 2 should own the **backend plus the dashboard data layer**, and may also build the first version of the caregiver web portal. Student 3 can then plug in the stream viewer/status UI later.

---

## 4. Recommended Tech Stack

### Backend

Recommended:

- **Node.js**
- **Express**
- **TypeScript**
- **PostgreSQL**
- **Prisma ORM**
- **JWT authentication**
- **bcrypt password hashing**
- **Swagger/OpenAPI documentation**
- **SSE for live dashboard updates**
- Optional WebSocket later if needed

Alternative backend:

- Python FastAPI
- PostgreSQL
- SQLAlchemy
- Pydantic
- JWT auth

### Web Portal

Recommended:

- **React**
- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **React Router**
- **TanStack Query or Axios**
- **Recharts for charts/dashboard**
- Optional Zustand for lightweight state

### Mobile / Watch

Student 1 side:

- Kotlin Android
- Wear OS APIs
- BLE scanning
- Wear OS Data Layer
- Health Services / Health Connect

### Streaming

Student 3 side:

- WebRTC if time allows.
- MJPEG/WebSocket fallback for simpler MVP delivery.
- Backend should support stream session status regardless of real streaming implementation.

---

## 5. High-Level Architecture

```text
Caregiver Web Portal
React / Tailwind / Dashboard / Reports
        |
        | HTTPS REST / optional SSE
        v
Cloud Backend API
Node.js/Express or FastAPI + PostgreSQL
Auth, Patients, Reminders, Reports, Beacons, Vitals, Help Events, Stream Sessions
        |
        | HTTPS REST
        v
Android Patient App
Reminders, Help, BLE, WhatsApp, Mobile Sync
        |
        | Wear OS Data Layer
        v
Wear OS Watch App
Reminder Alerts, Help Button, HR, Motion, ACK
        |
        | BLE proximity handled by Android phone
        v
BLE Beacons
Room UUIDs
```

Important architecture decision:

- Use the **phone** as the main geofencing/BLE/context engine.
- Use the **watch** for reminders, acknowledgment, help button, heart rate/activity/motion.
- Use **cloud backend** as source of truth for dashboard reports.
- Use **smart glasses stream** as optional help-session enhancement, not as a dependency for the whole MVP.

---

## 6. Student 2 Main Responsibilities

Student 2 is responsible for building the platform foundation.

### Core responsibilities

- Backend REST API.
- PostgreSQL database schema.
- Authentication and authorization.
- Patient model.
- Reminder model.
- Reminder event model.
- Report endpoints.
- Beacon configuration endpoints.
- Beacon event ingestion.
- Vitals event ingestion.
- Help contact endpoints.
- Help event ingestion.
- Stream session status endpoints.
- API documentation.
- Demo/test data.
- Backend deployment.
- Database deployment.
- Integration support for Android, Watch, and Web Portal.

### Student 2 final deliverables

- Cloud backend.
- API documentation.
- Database schema.
- Test/demo data.
- Auth system.
- Report endpoints.
- Deployed API.
- Working dashboard data integration.
- Final demo backend support.

---

## 7. MVP Feature Priorities

Build the MVP in this order:

1. Authentication + patient management.
2. Reminder CRUD.
3. Reminder event ingestion.
4. Reminder acknowledgment report.
5. WhatsApp help contact.
6. Help event ingestion.
7. Beacon configuration.
8. Beacon event ingestion.
9. Vitals event ingestion.
10. Vitals/activity reports.
11. Stream session status.
12. Optional SSE live updates.
13. Deployment and final documentation.

Do not start with the hardest features. The strongest MVP is built from the reminder/report flow first.

---

## 8. Database Schema Plan

Use PostgreSQL. Use UUID primary keys. Use `created_at` and `updated_at` where useful.

### 8.1 caregivers

Stores caregiver accounts.

```sql
caregivers
- id UUID PRIMARY KEY
- name TEXT NOT NULL
- email TEXT UNIQUE NOT NULL
- password_hash TEXT NOT NULL
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()
```

### 8.2 patients

Stores patients assigned to caregivers.

```sql
patients
- id UUID PRIMARY KEY
- caregiver_id UUID REFERENCES caregivers(id)
- name TEXT NOT NULL
- phone_number TEXT
- device_id TEXT UNIQUE
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()
```

### 8.3 reminders

Stores reminder definitions.

```sql
reminders
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- type TEXT NOT NULL
- description TEXT NOT NULL
- time_of_day TIME NOT NULL
- frequency TEXT NOT NULL
- active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()
```

Recommended `frequency` values:

- daily
- weekdays
- weekly
- custom

Recommended `type` values:

- medication
- hydration
- appointment
- activity
- custom

### 8.4 reminder_events

Stores actual reminder delivery and acknowledgment events.

```sql
reminder_events
- id UUID PRIMARY KEY
- reminder_id UUID REFERENCES reminders(id)
- patient_id UUID REFERENCES patients(id)
- scheduled_at TIMESTAMP NOT NULL
- delivered_at TIMESTAMP
- acknowledged_at TIMESTAMP
- status TEXT NOT NULL
- source_device TEXT
- created_at TIMESTAMP DEFAULT NOW()
```

Recommended `status` values:

- scheduled
- delivered
- acknowledged
- missed
- skipped
- failed

Recommended `source_device` values:

- android
- watch
- backend
- demo

### 8.5 help_contacts

Stores WhatsApp contact for a patient.

```sql
help_contacts
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- whatsapp_number TEXT NOT NULL
- label TEXT
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()
```

Validation:

- Use E.164 format when possible.
- Example: `+18185551234`.

### 8.6 beacons

Stores configured BLE beacons.

```sql
beacons
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- room_name TEXT NOT NULL
- beacon_uuid TEXT NOT NULL
- major INTEGER
- minor INTEGER
- threshold_distance_m NUMERIC DEFAULT 3.0
- dwell_seconds INTEGER DEFAULT 5
- active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()
```

### 8.7 beacon_events

Stores beacon proximity events.

```sql
beacon_events
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- beacon_id UUID REFERENCES beacons(id)
- room_name TEXT NOT NULL
- detected_at TIMESTAMP NOT NULL
- exited_at TIMESTAMP
- dwell_seconds INTEGER
- estimated_distance_m NUMERIC
- created_at TIMESTAMP DEFAULT NOW()
```

MVP wording:

- Say “near Kitchen beacon.”
- Avoid exact location claims.

### 8.8 vital_events

Stores wearable wellness/activity samples.

```sql
vital_events
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- timestamp TIMESTAMP NOT NULL
- heart_rate INTEGER
- motion_state TEXT
- step_count INTEGER
- source_device TEXT
- created_at TIMESTAMP DEFAULT NOW()
```

Recommended `motion_state` values:

- idle
- walking
- active
- unknown

### 8.9 help_events

Stores help button events.

```sql
help_events
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- triggered_at TIMESTAMP NOT NULL
- source_device TEXT NOT NULL
- whatsapp_number TEXT
- stream_session_id UUID REFERENCES stream_sessions(id)
- status TEXT NOT NULL
- created_at TIMESTAMP DEFAULT NOW()
```

Recommended `status` values:

- created
- whatsapp_opened
- stream_active
- stream_unavailable
- resolved
- failed

### 8.10 stream_sessions

Stores optional smart glasses / egocentric stream sessions.

```sql
stream_sessions
- id UUID PRIMARY KEY
- patient_id UUID REFERENCES patients(id)
- started_at TIMESTAMP
- ended_at TIMESTAMP
- source TEXT
- status TEXT NOT NULL
- stream_url TEXT
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()
```

Recommended `status` values:

- unavailable
- starting
- active
- ended
- failed

Recommended `source` values:

- meta_rayban
- android_camera
- mock
- unavailable

---

## 9. Backend Module Structure

Recommended backend folder structure:

```text
backend/
  src/
    app.ts
    server.ts

    config/
      env.ts
      database.ts

    middleware/
      auth.middleware.ts
      error.middleware.ts
      validate.middleware.ts

    modules/
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.schemas.ts

      caregivers/
        caregivers.model.ts

      patients/
        patients.routes.ts
        patients.controller.ts
        patients.service.ts
        patients.schemas.ts

      reminders/
        reminders.routes.ts
        reminders.controller.ts
        reminders.service.ts
        reminders.schemas.ts

      reminder-events/
        reminder-events.routes.ts
        reminder-events.controller.ts
        reminder-events.service.ts
        reminder-events.schemas.ts

      help/
        help.routes.ts
        help.controller.ts
        help.service.ts
        help.schemas.ts

      beacons/
        beacons.routes.ts
        beacons.controller.ts
        beacons.service.ts
        beacons.schemas.ts

      vitals/
        vitals.routes.ts
        vitals.controller.ts
        vitals.service.ts
        vitals.schemas.ts

      streams/
        streams.routes.ts
        streams.controller.ts
        streams.service.ts
        streams.schemas.ts

      reports/
        reports.routes.ts
        reports.controller.ts
        reports.service.ts

      mobile/
        mobile.routes.ts
        mobile.controller.ts
        mobile.service.ts

    utils/
      jwt.ts
      password.ts
      dates.ts
      phone.ts

    docs/
      swagger.ts

  prisma/
    schema.prisma
    migrations/
    seed.ts

  tests/
    auth.test.ts
    patients.test.ts
    reminders.test.ts
    reports.test.ts
    mobile-events.test.ts

  .env.example
  package.json
  README.md
```

---

## 10. REST API Contract

### 10.1 Auth APIs

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

#### POST /api/auth/register

Request:

```json
{
  "name": "Caregiver One",
  "email": "caregiver@example.com",
  "password": "StrongPassword123!"
}
```

Response:

```json
{
  "caregiver": {
    "id": "uuid",
    "name": "Caregiver One",
    "email": "caregiver@example.com"
  },
  "token": "jwt-token"
}
```

#### POST /api/auth/login

Request:

```json
{
  "email": "caregiver@example.com",
  "password": "StrongPassword123!"
}
```

Response:

```json
{
  "caregiver": {
    "id": "uuid",
    "name": "Caregiver One",
    "email": "caregiver@example.com"
  },
  "token": "jwt-token"
}
```

### 10.2 Patient APIs

```http
GET    /api/patients
POST   /api/patients
GET    /api/patients/:id
PUT    /api/patients/:id
DELETE /api/patients/:id
```

#### POST /api/patients

Request:

```json
{
  "name": "Patient One",
  "phoneNumber": "+18185551234",
  "deviceId": "android-device-001"
}
```

### 10.3 Reminder APIs

```http
GET    /api/patients/:id/reminders
POST   /api/patients/:id/reminders
PUT    /api/reminders/:id
DELETE /api/reminders/:id
```

#### POST /api/patients/:id/reminders

Request:

```json
{
  "type": "medication",
  "description": "Take blood pressure pill",
  "timeOfDay": "08:00",
  "frequency": "daily",
  "active": true
}
```

### 10.4 Reminder Event APIs

```http
POST /api/mobile/reminder-events
GET  /api/patients/:id/reminder-events
GET  /api/patients/:id/reports/reminders
```

#### POST /api/mobile/reminder-events

Request:

```json
{
  "patientId": "uuid",
  "reminderId": "uuid",
  "scheduledAt": "2026-05-17T08:00:00Z",
  "deliveredAt": "2026-05-17T08:00:10Z",
  "acknowledgedAt": "2026-05-17T08:03:30Z",
  "status": "acknowledged",
  "sourceDevice": "watch"
}
```

#### GET /api/patients/:id/reports/reminders

Query params:

```text
startDate=2026-05-01
endDate=2026-05-31
```

Response:

```json
{
  "summary": {
    "total": 30,
    "acknowledged": 26,
    "missed": 3,
    "pending": 1,
    "averageTimeToAckSeconds": 150
  },
  "events": []
}
```

### 10.5 Help Contact + Help Event APIs

```http
POST /api/patients/:id/help-contact
GET  /api/patients/:id/help-contact
POST /api/mobile/help-events
GET  /api/patients/:id/help-events
```

#### POST /api/patients/:id/help-contact

Request:

```json
{
  "whatsappNumber": "+18185551234",
  "label": "Primary caregiver"
}
```

#### POST /api/mobile/help-events

Request:

```json
{
  "patientId": "uuid",
  "triggeredAt": "2026-05-17T14:05:00Z",
  "sourceDevice": "watch",
  "whatsappNumber": "+18185551234",
  "status": "whatsapp_opened"
}
```

### 10.6 Beacon APIs

```http
GET    /api/patients/:id/beacons
POST   /api/patients/:id/beacons
PUT    /api/beacons/:id
DELETE /api/beacons/:id
POST   /api/mobile/beacon-events
GET    /api/patients/:id/beacon-events
```

#### POST /api/patients/:id/beacons

Request:

```json
{
  "roomName": "Kitchen",
  "beaconUuid": "fda50693-a4e2-4fb1-afcf-c6eb07647825",
  "major": 100,
  "minor": 1,
  "thresholdDistanceM": 3,
  "dwellSeconds": 5,
  "active": true
}
```

#### POST /api/mobile/beacon-events

Request:

```json
{
  "patientId": "uuid",
  "beaconId": "uuid",
  "roomName": "Kitchen",
  "detectedAt": "2026-05-17T14:00:00Z",
  "exitedAt": "2026-05-17T14:04:00Z",
  "dwellSeconds": 240,
  "estimatedDistanceM": 2.4
}
```

### 10.7 Vitals APIs

```http
POST /api/mobile/vital-events
GET  /api/patients/:id/vitals
GET  /api/patients/:id/reports/vitals
```

#### POST /api/mobile/vital-events

Request:

```json
{
  "patientId": "uuid",
  "timestamp": "2026-05-17T14:05:00Z",
  "heartRate": 82,
  "motionState": "walking",
  "stepCount": 3400,
  "sourceDevice": "watch"
}
```

### 10.8 Stream Session APIs

```http
POST /api/mobile/stream/start
POST /api/mobile/stream/stop
GET  /api/patients/:id/stream-sessions
GET  /api/stream-sessions/:id
```

#### POST /api/mobile/stream/start

Request:

```json
{
  "patientId": "uuid",
  "source": "meta_rayban",
  "status": "active",
  "streamUrl": "https://example.com/stream/session-id"
}
```

#### POST /api/mobile/stream/stop

Request:

```json
{
  "streamSessionId": "uuid",
  "endedAt": "2026-05-17T14:20:00Z",
  "status": "ended"
}
```

---

## 11. Caregiver Web Portal Plan

Even if Student 3 owns the final portal UI, Student 2 should design the dashboard data structure and build a basic working portal shell. The web portal should use:

- React
- TypeScript
- Tailwind CSS
- Recharts
- REST API integration
- Optional SSE live updates later

### 11.1 Pages / Screens

#### 1. Login Page

Purpose:

- Caregiver login.
- Save JWT.
- Redirect to dashboard.

Fields:

- Email
- Password

#### 2. Patient Dashboard

Purpose:

- Main overview page.

Cards:

- Today’s reminders.
- Acknowledged reminders.
- Missed reminders.
- Last known beacon/room.
- Latest heart rate.
- Latest motion state.
- Latest help event.
- Stream status.

#### 3. Patient Management

Purpose:

- Create/manage patient profile.

Fields:

- Name
- Phone number
- Device ID

#### 4. Reminder Management

Purpose:

- Create/edit/delete reminders.

Fields:

- Type
- Description
- Time of day
- Frequency
- Active/inactive

#### 5. Reminder Acknowledgment Report

Purpose:

- Show caregiver whether reminders were acknowledged.

Display:

- Delivered count.
- Acknowledged count.
- Missed count.
- Average time-to-acknowledge.
- Source device: phone/watch.
- Table of events.
- Date range filter.

Charts:

- Delivered vs acknowledged vs missed.
- Acknowledgments over time.

#### 6. WhatsApp Help Contact

Purpose:

- Caregiver sets emergency/help contact.

Fields:

- WhatsApp number.
- Label.

Validation:

- E.164 format preferred.

#### 7. Beacon Configuration

Purpose:

- Configure room beacons.

Fields:

- Room name.
- Beacon UUID.
- Major/minor.
- Threshold distance.
- Dwell seconds.
- Active/inactive.

#### 8. Beacon Event Log

Purpose:

- Show room proximity events.

Display:

- Room.
- Detected time.
- Exited time.
- Dwell seconds.
- Estimated distance.
- Event status.

#### 9. Vitals / Activity Report

Purpose:

- Show wellness/activity trends.

Display:

- Heart rate over time.
- Steps over time.
- Motion state timeline.
- Daily summary.

Important:

- Use “wellness/activity trends.”
- Do not describe as medical diagnosis.

#### 10. Help Session / Stream Status

Purpose:

- Show latest help events and optional stream.

Display:

- Latest help event.
- Source device.
- WhatsApp number.
- Stream status.
- Button/link to stream if available.
- “No glasses stream available” if unavailable.

---

## 12. Dashboard UI Components

Recommended reusable components:

```text
components/
  AppShell.tsx
  Sidebar.tsx
  Topbar.tsx
  ProtectedRoute.tsx
  StatCard.tsx
  StatusBadge.tsx
  DateRangePicker.tsx
  LoadingState.tsx
  EmptyState.tsx
  ErrorState.tsx
  ConfirmDialog.tsx
  DataTable.tsx
  ChartCard.tsx
  PatientSelector.tsx
  ReminderForm.tsx
  BeaconForm.tsx
  HelpContactForm.tsx
```

Recommended visual style:

- Professional healthcare-adjacent UI.
- Clean white/neutral background.
- Soft cards.
- Clear readable typography.
- Green/blue accent, not too bright.
- Avoid “AI-looking” gradients everywhere.
- Make data easy to read for caregivers.

---

## 13. 12-Week Student 2 Roadmap

## Weeks 1–2 — Foundation

### Goals

- Create backend foundation.
- Create database schema.
- Define API contracts.
- Create basic dashboard shell.
- Make sure every teammate knows the API structure.

### Student 2 tasks

- Create backend project.
- Add TypeScript/Express setup.
- Add PostgreSQL connection.
- Add Prisma schema.
- Add auth system.
- Add caregiver model.
- Add patient model.
- Add JWT middleware.
- Add Swagger/OpenAPI setup.
- Add seed data.
- Add health check endpoint.
- Create `.env.example`.
- Draft API documentation.

### Deliverables

- Backend app runs locally.
- Database connects successfully.
- Caregiver can register/login.
- Patient CRUD works.
- API docs started.
- Demo seed data works.

### End-of-phase demo

```text
Caregiver registers/logs in → creates patient → protected API returns patient data.
```

---

## Weeks 3–4 — Reminder System

### Goals

- Implement reminder creation.
- Implement mobile reminder sync.
- Implement reminder acknowledgment event upload.
- Implement basic report.

### Student 2 tasks

- Add reminders table/model.
- Add reminder CRUD APIs.
- Add `GET /api/mobile/reminders`.
- Add reminder event ingestion.
- Add reminder report endpoint.
- Add dashboard reminder page.
- Add report table and basic chart.
- Add seed data for acknowledged/missed reminders.
- Coordinate with Student 1 for reminder payload shape.

### Deliverables

- Reminder CRUD working.
- Android can fetch reminders.
- Android/watch can upload acknowledgment.
- Dashboard shows reminder report.

### End-of-phase demo

```text
Caregiver creates medication reminder → mobile fetches reminder → acknowledgment uploaded → dashboard report updates.
```

---

## Weeks 5–6 — Help Button + WhatsApp Backend

### Goals

- Implement help contact setup.
- Implement help event logging.
- Support phone/watch help button flow.
- Prepare stream session placeholder.

### Student 2 tasks

- Add help_contacts table/model.
- Add help contact APIs.
- Add E.164 phone validation.
- Add help_events table/model.
- Add mobile help event endpoint.
- Add help event dashboard timeline.
- Add stream session placeholder fields.
- Coordinate with Student 1 for WhatsApp intent flow.
- Coordinate with Student 3 for stream session status.

### Deliverables

- Caregiver can set WhatsApp number.
- Android can sync/use help number.
- Phone/watch help event can be uploaded.
- Dashboard shows help event.

### End-of-phase demo

```text
Caregiver sets WhatsApp number → patient presses Help → Android opens WhatsApp → backend logs help event → dashboard shows event.
```

---

## Weeks 7–8 — Beacons + Wearable Vitals

### Goals

- Implement beacon configuration.
- Implement beacon event ingestion.
- Implement vitals event ingestion.
- Implement reports by time of day.

### Student 2 tasks

- Add beacons table/model.
- Add beacon CRUD APIs.
- Add beacon event ingestion endpoint.
- Add beacon event report endpoint.
- Add vital_events table/model.
- Add vitals ingestion endpoint.
- Add vitals report endpoint.
- Add dashboard charts:
  - Heart rate over time.
  - Steps over time.
  - Motion state summary.
  - Beacon timeline.
- Coordinate with Student 1 on BLE and Wear OS payloads.

### Deliverables

- Caregiver can configure Kitchen beacon.
- Android can upload beacon event.
- Watch/Android can upload vitals.
- Dashboard shows beacon and vitals reports.

### End-of-phase demo

```text
Caregiver configures Kitchen beacon → Android uploads Kitchen detection → watch uploads HR/activity → dashboard shows room event and wellness trend.
```

---

## Weeks 9–10 — Stream Session Integration

### Goals

- Add stream session backend support.
- Support stream active/unavailable status.
- Link stream sessions to help events.
- Add optional SSE live status updates.

### Student 2 tasks

- Add stream_sessions table/model.
- Add stream start/stop APIs.
- Add stream status endpoint.
- Link help event to stream session.
- Add dashboard stream status card.
- Add optional SSE endpoint for live patient events.
- Coordinate with Student 3 on stream session payloads.

### Deliverables

- Backend can create stream session.
- Backend can mark stream active/ended/unavailable.
- Help event can reference stream session.
- Dashboard shows stream status.

### End-of-phase demo

```text
Patient presses Help → backend logs help event → stream session becomes active or unavailable → portal shows correct status.
```

---

## Week 11 — Integration + Hardening

### Goals

- Make system reliable enough for demo.
- Fix edge cases.
- Improve security.
- Prepare deployment.

### Student 2 tasks

- Full end-to-end testing.
- Add better error handling.
- Add loading/error states in dashboard.
- Validate ownership rules.
- Add input validation.
- Add test seed data.
- Add deployment scripts.
- Review security:
  - Password hashing.
  - JWT expiration.
  - Protected routes.
  - Patient access control.
- Finalize API docs.

### Deliverables

- Stable backend.
- Stable dashboard data.
- Demo data ready.
- API docs complete.
- Deployment tested.

### End-of-phase demo

```text
Full demo works without manually editing database.
```

---

## Week 12 — Final Demo + Documentation

### Goals

- Finalize project.
- Prepare presentation.
- Clean up code.
- Document Student 2 contribution clearly.

### Student 2 tasks

- Final deployment.
- Final database migration.
- Final seed script.
- Architecture documentation.
- API documentation.
- Student 2 presentation slides/section.
- Demo script.
- Screenshots.
- Final README.
- Final code cleanup.

### Deliverables

- Deployed backend.
- Deployed database.
- Working API docs.
- Working demo flow.
- Final documentation.
- Student 2 contribution summary.

---

## 14. Recommended Implementation Order

Do not start with a fully designed portal. Start with a working vertical slice.

### First vertical slice

Build:

1. Auth.
2. Patient model.
3. Reminder model.
4. Reminder CRUD API.
5. Basic dashboard shell.
6. Reminder form.
7. Reminder list.
8. Mobile reminder sync endpoint.
9. Reminder acknowledgment event endpoint.
10. Reminder report page.

This proves the main system works:

```text
Caregiver portal → backend → database → mobile sync → mobile event upload → backend report → caregiver portal.
```

After this vertical slice works, add help, beacons, vitals, and stream status.

---

## 15. Should We Start With the Web Portal Design?

### Short answer

Start with a **basic web portal shell**, but do **not** spend too much time fully designing every page first.

### Best approach

Do these together in the first phase:

1. Define database schema.
2. Define REST API contracts.
3. Build backend foundation.
4. Build a simple React/Tailwind portal shell.
5. Build one working flow end-to-end.

### Why not start only with UI?

If the team starts by designing the full dashboard before API/schema decisions, the UI may not match the real backend data. The project depends heavily on events, reports, timestamps, patient IDs, reminder IDs, beacon IDs, and mobile sync contracts.

### Best first screen to build

Start with:

- Login page.
- Patient dashboard shell.
- Reminder management page.

Then connect those screens to real backend APIs.

### Best first complete feature

The first complete feature should be:

```text
Login → Create patient → Create reminder → Fetch reminder from mobile endpoint → Upload acknowledgment event → Show acknowledgment report.
```

That one feature proves the entire architecture.

---

## 16. Testing Strategy

### Backend tests

Test:

- Auth register/login.
- Protected routes.
- Patient CRUD.
- Reminder CRUD.
- Reminder event upload.
- Reminder report summary.
- Help contact validation.
- Help event upload.
- Beacon config.
- Beacon event upload.
- Vitals event upload.
- Stream session start/stop.

### Integration tests

Test full flows:

1. Caregiver creates patient.
2. Caregiver creates reminder.
3. Mobile fetches reminder.
4. Watch acknowledgment uploads event.
5. Report updates.
6. Caregiver sets WhatsApp number.
7. Mobile uploads help event.
8. Caregiver configures beacon.
9. Mobile uploads beacon event.
10. Mobile uploads vitals.
11. Dashboard reports show all data.

### Manual demo tests

Before presentation, run:

- Fresh seed database.
- Login works.
- Dashboard loads.
- Reminder report has data.
- Beacon event log has data.
- Vitals chart has data.
- Help timeline has data.
- Stream status displays active/unavailable correctly.

---

## 17. Security Plan

### Required security

- Hash passwords with bcrypt.
- Use JWT for caregiver sessions.
- Protect all caregiver APIs.
- Enforce caregiver ownership of patients.
- Validate all request bodies.
- Avoid exposing password hashes.
- Use environment variables for secrets.
- Use HTTPS in deployment.
- Use CORS only for allowed frontend URL.

### Mobile endpoint security

For MVP, choose one:

Option A:

- Mobile sends patient `deviceId`.
- Backend checks device ID belongs to patient.

Option B:

- Mobile gets a patient device token.
- Mobile sends token with requests.

Option B is better if time allows.

### Data wording

Because this is not medical-grade, UI and docs should label vitals as:

- Wellness signals.
- Activity trends.
- Basic heart rate/activity samples.

---

## 18. Deployment Plan

### Option 1 — Render / Railway

Good for student MVP.

Deploy:

- Backend service.
- PostgreSQL database.
- Frontend web portal.

Environment variables:

```env
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=7d
FRONTEND_URL=
NODE_ENV=production
PORT=3001
```

### Option 2 — DigitalOcean / AWS / Azure

Use if professor expects cloud infrastructure.

Deployment checklist:

- Backend deployed.
- Database deployed.
- Frontend deployed.
- API docs available.
- CORS configured.
- Seed/demo data created.
- Mobile team has API base URL.

---

## 19. Documentation Plan

Create these docs:

```text
docs/
  PROJECT_OVERVIEW.md
  ARCHITECTURE.md
  API_CONTRACT.md
  DATABASE_SCHEMA.md
  STUDENT_2_BACKEND_PLAN.md
  DEMO_SCRIPT.md
  DEPLOYMENT.md
  TESTING.md
```

### API documentation must include

- Endpoint.
- Method.
- Request body.
- Response body.
- Auth requirement.
- Error responses.
- Which team member uses it.

### Database documentation must include

- Table names.
- Field names.
- Relationships.
- Example rows.
- Purpose of each table.

---

## 20. Risk Management

### Risk 1 — Scope creep

Problem:

- Too many integrations: Android, Watch, BLE, WhatsApp, glasses, streaming, dashboard.

Mitigation:

- Build reminder system first.
- Then help button.
- Then beacons.
- Then vitals.
- Treat stream as MVP-lite.

### Risk 2 — WhatsApp limitations

Problem:

- App cannot guarantee direct one-tap WhatsApp video call or replace WhatsApp camera feed.

Mitigation:

- Use Android intent to open WhatsApp conversation/call screen.
- Log help event in backend.
- Run MemAide stream separately if available.

### Risk 3 — BLE distance accuracy

Problem:

- BLE RSSI distance estimates are noisy.

Mitigation:

- Use dwell time.
- Use smoothing.
- Use “near room beacon” wording.
- Avoid exact location claims.

### Risk 4 — Wearable vitals access

Problem:

- Continuous heart rate availability can vary.

Mitigation:

- Use best-effort samples.
- Label as wellness/activity trend.
- Do not claim medical monitoring.

### Risk 5 — Smart glasses limitations

Problem:

- Ray-Ban/Meta glasses may require user consent/action or may not expose all desired stream access.

Mitigation:

- Treat glasses stream as optional.
- Portal should show unavailable status cleanly.

---

## 21. MVP Acceptance Criteria

### Caregiver Portal

- Caregiver can log in.
- Caregiver can create/edit/delete reminders.
- Caregiver can view acknowledgment reports.
- Caregiver can configure WhatsApp number.
- Caregiver can configure beacon UUIDs.
- Caregiver can view beacon and vitals reports.
- Caregiver can view help events.
- Caregiver can see stream active/unavailable status.

### Android App

- Receives reminders.
- Plays audible alert.
- Allows acknowledgment.
- Help button opens WhatsApp.
- Detects configured beacon within dwell threshold.
- Uploads reminder, beacon, help, and vitals events to backend.

### Watch App

- Shows reminder alert.
- Allows acknowledgment.
- Help button sends request to phone.
- Collects basic HR/activity data.

### Backend

- Persists all data.
- Provides documented REST APIs.
- Generates reports.
- Supports cloud deployment.
- Protects caregiver data.
- Provides demo seed data.

### Glasses/Stream

- Detect active glasses if possible.
- Start stream session during help if available.
- Portal can view stream or show unavailable status.

---

## 22. Recommended Demo Scenario

Final demo should follow this exact story:

1. Caregiver logs into portal.
2. Caregiver creates/selects patient.
3. Caregiver creates medication reminder.
4. Caregiver sets WhatsApp help number.
5. Caregiver configures Kitchen beacon.
6. Android app syncs reminder and beacon config.
7. Patient phone detects Kitchen beacon.
8. Reminder fires on phone/watch.
9. Patient acknowledges on watch.
10. Backend stores acknowledgment.
11. Caregiver dashboard shows acknowledgment report.
12. Patient taps Help on watch.
13. Android opens WhatsApp contact.
14. Backend logs help event.
15. If glasses active, stream session starts.
16. Portal shows stream active or unavailable.
17. Portal displays heart rate/activity trend.

---

## 23. Student 2 Presentation Summary

Use this for your final presentation:

```text
My role was Student 2, focused on the backend, database, API, reporting, and dashboard data layer. I designed and implemented the PostgreSQL schema, authentication system, REST API, reminder data model, event ingestion endpoints, and reporting endpoints. My backend connects the caregiver portal, Android app, Wear OS watch, BLE beacon events, vitals uploads, help button events, and optional stream session status. I also created API documentation, demo data, and deployment support so the team could integrate all device workflows into one working MVP.
```

---

## 24. First Development Task

The first real task should not be “design the whole website.” It should be:

```text
Task 1: Build the backend and portal foundation.

Create a monorepo or project structure with:
- backend Node.js/Express/TypeScript app
- PostgreSQL + Prisma setup
- caregiver auth with JWT
- patients table and CRUD APIs
- basic React/Tailwind portal shell
- login page
- patient dashboard shell
- Swagger/OpenAPI docs
- seed data
- README with setup instructions
```

### Task 1 acceptance criteria

- Backend runs locally.
- Database connects.
- Prisma migration works.
- Caregiver can register/login.
- JWT protected route works.
- Caregiver can create/list patients.
- React portal can log in and show patient dashboard shell.
- API docs are visible.
- Seed data loads successfully.

---

## 25. Prompt for Another AI / Developer

Use this prompt to continue implementation:

```text
You are helping build MemAide / GuardiaNova, a 3-month student MVP caregiver assistance platform. I am Student 2. My role is Backend + Database + API + Dashboard Data Lead.

Use this plan as the source of truth. Build the system step by step without breaking future integrations.

Recommended stack:
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT + bcrypt
- API docs: Swagger/OpenAPI
- Frontend portal: React + TypeScript + Vite + Tailwind CSS
- Charts: Recharts
- Realtime later: SSE first, WebSocket only if needed

Important project positioning:
This is not a medical device. Use wellness/activity trend language, reminder assistance, safety awareness, and caregiver coordination. Do not use medical diagnosis or medical monitoring language.

Start with Task 1:
Create the backend and portal foundation:
1. Backend Express TypeScript app.
2. PostgreSQL + Prisma schema.
3. Caregiver auth with JWT.
4. Patients table and CRUD APIs.
5. Basic protected routes.
6. Swagger/OpenAPI docs.
7. Seed data.
8. React/Tailwind portal shell.
9. Login page.
10. Patient dashboard shell connected to real APIs.

Do not fully design every dashboard page first. Build a working vertical slice first:
Login → Create patient → Create reminder → Mobile sync endpoint → Upload acknowledgment event → Dashboard report.
```

---

## 26. Final Decision

The project should start with **backend schema + API contracts + a basic portal shell**, not full dashboard design.

Best immediate next move:

```text
Build Task 1:
Backend foundation + authentication + patients + basic React/Tailwind portal shell.
```

Then build the first complete vertical slice:

```text
Reminder CRUD → mobile reminder sync → reminder acknowledgment upload → caregiver report.
```

This gives the team a stable foundation and makes every later feature easier to connect.
