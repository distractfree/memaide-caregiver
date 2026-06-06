# Database Schema Reference

This document explains the Prisma/PostgreSQL schema powering the MemAide backend. 

## Entity Relationship Overview
The system centers around **Caregivers**, who manage multiple **Patients**. Each Patient can have their own set of Reminders, Help Contacts, Beacons, and associated Events. 
Data is strictly partitioned by `caregiverId` for security. Most records cascade on deletion of the parent patient or reminder. Mobile requests use the `deviceId` field on the Patient model to look up associated data without requiring a caregiver session. The event tables power dashboard reports for wellness tracking.

---

### Caregiver
**Purpose:** Represents a registered caregiver who accesses the web portal.
- **Important Fields:** `email` (unique), `passwordHash`, `name`
- **Relationships:** One-to-many with `Patient` (a caregiver has many patients).
- **Usage:** Used in auth endpoints (`/api/auth/*`) and to enforce ownership logic across all patient data.

### Patient
**Purpose:** Represents an elderly patient or care receiver.
- **Important Fields:** `caregiverId`, `name`, `phoneNumber`, `deviceId` (unique identifier for their mobile device/watch).
- **Relationships:** Belongs to a `Caregiver`. Has many `Reminders`, `HelpContacts`, `Beacons`, and various event records (`ReminderEvent`, `HelpEvent`, `BeaconEvent`, `VitalEvent`, `StreamSession`).
- **Cascade Behavior:** Deleting a Caregiver cascades to delete Patients. Deleting a Patient cascades to delete all their related records.
- **Usage:** Used in patient endpoints (`/api/patients/*`) and looked up by `deviceId` in mobile endpoints.

### Reminder
**Purpose:** Represents a scheduled task or activity (e.g., medication, exercise) for a patient.
- **Important Fields:** `patientId`, `type`, `description`, `timeOfDay`, `frequency`, `active`.
- **Relationships:** Belongs to a `Patient`. Has many `ReminderEvents`.
- **Usage:** Configured via `/api/patients/:patientId/reminders` and synced to mobile via `/api/mobile/reminders`.

### ReminderEvent
**Purpose:** Logs the execution and status of a reminder (e.g., "completed", "missed").
- **Important Fields:** `reminderId`, `scheduledAt`, `deliveredAt`, `acknowledgedAt`, `status`, `sourceDevice`.
- **Relationships:** Belongs to a `Reminder` and a `Patient`.
- **Cascade Behavior:** Deleting a Reminder or Patient cascades to delete the events.
- **Usage:** Ingested via `/api/mobile/reminder-events` and aggregated in `/api/patients/:patientId/reports/reminders`.

### HelpContact
**Purpose:** Stores emergency or primary contact information for a patient.
- **Important Fields:** `patientId`, `whatsappNumber`, `label`, `active`.
- **Relationships:** Belongs to a `Patient`.
- **Usage:** Managed via `/api/patients/:patientId/help-contact` and synced to mobile via `/api/mobile/help-contact`.

### HelpEvent
**Purpose:** Logs when a patient initiates a request for help or an emergency call.
- **Important Fields:** `patientId`, `triggeredAt`, `sourceDevice`, `whatsappNumber`, `status`.
- **Relationships:** Belongs to a `Patient`. Has many `StreamSessions` (if a live stream was triggered from a help event).
- **Usage:** Ingested via `/api/mobile/help-events` and queried via `/api/patients/:patientId/help-events`.

### Beacon
**Purpose:** Represents a physical Bluetooth Low Energy (BLE) beacon placed in a specific room.
- **Important Fields:** `patientId`, `roomName`, `beaconUuid`, `major`, `minor`, `thresholdDistanceM`, `dwellSeconds`, `active`.
- **Relationships:** Belongs to a `Patient`. Has many `BeaconEvents`.
- **Usage:** Managed via `/api/patients/:patientId/beacons` and synced to mobile via `/api/mobile/beacons`.

### BeaconEvent
**Purpose:** Logs when a patient enters, dwells in, and exits a room marked by a beacon.
- **Important Fields:** `patientId`, `beaconId`, `roomName`, `detectedAt`, `exitedAt`, `dwellSeconds`, `estimatedDistanceM`.
- **Relationships:** Belongs to a `Patient` and a `Beacon`.
- **Cascade Behavior:** Deleting a Beacon cascades to delete its events.
- **Usage:** Ingested via `/api/mobile/beacon-events` and aggregated for activity tracking via `/api/patients/:patientId/reports/beacons`.

### VitalEvent
**Purpose:** Logs periodic health measurements (e.g., heart rate, steps) from a wearable device.
- **Important Fields:** `patientId`, `timestamp`, `heartRate`, `motionState`, `stepCount`, `sourceDevice`.
- **Relationships:** Belongs to a `Patient`.
- **Usage:** Ingested via `/api/mobile/vital-events` and aggregated for wellness reports via `/api/patients/:patientId/reports/vitals`.

### StreamSession
**Purpose:** Tracks metadata and status for a video/audio streaming session (e.g., from smart glasses).
- **Important Fields:** `patientId`, `helpEventId`, `startedAt`, `endedAt`, `source`, `status`, `viewerUrl`, `metadata`.
- **Relationships:** Belongs to a `Patient`. Optionally relates to a `HelpEvent`.
- **Usage:** Tracked via mobile endpoints (`/api/mobile/stream/*`) and viewed by caregivers via `/api/patients/:patientId/stream-status` and `/api/patients/:patientId/stream-sessions`.

### AiSession
**Purpose:** Tracks an active AI orchestration session linked to an emergency help event.
- **Important Fields:** `patientId`, `helpEventId`, `caregiverId`, `startedAt`, `caregiverJoinedAt`, `emergencySuggestedAt`, `resolvedAt`, `status`, `summary`.
- **Relationships:** Belongs to a `Patient`, a `Caregiver`, and optionally a `HelpEvent`. Has many `AiSessionMessages`.
- **Usage:** Tracked via caregiver/admin endpoints and orchestrates the state machine of an AI intervention.

### AiSessionMessage
**Purpose:** Stores messages (system, user, assistant) within an AI session.
- **Important Fields:** `sessionId`, `role`, `content`, `createdAt`.
- **Relationships:** Belongs to an `AiSession`.
- **Usage:** Stored for history and review by caregivers/admins.

---
**Notes:**
- **Patient Ownership:** Ownership is strictly enforced by querying `where: { caregiverId: req.user.id }` before touching patient data.
- **Mobile deviceId lookup:** Mobile requests provide `deviceId` as a query or body parameter, allowing the backend to map telemetry to the correct Patient without a complex login flow.
- **Event tables power dashboard reports:** Events like `ReminderEvent`, `BeaconEvent`, and `VitalEvent` are queried to provide chronological or aggregated data (e.g., adherence percentage, time spent per room, heart rate trends).
