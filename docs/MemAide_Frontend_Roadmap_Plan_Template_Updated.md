# MemAide / GuardiaNova — Frontend Caregiver Portal Roadmap

## 0. Source Files for Future Frontend Work

Use this roadmap together with the visual template TXT file.

Project root:

```txt
C:\MemAide
```

Frontend roadmap file:

```txt
C:\MemAide\MemAide_Frontend_Roadmap_Plan_Template_Updated.md
```

Design/template reference file:

```txt
C:\MemAide\docs\Build a React + Vite + Tailwind CSS.txt
```

The TXT file contains a React + Vite + Tailwind CSS template for an agency-style site. For MemAide, use it as a **visual design reference**, not as final content.

Use from the TXT template:
- Light gray/white visual system
- Orange accent color `#F26522`
- Dark text and dark circular logo/button treatment
- Rounded pill buttons
- Rounded cards
- Soft shadows
- Clean spacing
- Max content width around `1440px`
- Subtle hover interactions
- Text-roll button animation style where appropriate
- Mobile menu/bottom sheet inspiration where appropriate
- Shader background style where appropriate
- `lucide-react` icon usage
- Smooth transitions

Do NOT copy from the TXT template:
- Axion Studio branding
- Agency/portfolio content
- Case-study text
- Random client project names
- Agency landing page layout as the full app structure

Adapt the template into a real caregiver dashboard for MemAide / GuardiaNova.

---

## 1. Project Summary

MemAide / GuardiaNova is a multi-device caregiver assistance platform for independent living.

The caregiver web portal allows a caregiver to:
- Log in
- Manage patients
- Create and manage reminders
- View reminder acknowledgment reports
- Configure WhatsApp help contacts
- View help button events
- Configure BLE room beacons
- View approximate beacon proximity events and reports
- View wearable wellness/activity trends
- View help-session stream status

This project is not a medical device.

Use safe wording:
- Caregiver coordination
- Reminder support
- Wellness trends
- Activity context
- Safety awareness
- Independent living support
- Approximate BLE proximity
- Patient perspective stream status

Avoid wording:
- Medical monitoring
- Diagnosis
- Clinical interpretation
- Emergency medical system
- Certified fall detection
- Exact indoor tracking
- Exact patient location
- Replacing WhatsApp camera feed

---

## 2. Student 2 Ownership

The user is Student 2.

Student 2 already owns:
- Backend
- PostgreSQL schema
- REST APIs
- Authentication
- Reminder data model
- Report endpoints
- Beacon/vitals/help/stream event ingestion
- Test data
- API documentation
- Backend smoke testing

The caregiver portal is also a strong fit for Student 2 because it is the frontend representation of the backend/database/reporting system.

The portal should feel like a caregiver/admin dashboard powered by real backend data.

---

## 3. Backend Status

Backend folder:

```txt
C:\MemAide\server
```

Backend URL:

```txt
http://localhost:4000
```

Demo login:

```txt
Email: demo@memaide.local
Password: Password123!
```

Seeded demo patient:

```txt
Name: Mary Johnson
Device ID: android-demo-001
```

Backend is already verified:
- Unit tests passed
- TypeScript build passed
- Prisma validate passed
- PostgreSQL Docker container works
- Prisma migration applied
- Seed script passed
- Smoke test passed

Start backend:

```powershell
cd C:\MemAide\server
npm run dev
```

---

## 4. PostgreSQL / Database Location

The SQL database is PostgreSQL.

Project database files:

```txt
C:\MemAide\server\prisma\schema.prisma
C:\MemAide\server\prisma\migrations\
C:\MemAide\server\prisma\seed.ts
```

Live local database:

```txt
Docker container: memaide-postgres
Host: localhost
Port: 5432
Database: memaide
```

Backend `.env`:

```txt
C:\MemAide\server\.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memaide?schema=public
```

---

## 5. Frontend Target

Frontend folder:

```txt
C:\MemAide\client
```

Frontend `.env`:

```txt
C:\MemAide\client\.env
VITE_API_BASE_URL=http://localhost:4000
```

Expected commands:

```powershell
cd C:\MemAide\client
npm install
npm run dev
npm run build
```

---

## 6. Required Frontend Stack

Use:
- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Recharts
- Framer Motion
- lucide-react

Template-inspired package:
- `shaders` package may be used for the login/hero-style background if compatible.

Recommended optional utilities:
- clsx
- date-fns
- axios or a typed native fetch wrapper

Important tools/capabilities:
- Use 21st.dev MCP server when useful for modern dashboard UI/component inspiration.
- Use Framer Motion for subtle, professional animations.
- Use available frontend/design/code-generation skills to improve UI quality and maintainability.
- Keep the result real, maintainable, and connected to backend APIs.

---

## 7. Template-Inspired Visual Direction

The TXT template uses:
- `#EFEFEF` light gray background
- `#F5F5F5` section background
- White cards/pills
- `#F26522` orange accent
- Dark gray/black text and CTA surfaces
- Rounded pill navigation/buttons
- Soft shadows
- Full-width clean layouts
- Animated shader background
- Smooth hover and menu transitions

Adapt this to MemAide as:

### Login Page
Use the strongest template influence here:
- Light gray background
- Optional shader overlay using `shaders/react`
- White pill/card login panel
- Dark MemAide logo circle
- Orange primary button
- Clean demo credential helper
- Calm product copy

### Dashboard App
Use the template influence more subtly:
- Light gray app shell
- White rounded cards
- Dark text
- Orange accents for primary actions
- Soft gray borders
- Rounded sidebar/topbar elements
- Professional spacing
- Recharts with clean minimal styling
- Framer Motion for card/page transitions

Do not turn the admin dashboard into a marketing landing page. The portal must remain functional and data-driven.

---

## 8. Animation Requirements

Use Framer Motion for:
- Page transitions
- Login card entrance
- Sidebar/content fade-in
- Dashboard card entrance
- Modal open/close
- Subtle button hover motion
- Loading/empty state transitions

Animation rules:
- Keep animations subtle.
- Do not make the portal feel playful or distracting.
- Do not block usability.
- Prefer `duration-300` to `duration-500` style timing.
- Match the template’s smooth, refined feel.

---

## 9. API Client Requirements

Create a centralized API client.

Responsibilities:
- Read `VITE_API_BASE_URL`
- Attach `Authorization: Bearer <token>` when available
- Parse JSON responses
- Surface clear errors
- Handle 401 by clearing auth and redirecting to login
- Keep endpoint functions grouped by feature
- Avoid duplicating fetch logic inside components

---

## 10. Authentication Flow

Required endpoints:
- `POST /api/auth/login`
- `GET /api/auth/me`

Required behavior:
1. User opens `/login`.
2. User enters email/password.
3. Frontend calls backend login.
4. Store returned JWT.
5. Fetch caregiver profile.
6. Redirect to protected dashboard.
7. Protected routes redirect to `/login` when unauthenticated.
8. Logout clears token and redirects to `/login`.
9. Refresh keeps the session if token is valid.

Demo helper:
- Include a button that fills:
  - `demo@memaide.local`
  - `Password123!`

Do not auto-login without user action.

---

## 11. Global Layout

Protected layout:
- Sidebar navigation
- Topbar
- Patient selector
- Caregiver profile/logout area
- Main content area

Sidebar links:
- Overview
- Patients
- Reminders
- Reminder Reports
- Help
- Beacons
- Beacon Reports
- Wellness Trends
- Stream Status
- Settings

Task 1 can create placeholder pages for most routes.

---

## 12. Required Pages

### 12.1 Login Page

Route:

```txt
/login
```

Include:
- MemAide branding
- Subtitle: “Caregiver coordination for reminders, wellness trends, and independent living support.”
- Email/password inputs
- Login button
- Demo credential helper
- Loading state
- Error state
- Template-inspired light gray/shader background
- Orange CTA style from template
- Framer Motion entrance animation

---

### 12.2 Dashboard Overview

Route:

```txt
/
```

Task 1 should show:
- Caregiver name/email
- Selected patient name
- Patient phone number
- Patient device ID
- Backend status
- Placeholder cards for future modules

Later tasks add:
- Today’s reminders
- Acknowledged reminders
- Missed reminders
- Latest wellness sample
- Latest beacon context
- Latest help event
- Stream status

Relevant endpoints:
- `GET /api/patients`
- `GET /api/patients/:patientId/reminders`
- `GET /api/patients/:patientId/reports/reminders`
- `GET /api/patients/:patientId/reports/beacons`
- `GET /api/patients/:patientId/reports/vitals`
- `GET /api/patients/:patientId/help-events`
- `GET /api/patients/:patientId/stream-status`

---

### 12.3 Patients Page

Route:

```txt
/patients
```

Endpoints:
- `GET /api/patients`
- `POST /api/patients`
- `GET /api/patients/:id`
- `PUT /api/patients/:id`
- `DELETE /api/patients/:id`

---

### 12.4 Reminder Management Page

Route:

```txt
/reminders
```

Endpoints:
- `GET /api/patients/:patientId/reminders`
- `POST /api/patients/:patientId/reminders`
- `PUT /api/reminders/:id`
- `DELETE /api/reminders/:id`

---

### 12.5 Reminder Reports Page

Route:

```txt
/reports/reminders
```

Endpoints:
- `GET /api/patients/:patientId/reminder-events`
- `GET /api/patients/:patientId/reports/reminders`

---

### 12.6 Help Page

Route:

```txt
/help
```

Endpoints:
- `GET /api/patients/:patientId/help-contact`
- `POST /api/patients/:patientId/help-contact`
- `GET /api/patients/:patientId/help-events`

Safe wording:
- “Patient app opens WhatsApp to the configured contact.”
- Do not say “guaranteed video call.”
- Do not say “replaces WhatsApp camera.”

---

### 12.7 Beacon Configuration Page

Route:

```txt
/beacons
```

Endpoints:
- `GET /api/patients/:patientId/beacons`
- `POST /api/patients/:patientId/beacons`
- `PUT /api/beacons/:id`
- `DELETE /api/beacons/:id`

Safe wording:
- “Approximate BLE proximity”
- “Near Kitchen beacon”
- Do not claim exact indoor tracking.

---

### 12.8 Beacon Reports Page

Route:

```txt
/reports/beacons
```

Endpoints:
- `GET /api/patients/:patientId/beacon-events`
- `GET /api/patients/:patientId/reports/beacons`

---

### 12.9 Wellness Trends Page

Route:

```txt
/reports/vitals
```

Endpoints:
- `GET /api/patients/:patientId/vitals`
- `GET /api/patients/:patientId/reports/vitals`

Safe note:
“Wellness data is best-effort and intended for care coordination, not diagnosis.”

---

### 12.10 Stream Status Page

Route:

```txt
/stream
```

Endpoints:
- `GET /api/patients/:patientId/stream-status`
- `GET /api/patients/:patientId/stream-sessions`
- `GET /api/stream-sessions/:id`

Safe wording:
- “Patient perspective stream”
- “Stream status”
- “Viewer available”
- Do not imply WhatsApp camera replacement.

---

## 13. TypeScript Domain Types

Define shared types for:
- `ApiResponse<T>`
- `Caregiver`
- `Patient`
- `Reminder`
- `ReminderEvent`
- `ReminderReport`
- `HelpContact`
- `HelpEvent`
- `Beacon`
- `BeaconEvent`
- `BeaconReport`
- `VitalEvent`
- `VitalsReport`
- `StreamSession`
- `StreamStatus`

Keep types in:

```txt
client/src/types/
```

---

## 14. Loading, Empty, and Error States

Every page should handle:
- Loading
- Empty data
- API error
- Backend offline
- Unauthorized/expired session
- No selected patient

Examples:
- “No reminders configured yet.”
- “No beacon events found for this date range.”
- “No wellness samples available yet.”
- “No patient perspective stream is available for this session.”
- “Select a patient to continue.”

---

## 15. Recommended Frontend Structure

```txt
client/
  src/
    app/
      App.tsx
      router.tsx
      providers.tsx
    components/
      layout/
        AppLayout.tsx
        Sidebar.tsx
        Topbar.tsx
        PatientSelector.tsx
      ui/
        Button.tsx
        Card.tsx
        Badge.tsx
        Input.tsx
        Select.tsx
        Modal.tsx
        Table.tsx
        EmptyState.tsx
        LoadingState.tsx
        ErrorState.tsx
      charts/
      forms/
    features/
      auth/
      dashboard/
      patients/
      reminders/
      reports/
      help/
      beacons/
      vitals/
      streams/
    services/
      apiClient.ts
      tokenStorage.ts
    types/
      api.ts
      domain.ts
    utils/
      date.ts
      formatting.ts
    styles/
      globals.css
```

---

## 16. Frontend Task Breakdown

### Task 1 — Frontend Foundation + Auth + Protected Layout

Build:
- Vite React TypeScript app
- Tailwind CSS
- React Router
- Framer Motion setup
- Template-inspired base UI styling
- Optional shader login background using `shaders`
- API client
- Auth token storage
- Login page
- Protected route
- App layout
- Sidebar/topbar
- Patient selector
- Dashboard shell
- Placeholder routes
- Real backend connection:
  - `/api/health`
  - `/api/auth/login`
  - `/api/auth/me`
  - `/api/patients`

Acceptance:
- User can log in with demo account.
- User can see caregiver name/email.
- User can see patients from PostgreSQL.
- User can select Mary Johnson.
- Protected routes work.
- Logout works.
- Build passes.
- No backend code modified.

---

### Task 2 — Patient Management UI

Build:
- Patient list
- Create/edit/delete patient
- Patient profile cards
- Real patient CRUD integration

---

### Task 3 — Reminder Management UI

Build:
- Reminder table/cards
- Create/edit/delete reminder
- Active toggle
- Real reminder CRUD integration

---

### Task 4 — Reminder Reports UI

Build:
- KPI cards
- Status chart
- Event table
- Date filters
- Real reminder report integration

---

### Task 5 — Help Contact + Help Events UI

Build:
- Help contact form
- Help events timeline
- Status badges
- Safe WhatsApp wording
- Real help API integration

---

### Task 6 — Beacon Configuration UI

Build:
- Beacon list
- Create/edit/delete beacons
- Active toggle
- Threshold/dwell fields
- Safe BLE wording
- Real beacon API integration

---

### Task 7 — Beacon Reports UI

Build:
- Latest approximate context
- Room summaries
- Event table
- Filters
- Real beacon report API integration

---

### Task 8 — Wellness / Vitals Reports UI

Build:
- Heart-rate chart
- Step chart
- Motion timeline
- Daily summaries
- Safe wellness notes
- Real vitals report integration

---

### Task 9 — Stream Status UI

Build:
- Current stream status
- Active/latest session cards
- Stream sessions table
- Viewer link button if available
- Unavailable state

---

### Task 10 — Frontend Polish + Demo Readiness

Build:
- Responsive polish
- Animation polish
- Loading/error consistency
- Final dashboard quality pass
- Demo rehearsal with backend seed data

---

## 17. Final Frontend Acceptance Criteria

The caregiver portal is complete when:
- Login works against real backend.
- Protected routing works.
- Patients load from backend.
- Patient management works.
- Reminder management works.
- Reminder reports work.
- Help contact/events work.
- Beacon configuration works.
- Beacon reports work.
- Wellness trends work.
- Stream status works.
- Charts are readable.
- UI is responsive.
- UI uses safe product wording.
- UI follows the approved template visual direction.
- UI uses 21st.dev MCP inspiration when helpful.
- UI uses Framer Motion subtly.
- Build passes.
- Frontend does not require backend code changes.

---

## 18. New Chat Workflow

In the new chat:
1. Provide this MD file.
2. Provide the template TXT file path:
   `C:\MemAide\docs\Build a React + Vite + Tailwind CSS.txt`
3. Provide the kickoff prompt.
4. Ask the assistant to analyze both files deeply.
5. Ask it to produce only the Frontend Task 1 implementation prompt.
