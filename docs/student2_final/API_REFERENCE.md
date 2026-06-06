# API Reference

### Auth
- **POST /api/auth/register**
  - **Purpose:** Create a caregiver account.
  - **Auth Required:** No
  - **Notes:** Expects name, email, password, confirmPassword. Returns token + caregiver. Duplicate email returns conflict (409).
- **POST /api/auth/login**
  - **Purpose:** Authenticate caregiver and return token.
  - **Auth Required:** No
  - **Notes:** Expects email and password. Returns JWT and caregiver profile.

### Patients
- **GET /api/patients**
  - **Purpose:** Retrieve list of patients for the caregiver.
  - **Auth Required:** Yes
- **GET /api/patients/:id**
  - **Purpose:** Get details of a specific patient.
  - **Auth Required:** Yes

### Reminders
- **GET /api/reminders**
  - **Purpose:** Retrieve all reminders for a patient.
  - **Auth Required:** Yes
- **POST /api/reminders**
  - **Purpose:** Create a new reminder.
  - **Auth Required:** Yes
- **PUT /api/reminders/:id**
  - **Purpose:** Update a reminder.
  - **Auth Required:** Yes

### Reminder Reports
- **GET /api/reports/reminders**
  - **Purpose:** Retrieve reminder events and acknowledgment history.
  - **Auth Required:** Yes

### Help
- **GET /api/help-contacts**
  - **Purpose:** Retrieve help contacts for a patient.
  - **Auth Required:** Yes

### AI Sessions
- **POST /api/mobile/ai-sessions/start**
  - **Purpose:** Start an AI support session (scripted).
  - **Auth Required:** Yes (Device ID)
- **POST /api/mobile/ai-sessions/:id/messages**
  - **Purpose:** Send a patient message to the scripted AI session.
  - **Auth Required:** Yes (Device ID)
- **POST /api/mobile/ai-sessions/:id/emergency-suggestion-ack**
  - **Purpose:** Acknowledge an emergency suggestion.
  - **Auth Required:** Yes (Device ID)
- **GET /api/patients/:patientId/ai-sessions**
  - **Purpose:** List AI support sessions for a patient.
  - **Auth Required:** Yes (JWT)
- **POST /api/ai-sessions/:id/caregiver-joined**
  - **Purpose:** Transition session status to `caregiver_joined`.
  - **Auth Required:** Yes (JWT)
- **POST /api/ai-sessions/:id/resolve**
  - **Purpose:** Conclude the support session.
  - **Auth Required:** Yes (JWT)

### Beacons
- **GET /api/beacons**
  - **Purpose:** Retrieve configured beacons for a patient.
  - **Auth Required:** Yes

### Beacon Reports
- **GET /api/reports/beacons**
  - **Purpose:** Retrieve approximate proximity and beacon events.
  - **Auth Required:** Yes

### Vitals / Wellness Reports
- **GET /api/reports/vitals**
  - **Purpose:** Retrieve best-effort wellness and vitals trends.
  - **Auth Required:** Yes

### Stream
- **GET /api/stream**
  - **Purpose:** Retrieve stream session status for a patient.
  - **Auth Required:** Yes

### Health
- **GET /api/health**
  - **Purpose:** Backend health check endpoint.
  - **Auth Required:** No

### Mobile Ingestion Endpoints
- **POST /api/ingest/beacon-events**
  - **Purpose:** Ingest beacon proximity events from mobile device.
  - **Auth Required:** Yes
- **POST /api/ingest/vital-events**
  - **Purpose:** Ingest wellness and vitals data from mobile device.
  - **Auth Required:** Yes
- **POST /api/ingest/help-events**
  - **Purpose:** Ingest help triggered events.
  - **Auth Required:** Yes

### Admin
- **POST /api/admin/login**
  - **Purpose:** Authenticate an admin user.
  - **Auth Required:** No
- **GET /api/admin/me**
  - **Purpose:** Get admin user details.
  - **Auth Required:** Yes (Admin Token)
- **GET /api/admin/caregivers**
  - **Purpose:** List all caregivers with summary counts.
  - **Auth Required:** Yes (Admin Token)
- **GET /api/admin/caregivers/:id**
  - **Purpose:** Get a specific caregiver and their assigned patients.
  - **Auth Required:** Yes (Admin Token)
