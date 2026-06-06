# MemAide API Contracts

**Base URL (local):** `http://localhost:4000/api`  
**Auth:** Bearer JWT in `Authorization` header for all protected routes  
**Content-Type:** `application/json`

---

## Status: Task 1 (Foundation)

Only the health endpoint is implemented. All other contracts are planned for future tasks.

---

## Health

### GET /api/health

No auth required.

**Response 200:**
```json
{
  "status": "ok",
  "service": "memaide-api",
  "timestamp": "2026-05-22T11:00:00.000Z",
  "environment": "development"
}
```

---

## Auth (Task 2)

### POST /api/auth/register

**Request:**
```json
{
  "name": "Caregiver One",
  "email": "caregiver@example.com",
  "password": "StrongPassword123!"
}
```

**Response 201:**
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

---

### POST /api/auth/login

**Request:**
```json
{
  "email": "caregiver@example.com",
  "password": "StrongPassword123!"
}
```

**Response 200:**
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

---

### GET /api/auth/me

Protected. Returns the current caregiver from JWT.

**Response 200:**
```json
{
  "id": "uuid",
  "name": "Caregiver One",
  "email": "caregiver@example.com"
}
```

---

## Patients (Task 2)

All routes require valid JWT. Caregivers can only access their own patients.

### GET /api/patients

**Response 200:**
```json
{
  "status": "ok",
  "data": [
    {
      "id": "uuid",
      "name": "Patient One",
      "phoneNumber": "+18185551234",
      "deviceId": "android-device-001",
      "createdAt": "2026-05-22T10:00:00.000Z"
    }
  ]
}
```

### POST /api/patients

**Request:**
```json
{
  "name": "Patient One",
  "phoneNumber": "+18185551234",
  "deviceId": "android-device-001"
}
```

**Response 201:**
```json
{
  "status": "ok",
  "data": {
    "id": "uuid",
    "name": "Patient One",
    "phoneNumber": "+18185551234",
    "deviceId": "android-device-001"
  }
}
```

### GET /api/patients/:id

**Response 200:** Single patient object.

### PUT /api/patients/:id

**Request:** Partial patient fields (name, phoneNumber, deviceId).

### DELETE /api/patients/:id

**Response 204:** No content.

---

## Reminders (Task 3)

### GET /api/patients/:id/reminders
### POST /api/patients/:id/reminders
### PUT /api/reminders/:id
### DELETE /api/reminders/:id

**Reminder shape:**
```json
{
  "type": "medication",
  "description": "Take blood pressure pill",
  "timeOfDay": "08:00",
  "frequency": "daily",
  "active": true
}
```

**type values:** medication | hydration | appointment | activity | custom  
**frequency values:** daily | weekdays | weekly | custom

---

## Mobile Reminder Sync (Task 3)

### GET /api/mobile/reminders?deviceId=xxx

Returns all active reminders for the patient matching `deviceId`. No JWT — uses device ID for lookup.

---

## Reminder Events (Task 4)

### POST /api/mobile/reminder-events

```json
{
  "patientId": "uuid",
  "reminderId": "uuid",
  "scheduledAt": "2026-05-22T08:00:00Z",
  "deliveredAt": "2026-05-22T08:00:10Z",
  "acknowledgedAt": "2026-05-22T08:03:30Z",
  "status": "acknowledged",
  "sourceDevice": "watch"
}
```

**status values:** scheduled | delivered | acknowledged | missed | skipped | failed  
**sourceDevice values:** android | watch | backend | demo

### GET /api/patients/:id/reports/reminders?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD

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

---

## Help Contact (Task 5)

### POST /api/patients/:id/help-contact
### GET /api/patients/:id/help-contact

```json
{
  "whatsappNumber": "+18185551234",
  "label": "Primary caregiver"
}
```

---

## Help Events (Task 5)

### POST /api/mobile/help-events

```json
{
  "patientId": "uuid",
  "triggeredAt": "2026-05-22T14:05:00Z",
  "sourceDevice": "watch",
  "whatsappNumber": "+18185551234",
  "status": "whatsapp_opened"
}
```

**status values:** created | whatsapp_opened | stream_active | stream_unavailable | resolved | failed

### GET /api/patients/:id/help-events

---

## AI Sessions (Task 3 / AI Orchestration)

### POST /api/mobile/ai-sessions/start
```json
{
  "deviceId": "android-demo-001",
  "helpEventId": "uuid",
  "sourceDevice": "phone"
}
```

### POST /api/mobile/ai-sessions/:id/messages
```json
{
  "deviceId": "android-demo-001",
  "message": "I need help",
  "senderType": "patient"
}
```

### POST /api/mobile/ai-sessions/:id/emergency-suggestion-ack
```json
{
  "deviceId": "android-demo-001",
  "action": "call_initiated"
}
```

---

## Beacons (Task 6)

### POST /api/patients/:id/beacons

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

### POST /api/mobile/beacon-events

```json
{
  "patientId": "uuid",
  "beaconId": "uuid",
  "roomName": "Kitchen",
  "detectedAt": "2026-05-22T14:00:00Z",
  "exitedAt": "2026-05-22T14:04:00Z",
  "dwellSeconds": 240,
  "estimatedDistanceM": 2.4
}
```

---

## Vitals (Task 7)

### POST /api/mobile/vital-events

```json
{
  "patientId": "uuid",
  "timestamp": "2026-05-22T14:05:00Z",
  "heartRate": 82,
  "motionState": "walking",
  "stepCount": 3400,
  "sourceDevice": "watch"
}
```

**motionState values:** idle | walking | active | unknown

### GET /api/patients/:id/reports/vitals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD

---

## Stream Sessions (Task 8)

### POST /api/mobile/stream/start

```json
{
  "patientId": "uuid",
  "source": "meta_rayban",
  "status": "active",
  "streamUrl": "https://example.com/stream/session-id"
}
```

### POST /api/mobile/stream/stop

```json
{
  "streamSessionId": "uuid",
  "endedAt": "2026-05-22T14:20:00Z",
  "status": "ended"
}
```

### GET /api/patients/:id/stream-sessions
### GET /api/stream-sessions/:id

**status values:** unavailable | starting | active | ended | failed  
**source values:** meta_rayban | android_camera | mock | unavailable

---

## AI Sessions (Task 9)

### GET /api/patients/:patientId/ai-sessions
Returns a list of AI sessions for a patient.

### GET /api/ai-sessions/:id
Returns a specific AI session and its messages.

### POST /api/ai-sessions/:id/caregiver-joined
Marks an AI session as `caregiver_joined`.

### POST /api/ai-sessions/:id/resolve
Marks an AI session as `resolved`.

---

## Admin (Task 10)

### POST /api/admin/login
### GET /api/admin/me
### GET /api/admin/caregivers
### GET /api/admin/caregivers/:id
### GET /api/admin/ai-sessions
### GET /api/admin/ai-sessions/:id

---

## Error Responses

All errors follow this shape:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

**Validation errors (400):**
```json
{
  "status": "error",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fieldName": ["error message"]
  }
}
```

**Common HTTP codes:**
- `400` — Validation error
- `401` — Missing or invalid JWT
- `403` — Authenticated but not authorized (wrong caregiver)
- `404` — Resource not found
- `409` — Conflict (e.g., duplicate email)
- `500` — Internal server error
