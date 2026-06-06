# Database Schema Summary

The PostgreSQL database for MemAide uses Prisma ORM. Below is a summary of the core tables and how they support the backend responsibilities of Student 2.

## Main Tables / Models

- **Caregiver (`caregivers`)**
  - Stores caregiver credentials, names, and authentication details.
  - Relates to multiple patients.

- **Patient (`patients`)**
  - Stores patient profiles, phone numbers, and device IDs linked to a caregiver.
  - Central model that relates to reminders, events, contacts, beacons, and streams.

- **Reminder (`reminders`) & ReminderEvent (`reminder_events`)**
  - `reminders` stores schedules and configurations for medication, hydration, or care tasks.
  - `reminder_events` logs actual instances, including delivery and acknowledgment status.

- **HelpContact (`help_contacts`) & HelpEvent (`help_events`)**
  - `help_contacts` stores WhatsApp numbers and labels for primary contacts.
  - `help_events` logs when a patient requests help, storing device source and status.

- **Beacon (`beacons`) & BeaconEvent (`beacon_events`)**
  - `beacons` stores configuration for room beacons (UUID, major, minor).
  - `beacon_events` logs when a patient device detects a beacon, storing approximate dwell times and distance.

- **VitalEvent (`vital_events`)**
  - Logs best-effort wellness signals like heart rate, motion state, and step counts over time.

- **StreamSession (`stream_sessions`)**
  - Records stream session status and metadata, linked optionally to help events.

## Relationship Summary
- A **Caregiver** has many **Patients**.
- A **Patient** has many **Reminders**, **HelpContacts**, **Beacons**, and multiple event logs (Reminder, Help, Beacon, Vital, Stream).
- This relational structure allows the caregiver to view consolidated reports (reminders, beacons, wellness) and manage configurations for each connected patient safely and securely.

## Support of Student 2 Responsibilities
This schema supports Student 2's API, reporting, and event logging work. It keeps setup data (Reminders, Beacons, Contacts) separate from event data (ReminderEvent, BeaconEvent, VitalEvent), so the frontend can show history in reports.

## Admin MVP Note
**No schema migration required for Admin MVP.**
The admin features are built on top of the existing schema. Administrator credentials are authenticated via environment variables (`ADMIN_PASSWORD`) instead of a new `admin_users` table to meet the "Do not overbuild" requirement. This is intentionally simple for the student MVP/demo; for production, password hashing or a real admin user table would be recommended. Admin JWT is still separate from caregiver JWT. Additionally, Caregiver Enable/Disable features are deferred until future schema iterations support `isEnabled` and `disabledAt` fields.
