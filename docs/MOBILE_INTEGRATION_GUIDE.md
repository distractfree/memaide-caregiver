# Mobile Integration Guide

This guide is for the Android and Wear OS mobile development teams integrating with the MemAide backend API.

## Base URL
During local development, point your mobile app's networking client to the backend server.
*(Note: Use `http://10.0.2.2:4000` if testing from an Android emulator).*

## Authentication / Device Identification
Most MVP mobile API endpoints do **not** use JWT authentication. Instead, they rely on a `deviceId` string.
- `GET /api/mobile/patients` requires the caregiver JWT and returns the logged-in caregiver's patient `deviceId` values.
- Existing reminder, help, beacon, vital, AI session, and stream mobile endpoints still use `deviceId` and do not require JWT.
- Send the `deviceId` with every `deviceId`-based request.
- For `GET` requests, append it as a query parameter: `?deviceId=android-demo-001`
- For `POST` requests, include it in the JSON body: `{ "deviceId": "android-demo-001", ... }`
- The backend uses this ID to automatically link telemetry and sync data to the correct Patient profile.

## Mobile Sync Endpoints (GET)

Fetch configuration and settings that the caregiver has set up in the web portal.

### Lookup Patients After Login
- **GET** `/api/mobile/patients`
- **Headers:** `Authorization: Bearer <JWT_TOKEN>`
- **Purpose:** Retrieve the logged-in caregiver's patients with `id`, `name`, and `deviceId`.
- **Flow:** After login, call this endpoint, choose the correct patient/deviceId, then use that `deviceId` with `/api/mobile/reminders?deviceId=...`.
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
    "status": "completed",
    "deliveredAt": "2026-05-22T08:00:05Z",
    "acknowledgedAt": "2026-05-22T08:05:10Z",
    "sourceDevice": "wear_os"
  }
  ```

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
- **Purpose:** Start an AI support session (scripted). Must be called after a Help Event is created if AI support is desired.
- **Example Body:**
  ```json
  {
    "deviceId": "android-demo-001",
    "helpEventId": "cm...def456",
    "sourceDevice": "phone"
  }
  ```

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
    "sourceDevice": "wear_os"
  }
  ```

## Stream Status Endpoints (POST)

These endpoints are currently for **status metadata only**. They let the caregiver portal know that the smart-glasses camera is active.

### Start Stream
- **POST** `/api/mobile/stream/start`
- **Body:** `{ "deviceId": "android-demo-001", "source": "glasses" }`

### Update Stream Status
- **POST** `/api/mobile/stream/status`
- **Body:** `{ "deviceId": "android-demo-001", "sessionId": "cm...ghi789", "status": "active" }`

### Stop Stream
- **POST** `/api/mobile/stream/stop`
- **Body:** `{ "deviceId": "android-demo-001", "sessionId": "cm...ghi789" }`
