# MemAide Mobile API Contract for Arian

This document outlines the API contract for the mobile application integration (Android & Wear OS) with the MemAide backend API.

## Base URL
* **Local development base URL:** `http://localhost:4000`
* **Local development API path prefix:** `/api`
* **Android Emulator Tip:** Use `http://10.0.2.2:4000` to access the local server from the emulator.
* **Production Base URL:** Production base URL/IP is not finalized yet. Current verified local base URL is http://localhost:4000.

> [!WARNING]
> The backend server is currently running over HTTP locally. Do not claim or configure HTTPS unless it is officially deployed and configured on the production host.

---

## Auth / Login
Caregivers log in using this endpoint to retrieve an access token. Patient/Wearable telemetry endpoints do not require token-based authentication (they use device identification via `deviceId` instead).

* **Path:** `/api/auth/login`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "email": "caregiver@example.com",
    "password": "password123"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "<JWT_TOKEN>",
      "caregiver": {
        "id": "c7b8c8d8-e1a1-4321-b3b3-5e5e5e5e5e5e",
        "name": "Demo Caregiver",
        "email": "caregiver@example.com",
        "createdAt": "2026-06-11T12:00:00.000Z"
      }
    }
  }
  ```
* **Error Response (401 Unauthorized):**
  ```json
  {
    "status": "error",
    "message": "Invalid credentials",
    "code": "INVALID_CREDENTIALS"
  }
  ```
* **Error Response (400 Bad Request - Validation Failure):**
  ```json
  {
    "status": "error",
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "email": [
        "Invalid email address"
      ],
      "password": [
        "Password is required"
      ]
    }
  }
  ```

---

## Authorization Header
For endpoints that require authentication (such as caregiver portal sync endpoints, e.g., `GET /api/auth/me`, and `GET /api/mobile/patients`), include the retrieved JWT in the request headers:

```http
Authorization: Bearer <JWT_TOKEN>
```

*(Note: Most telemetry/event uploads and patient sync endpoints starting with `/api/mobile/...` do **not** require this header. They use the `deviceId` parameter for routing. `GET /api/mobile/patients` is the exception and requires the caregiver Bearer token.)*

---

## Mobile Endpoints

### GET /api/mobile/patients
Retrieve the logged-in caregiver's patients so the mobile app can select the correct `deviceId`.

* **Path:** `/api/mobile/patients`
* **Method:** `GET`
* **Auth Required:** Yes (caregiver Bearer token)
* **Headers:**
  * `Authorization: Bearer <JWT_TOKEN>`
* **Success Response (200 OK):**
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
* **Returned Fields:**
  * `id`
  * `name`
  * `deviceId`
* **Error Response (401 Unauthorized):**
  ```json
  {
    "status": "error",
    "message": "Missing authorization token",
    "code": "MISSING_TOKEN"
  }
  ```
* **Mobile App Flow:**
  * After login, call `GET /api/mobile/patients` with the caregiver token.
  * Choose the correct patient/deviceId from the response.
  * Use that `deviceId` for reminder sync, for example:
    ```http
    GET /api/mobile/reminders?deviceId=<deviceId>
    ```

---

### GET /api/mobile/reminders
Retrieve the list of active reminders configured for the patient associated with the device.

* **Path:** `/api/mobile/reminders`
* **Method:** `GET`
* **Auth Required:** No (identifies patient via `deviceId`)
* **Headers:** None required
* **Query Parameters:**
  * `deviceId` (string, required): The unique hardware or system ID of the patient's device.
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "patient": {
        "id": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
        "name": "John Doe",
        "deviceId": "android-demo-001"
      },
      "reminders": [
        {
          "id": "cm123abc456def",
          "type": "medication",
          "description": "Take blue blood pressure pill",
          "timeOfDay": "08:00",
          "frequency": "daily",
          "active": true
        }
      ]
    }
  }
  ```
* **Important Fields:**
  * `timeOfDay`: String formatted exactly as `"HH:mm"` (e.g. `"08:00"` or `"22:30"`).
  * `type` and `frequency`: Free-text strings configured by the caregiver in the dashboard.
* **Error Response (404 Not Found - Missing Device ID):**
  ```json
  {
    "status": "error",
    "message": "No patient found for this device",
    "code": "NOT_FOUND"
  }
  ```

---

### POST /api/mobile/reminder-events
Log or sync an instance of a reminder delivery, acknowledgment, or miss from the wearable/phone.

* **Path:** `/api/mobile/reminder-events`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "deviceId": "android-demo-001",
    "reminderId": "cm123abc456def",
    "scheduledAt": "2026-06-11T08:00:00.000Z",
    "deliveredAt": "2026-06-11T08:00:05.000Z",
    "acknowledgedAt": "2026-06-11T08:02:15.000Z",
    "status": "acknowledged",
    "sourceDevice": "phone"
  }
  ```
* **Allowed Enums / Statuses:**
  * `status`: `"scheduled"`, `"delivered"`, `"acknowledged"`, `"missed"`
  * `sourceDevice`: `"phone"`, `"watch"`, `"system"`
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cmevent999xyz",
      "reminderId": "cm123abc456def",
      "patientId": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "scheduledAt": "2026-06-11T08:00:00.000Z",
      "deliveredAt": "2026-06-11T08:00:05.000Z",
      "acknowledgedAt": "2026-06-11T08:02:15.000Z",
      "status": "acknowledged",
      "sourceDevice": "phone",
      "createdAt": "2026-06-11T08:00:05.000Z",
      "updatedAt": "2026-06-11T08:02:15.000Z"
    }
  }
  ```
* **Notes:**
  * `deliveredAt` and `acknowledgedAt` are optional in the request.
  * If `status` is `"delivered"` and `deliveredAt` is omitted, the backend sets it to the current server time.
  * If `status` is `"acknowledged"`, the backend automatically sets both `deliveredAt` and `acknowledgedAt` to the current server time if they are missing.

---

### POST /api/mobile/beacon-events
Report when the patient enters or exits proximity of a registered BLE beacon.

* **Path:** `/api/mobile/beacon-events`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "deviceId": "android-demo-001",
    "beaconId": "cmbeacon789uvw",
    "detectedAt": "2026-06-11T12:15:00.000Z",
    "roomName": "Living Room",
    "exitedAt": "2026-06-11T12:20:00.000Z",
    "dwellSeconds": 300,
    "estimatedDistanceM": 1.8,
    "sourceDevice": "phone"
  }
  ```
* **Allowed Enums / Statuses:**
  * `sourceDevice`: `"phone"`, `"system"` (defaults to `"phone"` if omitted)
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cmbeaconevent555",
      "patientId": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "beaconId": "cmbeacon789uvw",
      "roomName": "Living Room",
      "detectedAt": "2026-06-11T12:15:00.000Z",
      "exitedAt": "2026-06-11T12:20:00.000Z",
      "dwellSeconds": 300,
      "estimatedDistanceM": 1.8,
      "sourceDevice": "phone",
      "createdAt": "2026-06-11T12:15:01.000Z",
      "updatedAt": "2026-06-11T12:20:00.000Z"
    }
  }
  ```
* **Notes:**
  * `roomName`, `exitedAt`, `dwellSeconds`, and `estimatedDistanceM` are optional.
  * If `roomName` is omitted in the request, it defaults to the configured `roomName` on the referenced beacon.

---

### POST /api/mobile/vital-events
Upload wearable vitals measurements (e.g. Heart Rate, Step Count, Motion State).

* **Path:** `/api/mobile/vital-events`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "deviceId": "android-demo-001",
    "timestamp": "2026-06-11T12:30:00.000Z",
    "heartRate": 76,
    "motionState": "walking",
    "stepCount": 3450,
    "sourceDevice": "watch"
  }
  ```
* **Allowed Enums / Statuses:**
  * `motionState`: `"idle"`, `"walking"`, `"active"`, `"unknown"`
  * `sourceDevice`: `"watch"`, `"phone"`, `"system"`
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cmvital987lmn",
      "patientId": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "timestamp": "2026-06-11T12:30:00.000Z",
      "heartRate": 76,
      "motionState": "walking",
      "stepCount": 3450,
      "sourceDevice": "watch",
      "createdAt": "2026-06-11T12:30:01.000Z",
      "updatedAt": "2026-06-11T12:30:01.000Z"
    }
  }
  ```
* **Rules & Notes:**
  * `heartRate`, `motionState`, and `stepCount` are optional, but **at least one** of these fields must be provided in the request payload.
  * `heartRate` must be an integer between `30` and `220`.
  * `stepCount` must be a non-negative integer.

---

### POST /api/mobile/help-events
Triggered when the patient requests help or falls. This creates a record to notify the caregiver.

* **Path:** `/api/mobile/help-events`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "deviceId": "android-demo-001",
    "sourceDevice": "phone",
    "status": "triggered",
    "triggeredAt": "2026-06-11T12:35:00.000Z",
    "whatsappNumber": "+18185550123"
  }
  ```
* **Allowed Enums / Statuses:**
  * `sourceDevice`: `"phone"`, `"watch"`, `"system"`
  * `status`: `"triggered"`, `"whatsapp_opened"`, `"failed"`, `"cancelled"`
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cmhelpevent333",
      "patientId": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "triggeredAt": "2026-06-11T12:35:00.000Z",
      "sourceDevice": "phone",
      "whatsappNumber": "+18185550123",
      "status": "triggered",
      "createdAt": "2026-06-11T12:35:01.000Z",
      "updatedAt": "2026-06-11T12:35:01.000Z"
    }
  }
  ```
* **Rules & Notes:**
  * `triggeredAt` and `whatsappNumber` are optional.
  * `triggeredAt` defaults to the current server time if omitted.
  * `whatsappNumber` must be in E.164 format (e.g. `+18185550123`). If it is omitted from the request body, the backend will query the patient's active `HelpContact`. If no active contact exists, it throws a `400 Bad Request` with code `NO_HELP_CONTACT`.

---

### POST /api/mobile/stream/start
Notify the backend that a smart-glasses or phone camera video stream is starting.

* **Path:** `/api/mobile/stream/start`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "deviceId": "android-demo-001",
    "helpEventId": "cmhelpevent333",
    "source": "glasses",
    "startedAt": "2026-06-11T12:36:00.000Z",
    "status": "starting",
    "viewerUrl": "https://stream.memaide.com/live/patient123",
    "metadata": {
      "resolution": "1080p",
      "fps": 30
    }
  }
  ```
* **Allowed Enums / Statuses:**
  * `source`: `"glasses"`, `"phone"`, `"mock"`, `"unknown"`
  * `status` (for start): `"starting"`, `"active"`, `"unavailable"`, `"failed"` (defaults to `"starting"` if omitted)
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cmstream444qwe",
      "patientId": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "helpEventId": "cmhelpevent333",
      "startedAt": "2026-06-11T12:36:00.000Z",
      "endedAt": null,
      "source": "glasses",
      "status": "starting",
      "viewerUrl": "https://stream.memaide.com/live/patient123",
      "metadata": {
        "resolution": "1080p",
        "fps": 30
      },
      "createdAt": "2026-06-11T12:36:00.000Z",
      "updatedAt": "2026-06-11T12:36:00.000Z"
    }
  }
  ```
* **Notes:**
  * `helpEventId`, `startedAt`, `viewerUrl`, and `metadata` are optional.
  * `startedAt` will default to the current server time if `status` is `"starting"` or `"active"` and no time is provided.

---

### POST /api/mobile/stream/stop
Notify the backend that a stream session has ended.

* **Path:** `/api/mobile/stream/stop`
* **Method:** `POST`
* **Auth Required:** No
* **Headers:**
  * `Content-Type: application/json`
* **Request Body (JSON):**
  ```json
  {
    "deviceId": "android-demo-001",
    "streamSessionId": "cmstream444qwe",
    "endedAt": "2026-06-11T12:40:00.000Z",
    "status": "ended"
  }
  ```
* **Allowed Enums / Statuses:**
  * `status` (for stop): `"ended"`, `"failed"`, `"unavailable"` (defaults to `"ended"` if omitted)
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cmstream444qwe",
      "patientId": "d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "helpEventId": "cmhelpevent333",
      "startedAt": "2026-06-11T12:36:00.000Z",
      "endedAt": "2026-06-11T12:40:00.000Z",
      "source": "glasses",
      "status": "ended",
      "viewerUrl": "https://stream.memaide.com/live/patient123",
      "metadata": {
        "resolution": "1080p",
        "fps": 30
      },
      "createdAt": "2026-06-11T12:36:00.000Z",
      "updatedAt": "2026-06-11T12:40:00.000Z"
    }
  }
  ```
* **Important Field Warning:** Note that this endpoint expects `streamSessionId` in the body, **not** `sessionId`.

---

## Notes

### 1. Additional Implemented Endpoints
There are a few other endpoints implemented under `/api/mobile` that might be useful for your development:
* **`GET /api/mobile/help-contact?deviceId=...`**: Retrieve the patient's active emergency WhatsApp contact config.
* **`GET /api/mobile/beacons?deviceId=...`**: Retrieve active beacons configured for the patient.
* **`POST /api/mobile/stream/status`**: Update a running stream session with new status/metadata. Expects JSON body:
  ```json
  {
    "deviceId": "android-demo-001",
    "streamSessionId": "cmstream444qwe",
    "status": "active",
    "viewerUrl": "https://stream.memaide.com/new-url",
    "metadata": { "fps": 24 }
  }
  ```

### 2. Conversational/AI Session Endpoints
Mobile also interacts with AI emergency support sessions:
* `POST /api/mobile/ai-sessions/start` — Start a conversational session.
* `GET /api/mobile/ai-sessions/:id` — Get session status.
* `POST /api/mobile/ai-sessions/:id/messages` — Send conversation message from patient.
* `POST /api/mobile/ai-sessions/:id/resolve` — Mark session resolved.
* `POST /api/mobile/ai-sessions/:id/emergency-suggestion-ack` — Acknowledge recommended caregiver backup call.

---

## Not Implemented / TODO, if any

* **`GET /api/mobile/patient-config`** is **NOT** implemented in the backend router. Use `GET /api/mobile/reminders`, `GET /api/mobile/beacons`, and `GET /api/mobile/help-contact` to sync settings individually.
