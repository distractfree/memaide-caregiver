# API Reference

This document provides a developer-facing reference for all implemented backend endpoints in the MemAide MVP.

---

## Health

### `GET /api/health`
- **Auth:** None
- **Purpose:** Standard health check endpoint to verify the server is running.
- **Example Response:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-05-22T12:00:00Z"
  }
  ```

---

## Auth

### `POST /api/auth/register`
- **Auth:** None
- **Purpose:** Register a new caregiver account.
- **Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Example Response:**
  ```json
  {
    "message": "Registration successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR...",
    "user": {
      "id": "uuid-string",
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  }
  ```
- **Common Errors:** `400` (Validation failed), `409` (Email already registered).

### `POST /api/auth/login`
- **Auth:** None
- **Purpose:** Login and receive a JWT for subsequent protected requests.
- **Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Example Response:** Same as registration.
- **Common Errors:** `401` (Invalid credentials).

### `GET /api/auth/me`
- **Auth:** Bearer JWT
- **Purpose:** Retrieve the currently authenticated caregiver's profile.
- **Example Response:**
  ```json
  {
    "user": {
      "id": "uuid-string",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-05-22T12:00:00Z"
    }
  }
  ```

---

## Patients

### `GET /api/patients`
- **Auth:** Bearer JWT
- **Purpose:** List all patients owned by the authenticated caregiver.
- **Example Response:**
  ```json
  {
    "data": [
      {
        "id": "patient-uuid-1",
        "name": "Mary Johnson",
        "phoneNumber": "555-0101",
        "deviceId": "android-demo-001"
      }
    ]
  }
  ```

### `POST /api/patients`
- **Auth:** Bearer JWT
- **Purpose:** Register a new patient under the caregiver.
- **Body:**
  ```json
  {
    "name": "Mary Johnson",
    "phoneNumber": "555-0101",
    "deviceId": "android-demo-001"
  }
  ```

### `GET /api/patients/:id`
- **Auth:** Bearer JWT
- **Purpose:** Get details of a specific patient.
- **Common Errors:** `404` (Patient not found or does not belong to caregiver).

### `PUT /api/patients/:id`
- **Auth:** Bearer JWT
- **Purpose:** Update patient details (e.g., name, phone, deviceId).

### `DELETE /api/patients/:id`
- **Auth:** Bearer JWT
- **Purpose:** Remove a patient and cascade delete all their data.

---

## Reminders

### `GET /api/patients/:patientId/reminders`
- **Auth:** Bearer JWT
- **Purpose:** Get all reminders configured for a specific patient.

### `POST /api/patients/:patientId/reminders`
- **Auth:** Bearer JWT
- **Purpose:** Create a new reminder for the patient.
- **Body:**
  ```json
  {
    "type": "medication",
    "description": "Take Aspirin",
    "timeOfDay": "08:00",
    "frequency": "daily"
  }
  ```

### `PUT /api/reminders/:id`
- **Auth:** Bearer JWT
- **Purpose:** Update a reminder (e.g., toggle `active` status).

### `DELETE /api/reminders/:id`
- **Auth:** Bearer JWT
- **Purpose:** Delete a reminder.

---

## Reminder Events / Reports

### `POST /api/mobile/reminder-events`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called by the mobile app to report the status of a reminder execution.
- **Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "reminderId": "cuid-string",
    "scheduledAt": "2026-05-22T08:00:00Z",
    "status": "completed",
    "sourceDevice": "wear_os"
  }
  ```

### `GET /api/patients/:patientId/reminder-events`
- **Auth:** Bearer JWT
- **Purpose:** Fetch a raw log of all recent reminder events for a patient.

### `GET /api/patients/:patientId/reports/reminders`
- **Auth:** Bearer JWT
- **Purpose:** Fetch an aggregated report of reminder adherence for the caregiver dashboard.

---

## Help

### `GET /api/patients/:patientId/help-contact`
- **Auth:** Bearer JWT
- **Purpose:** Get the active emergency help contact for the patient.

### `POST /api/patients/:patientId/help-contact`
- **Auth:** Bearer JWT
- **Purpose:** Set or update the patient's emergency contact.
- **Body:**
  ```json
  {
    "whatsappNumber": "+1234567890",
    "label": "Primary Caregiver"
  }
  ```

### `GET /api/patients/:patientId/help-events`
- **Auth:** Bearer JWT
- **Purpose:** View logs of past emergency requests made by the patient.

### `GET /api/mobile/help-contact`
- **Auth:** MVP Device ID Lookup (`?deviceId=android-demo-001`)
- **Purpose:** Called by the mobile app to sync the configured emergency WhatsApp number.

### `POST /api/mobile/help-events`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called by the mobile app when an emergency is triggered.
- **Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "triggeredAt": "2026-05-22T14:30:00Z",
    "sourceDevice": "phone",
    "status": "initiated"
  }
  ```
  *(Note: This creates a Help Event but does not automatically start an AI Support Session. The client must explicitly call `/api/mobile/ai-sessions/start` next.)*

---

## AI Sessions

### `POST /api/mobile/ai-sessions/start`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called explicitly by the mobile app to start a scripted AI support session after an emergency help event is created.
- **Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "helpEventId": "event-uuid-string",
    "sourceDevice": "phone"
  }
  ```

### `POST /api/mobile/ai-sessions/:id/messages`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Send a patient message to the scripted AI session.
- **Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "message": "I need help",
    "senderType": "patient"
  }
  ```

### `POST /api/mobile/ai-sessions/:id/emergency-suggestion-ack`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Acknowledge an emergency suggestion.
- **Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "action": "call_initiated"
  }
  ```

### `GET /api/patients/:patientId/ai-sessions`
- **Auth:** Bearer JWT
- **Purpose:** List AI support sessions for a patient.

### `POST /api/ai-sessions/:id/caregiver-joined`
- **Auth:** Bearer JWT
- **Purpose:** Transition session status to `caregiver_joined`.

### `POST /api/ai-sessions/:id/resolve`
- **Auth:** Bearer JWT
- **Purpose:** Conclude the support session.

---

## Beacons

### `GET /api/patients/:patientId/beacons`
- **Auth:** Bearer JWT
- **Purpose:** List all BLE beacons configured for a patient's house.

### `POST /api/patients/:patientId/beacons`
- **Auth:** Bearer JWT
- **Purpose:** Register a new beacon to track a specific room.
- **Body:**
  ```json
  {
    "roomName": "Living Room",
    "beaconUuid": "11111111-2222-3333-4444-555555555555",
    "major": 1,
    "minor": 1,
    "thresholdDistanceM": 3.0,
    "dwellSeconds": 5
  }
  ```

### `PUT /api/beacons/:id`
- **Auth:** Bearer JWT
- **Purpose:** Update beacon settings.

### `DELETE /api/beacons/:id`
- **Auth:** Bearer JWT
- **Purpose:** Delete a beacon configuration.

### `GET /api/mobile/beacons`
- **Auth:** MVP Device ID Lookup (`?deviceId=android-demo-001`)
- **Purpose:** Called by the mobile app to sync beacon scanning configurations.

### `POST /api/mobile/beacon-events`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called by the mobile app to upload filtered proximity events (e.g., patient dwelled in the Living Room).

### `GET /api/patients/:patientId/beacon-events`
- **Auth:** Bearer JWT
- **Purpose:** Fetch a raw log of all recent room transitions.

### `GET /api/patients/:patientId/reports/beacons`
- **Auth:** Bearer JWT
- **Purpose:** Fetch an aggregated report of time spent per room for the caregiver dashboard.

---

## Vitals

### `POST /api/mobile/vital-events`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called by Wear OS / Android Health to upload periodic health telemetry.
- **Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "timestamp": "2026-05-22T12:00:00Z",
    "heartRate": 72,
    "stepCount": 4500,
    "motionState": "walking",
    "sourceDevice": "wear_os"
  }
  ```

### `GET /api/patients/:patientId/vitals`
- **Auth:** Bearer JWT
- **Purpose:** Fetch raw vital events.

### `GET /api/patients/:patientId/reports/vitals`
- **Auth:** Bearer JWT
- **Purpose:** Fetch aggregated wellness trends (e.g., daily step counts, average heart rates).

---

## Streams

*Note: Streams are currently metadata-only in the MVP.*

### `POST /api/mobile/stream/start`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called by smart-glasses or mobile app to notify the backend a stream has started.

### `POST /api/mobile/stream/status`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called periodically to update the status of an ongoing stream session.

### `POST /api/mobile/stream/stop`
- **Auth:** MVP Device ID Lookup
- **Purpose:** Called to end a stream session.

### `GET /api/patients/:patientId/stream-sessions`
- **Auth:** Bearer JWT
- **Purpose:** List historical stream sessions.

### `GET /api/patients/:patientId/stream-status`
- **Auth:** Bearer JWT
- **Purpose:** Check if there is currently an active stream session for the patient.

### `GET /api/stream-sessions/:id`
- **Auth:** Bearer JWT
- **Purpose:** Get details of a specific stream session.

---

## Admin

### `POST /api/admin/login`
- **Auth:** None
- **Purpose:** Login for admin portal.

### `GET /api/admin/me`
- **Auth:** Bearer JWT (Admin)
- **Purpose:** Retrieve the currently authenticated admin's profile.

### `GET /api/admin/caregivers`
- **Auth:** Bearer JWT (Admin)
- **Purpose:** List all caregivers and their patient counts.

### `GET /api/admin/caregivers/:id`
- **Auth:** Bearer JWT (Admin)
- **Purpose:** Get details of a specific caregiver and their patients.

### `GET /api/admin/ai-sessions`
- **Auth:** Bearer JWT (Admin)
- **Purpose:** List all AI sessions across all patients.

### `GET /api/admin/ai-sessions/:id`
- **Auth:** Bearer JWT (Admin)
- **Purpose:** View a specific AI session with messages (read-only).

---

## Mobile Sync (Overview)

Most `/api/mobile/*` endpoints are designed for the patient device and do not require a caregiver JWT. Instead, they require the `deviceId` to be passed (as a query parameter for GET requests, or in the JSON body for POST requests).

`GET /api/mobile/patients` is the exception. It requires `Authorization: Bearer <JWT_TOKEN>` and returns the logged-in caregiver's patients with only `id`, `name`, and `deviceId`. The mobile app should call it after login, choose the correct `deviceId`, then use that `deviceId` with the existing sync endpoints.

- `GET /api/mobile/patients`
- `GET /api/mobile/reminders?deviceId=...`
- `GET /api/mobile/help-contact?deviceId=...`
- `GET /api/mobile/beacons?deviceId=...`

These endpoints are strictly partitioned on the backend; providing a `deviceId` will only return the configurations belonging to that specific patient.
