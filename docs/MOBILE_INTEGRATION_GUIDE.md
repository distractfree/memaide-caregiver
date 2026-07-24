# Mobile Integration Guide

This guide is for the Android and Wear OS mobile development teams integrating with the MemAide backend API.

## Base URL
During local development, point your mobile app's networking client to the backend server.
*(Note: Use `http://10.0.2.2:4000` if testing from an Android emulator).*

Production portal and API base URL: `https://caregiver.guardianova.com`

## Which flow are you building?

There are two authentication flows. **The patient-facing Android app uses the
patient flow.** The caregiver flow is documented after it for existing
integrations and is unchanged.

---

## Patient flow (patient-facing Android app)

The patient enters **their own phone number**. The app never shows a patient
list and never asks the patient to choose a patient.

> **Demo/prototype authentication only.** A phone number is not a secret.
> Not suitable for real production patient data without SMS OTP or a PIN.
> See `docs/MOBILE_API_CONTRACT.md` → "Security limitations".

### App flow

```text
App starts
→ read stored patient token
→ if a token exists, call a patient endpoint (e.g. GET /api/mobile/reminders)
   → accepted        → continue into the app
   → 401             → clear the stored token, show the login screen
→ if no token        → show the login screen
→ patient enters their phone number in E.164 form (e.g. +15550000000)
→ POST /api/mobile/patient-login
→ store the returned token securely
→ fetch reminders / help contact / beacons using the patient token
```

### Login request

- **POST** `/api/mobile/patient-login` — no `Authorization` header.
  ```json
  { "phoneNumber": "+15550000000" }
  ```
- **200 OK:**
  ```json
  {
    "success": true,
    "token": "<PATIENT_JWT>",
    "patient": { "id": "<patient-id>" }
  }
  ```
- **400 `VALIDATION_ERROR`** — the number is missing or not E.164
  (`^\+[1-9]\d{7,14}$`). Prompt the patient to re-enter it.
- **404 `PATIENT_LOGIN_NOT_AVAILABLE`** — show the generic message
  *"Unable to sign in with the provided information."* The backend
  intentionally does not distinguish "unknown number" from "duplicate number",
  so the app must not try to explain which happened.

### Using the patient token

- Send `Authorization: Bearer <PATIENT_JWT>` on every authenticated mobile request.
- **Do not send a `deviceId`.** The token identifies the patient. If the app
  still sends one it is accepted but ignored for identity — it can never select
  a different patient.
- **Do not call `GET /api/mobile/patients`.** It returns `403 CAREGIVER_ONLY`
  for a patient token.
- **Do not store a caregiver JWT** in the patient app.
- On any `401`, clear the stored token and return to the login screen.
- On local logout/reset, clear the stored token.
- Never send this token to `wss://ai.guardianova.com`, never send the callback
  API key from the app, and never include raw tokens in logs or screenshots.

Everything else in this guide works identically with a patient token — just
omit the `deviceId` query parameter or body field.

---

## Caregiver flow (existing integrations — unchanged)
Every `/api/mobile/*` endpoint requires the logged-in caregiver's bearer JWT.
- Send `Authorization: Bearer <JWT_TOKEN>` on every mobile request, including telemetry and stream updates.
- `GET /api/mobile/patients` returns the logged-in caregiver's patient `deviceId` values. This route remains caregiver-only.
- Send the `deviceId` with every `deviceId`-based request. It is still required for caregiver tokens.
- For `GET` requests, append it as a query parameter: `?deviceId=android-demo-001`
- For `POST` requests, include it in the JSON body: `{ "deviceId": "android-demo-001", ... }`
- The backend verifies that the supplied device belongs to the authenticated caregiver before reading or writing data. A cross-caregiver device is returned as `404 Not Found`.
- Never send the caregiver JWT to `wss://ai.guardianova.com`.

## Mobile Sync Endpoints (GET)

Fetch configuration and settings that the caregiver has set up in the web portal.
Every endpoint in this guide requires `Authorization: Bearer <JWT_TOKEN>` in addition to the documented `deviceId` input where applicable.

### Lookup Patients After Login (caregiver tokens only)
- **GET** `/api/mobile/patients`
- **Headers:** `Authorization: Bearer <CAREGIVER_JWT>`
- **Purpose:** Retrieve the logged-in caregiver's patients with `id`, `name`, and `deviceId`.
- **Flow:** After login, call this endpoint, choose the correct patient/deviceId, then use that `deviceId` with `/api/mobile/reminders?deviceId=...`.
- **The patient-facing app must not call this.** A patient token receives
  `403 CAREGIVER_ONLY`; the patient app has no patient-selection step at all.
- **Example Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "patient-id",
        "name": "Arian Test Patient",
        "deviceId": "arian-test-device-001"
      }
    ]
  }
  ```

### Sync Reminders
- **GET** `/api/mobile/reminders?deviceId=...`
- **Purpose:** Retrieve active reminders.
- **Note:** The Android app handles local scheduling (e.g., using AlarmManager or WorkManager) and handles the delivery/acknowledgment UI.

### Sync Help Contacts
- **GET** `/api/mobile/help-contact?deviceId=...`
- **Purpose:** Retrieve the primary emergency contact's WhatsApp number.
- **Note:** The Android app handles constructing and launching the WhatsApp intent.

### Sync Beacons
- **GET** `/api/mobile/beacons?deviceId=...`
- **Purpose:** Retrieve configured BLE beacons and their proximity thresholds.
- **Note:** The Android app handles BLE scanning, signal smoothing, and dwell filtering locally before reporting events.

## Mobile Event Upload Endpoints (POST)

Push telemetry, events, and status updates from the mobile device to the backend.

### Upload Reminder Events
- **POST** `/api/mobile/reminder-events`
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "reminderId": "cm...abc123",
    "scheduledAt": "2026-05-22T08:00:00Z",
    "status": "acknowledged",
    "deliveredAt": "2026-05-22T08:00:05Z",
    "acknowledgedAt": "2026-05-22T08:05:10Z",
    "sourceDevice": "watch"
  }
  ```
  Use only `scheduled`, `delivered`, `acknowledged`, or `missed` for `status`; use only `phone`, `watch`, or `system` for `sourceDevice`.

### Upload Help Events
- **POST** `/api/mobile/help-events`
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "triggeredAt": "2026-05-22T14:30:00Z",
    "sourceDevice": "phone"
  }
  ```
  *(Note: This creates a Help Event but does not automatically start an AI Support Session. The client must explicitly call `/api/mobile/ai-sessions/start` next.)*

### Start AI Support Session
- **POST** `/api/mobile/ai-sessions/start`
- **Purpose:** Start and register an Anthony AI support session. A help event is optional unless the app needs to associate one.
- **Example Body:**
  ```json
  {
    "deviceId": "435687675",
    "vitals": null,
    "beacons": []
  }
  ```
- **Success response:**
  ```json
  {
    "success": true,
    "sessionId": "...",
    "websocketUrl": "wss://ai.guardianova.com",
    "helloMessage": {
      "type": "hello",
      "session_id": "..."
    }
  }
  ```
- **WebSocket:** Connect only to the returned `websocketUrl` and send exactly the returned `helloMessage`. Do not send the caregiver JWT on that connection.

### Send AI Session Message
- **POST** `/api/mobile/ai-sessions/:id/messages`
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "message": "I fell down",
    "senderType": "patient"
  }
  ```

### Acknowledge Emergency Suggestion
- **POST** `/api/mobile/ai-sessions/:id/emergency-suggestion-ack`
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "action": "call_initiated"
  }
  ```

### Upload Beacon Events
- **POST** `/api/mobile/beacon-events`
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "beaconId": "cm...def456",
    "detectedAt": "2026-05-22T10:15:00Z",
    "exitedAt": "2026-05-22T10:45:00Z",
    "dwellSeconds": 1800,
    "estimatedDistanceM": 1.5
  }
  ```

### Upload Vital Events
- **POST** `/api/mobile/vital-events`
- **Purpose:** For Wear OS / Health Connect data syncing.
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "timestamp": "2026-05-22T12:00:00Z",
    "heartRate": 72,
    "stepCount": 4500,
    "motionState": "walking",
    "sourceDevice": "watch"
  }
  ```

## Stream Status Endpoints (POST)

These authenticated mobile endpoints create or update stream-status records. They are separate from the implemented AI egocentric JPEG frame path.

### Start Stream
- **POST** `/api/mobile/stream/start`
- **Body:** `{ "deviceId": "android-demo-001", "source": "glasses" }`

### Update Stream Status
- **POST** `/api/mobile/stream/status`
- **Body:** `{ "deviceId": "android-demo-001", "streamSessionId": "cm...ghi789", "status": "active" }`

### Stop Stream
- **POST** `/api/mobile/stream/stop`
- **Body:** `{ "deviceId": "android-demo-001", "streamSessionId": "cm...ghi789" }`

## Egocentric JPEG Frame Viewer

The current end-to-end frame flow is:

```text
Arian glasses/phone
→ Anthony AI server
→ POST /api/ai-sessions/:sessionId/frames
→ Koko backend latest-frame cache
→ authenticated caregiver Stream Status viewer
```

- Anthony calls `POST /api/ai-sessions/:sessionId/frames` with `X-Api-Key: <AI_CALLBACK_API_KEY>`.
- The caregiver portal polls the backend and shows the latest JPEG in its embedded Stream Status frame viewer.
- This is JPEG frame polling, not WebRTC, HLS, or MJPEG. The portal does not connect directly to Anthony.
- The latest image is held only in a single backend process's memory. A restart clears it; Anthony's next frame restores it. Run one PM2 backend process for this MVP.
- PostgreSQL stores lightweight metadata only—no frame history and no JPEG/base64 image data.
