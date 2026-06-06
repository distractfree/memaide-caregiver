# MemAide Backend Demo Script

This script provides a step-by-step walkthrough of the MemAide backend for class or project presentations. Follow these instructions to demonstrate the full end-to-end flow of the MVP.

## Prerequisites

Open your terminal and navigate to the server directory:
```bash
cd C:\MemAide\server
```

### 1. Start PostgreSQL Container
Ensure your database is running:
```bash
docker start memaide-postgres
# If not yet created, run: docker run --name memaide-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
```

### 2. Run Migrations
Apply the latest database schema:
```bash
npx prisma migrate dev
```

### 3. Seed Demo Data
Populate the database with the initial demo caregiver and patients:
```bash
npm run prisma:seed
```

### 4. Build and Test (Optional, for completeness)
Show that the project builds and passes tests cleanly:
```bash
npx prisma validate
npm run build
npm test
```

### 5. Start the Backend Server
Launch the development server:
```bash
npm run dev
```

### 6. Run the Smoke Test
In a new terminal window (also in `C:\MemAide\server`), execute the comprehensive smoke test. This test programmatically runs through the entire MVP flow, acting as both a web client and a mobile client.
```bash
npm run smoke:test
```

---

## Interactive API Walkthrough (Postman/cURL)

With the server running at `http://localhost:4000`, you can demonstrate the following flows:

### 7. Caregiver Login
- **Endpoint:** `POST /api/auth/login`
- **Body:** `{ "email": "demo@memaide.local", "password": "Password123!" }`
- **Action:** Show the JWT token returned. Explain that this token is required for all web portal actions.

### 8. View Patient List
- **Endpoint:** `GET /api/patients` (Include Bearer Token)
- **Action:** Show the seeded patients (Mary Johnson, Robert Lee). Point out their `deviceId`s (`android-demo-001`, `android-demo-002`).

### 9. Manage Reminders
- **Endpoint:** `GET /api/patients/:patientId/reminders`
- **Action:** Show the seeded reminders for a patient.
- **Mobile Sync:** Show `GET /api/mobile/reminders?deviceId=android-demo-001` (No token needed, looks up by device).

### 10. Reminder Reports
- **Endpoint:** `POST /api/mobile/reminder-events`
- **Action:** Push a new "completed" reminder event from the mobile perspective.
- **Endpoint:** `GET /api/patients/:patientId/reports/reminders`
- **Action:** Show how the backend aggregates these events into adherence reports for the caregiver dashboard.

### 11. Help Contact and Events
- **Endpoint:** `GET /api/patients/:patientId/help-contact` (Caregiver view)
- **Endpoint:** `GET /api/mobile/help-contact?deviceId=android-demo-001` (Mobile view)
- **Action:** Show the emergency WhatsApp number.
- **Endpoint:** `POST /api/mobile/help-events`
- **Action:** Trigger an emergency help event from the mobile device.
- **Endpoint:** `GET /api/patients/:patientId/help-events`
- **Action:** Show the event appearing in the caregiver's log.

### 12. Beacon Config & Activity
- **Endpoint:** `GET /api/patients/:patientId/beacons`
- **Action:** Show the configured beacons (e.g., Living Room, Kitchen).
- **Endpoint:** `POST /api/mobile/beacon-events`
- **Action:** Upload an event representing a patient dwelling in the Living Room.
- **Endpoint:** `GET /api/patients/:patientId/reports/beacons`
- **Action:** Show the activity timeline generated for the dashboard.

### 13. Vitals Upload & Report
- **Endpoint:** `POST /api/mobile/vital-events`
- **Action:** Send a simulated heart rate / step count update from a wearable.
- **Endpoint:** `GET /api/patients/:patientId/reports/vitals`
- **Action:** Show the aggregated wellness trends.

### 14. Stream Status Tracking
- **Endpoint:** `POST /api/mobile/stream/start`
- **Action:** Simulate a smart-glasses video stream starting.
- **Endpoint:** `GET /api/patients/:patientId/stream-status`
- **Action:** Show the stream status turning "active" for the caregiver to monitor.
