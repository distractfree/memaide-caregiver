# Frontend Integration Guide

This guide is for the React/Tailwind caregiver portal team to connect with the MemAide backend API.

## Backend Base URL
During local development, the backend runs at:
```text
http://localhost:4000
```

## Authentication Flow
1. **Login:** Send a `POST` request to `/api/auth/login` with email and password.
2. **Store JWT:** Extract the `token` from the response. Store this token securely (e.g., in localStorage or a secure HTTP-only cookie, depending on your frontend architecture).
3. **Attach Authorization Header:** For all subsequent requests to protected endpoints, attach the token in the `Authorization` header:
   ```text
   Authorization: Bearer <your_jwt_token>
   ```
4. **Verify Session:** You can fetch the current logged-in caregiver profile using `GET /api/auth/me`.

## Patient Selector Strategy
A caregiver manages multiple patients. Upon login, fetch the list of patients via `GET /api/patients`. 
It is recommended to have a global state (e.g., React Context or Redux) tracking the currently "selected" patient. Almost all dashboard and management endpoints require a `patientId` in the URL (e.g., `/api/patients/:patientId/reminders`).

## Dashboard Data Sources
The patient dashboard provides a high-level view of wellness and activity.
- **Summary Cards:** Can be populated using:
  - `GET /api/patients/:patientId/reports/reminders` (Adherence rates)
  - `GET /api/patients/:patientId/reports/beacons` (Room activity/dwell times)
  - `GET /api/patients/:patientId/reports/vitals` (Heart rate/step count trends)
  - `GET /api/patients/:patientId/stream-status` (Current smart-glasses connection status)
  - `GET /api/patients/:patientId/help-events` (Recent emergency/help requests)

## Page-to-Endpoint Mapping

| Frontend Page / Component | Backend Endpoints |
| :--- | :--- |
| **Login Page** | `POST /api/auth/login`, `POST /api/auth/register` |
| **Patient Selector** | `GET /api/patients` |
| **Patient Profile** | `GET /api/patients/:id`, `PUT /api/patients/:id`, `POST /api/patients` |
| **Reminder Management** | `GET /api/patients/:patientId/reminders`, `POST /api/patients/:patientId/reminders`, `PUT /api/reminders/:id`, `DELETE /api/reminders/:id` |
| **Reminder Reports** | `GET /api/patients/:patientId/reports/reminders` |
| **Wellness/Vitals Trends**| `GET /api/patients/:patientId/reports/vitals`, `GET /api/patients/:patientId/vitals` |
| **Beacon Configuration** | `GET /api/patients/:patientId/beacons`, `POST /api/patients/:patientId/beacons`, `PUT /api/beacons/:id`, `DELETE /api/beacons/:id` |
| **Beacon Event Log** | `GET /api/patients/:patientId/reports/beacons`, `GET /api/patients/:patientId/beacon-events` |
| **Help / Stream Status** | `GET /api/patients/:patientId/help-contact`, `POST /api/patients/:patientId/help-contact`, `GET /api/patients/:patientId/help-events`, `GET /api/patients/:patientId/stream-status` |

## Important Considerations & UI Wording
- **Mobile Endpoints:** Endpoints prefixed with `/api/mobile/` are exclusively for the Android/Wear OS applications and should **not** be called from the caregiver portal unless specifically testing mobile behavior.
- **Wording:** Use "Wellness trends," **not** "Diagnosis."
- **Wording:** Use "Approximate BLE proximity," **not** "Exact indoor location."
- **Wording:** Use "Patient perspective stream status," **not** implying a guaranteed live medical feed.

## Suggested Frontend API Service Pattern
Consider creating a centralized API client using `axios` or `fetch` that automatically attaches the Bearer token to all requests. This ensures authentication is handled seamlessly across all components.

## Recommended UI States
Always handle:
- **Loading state:** While data is fetching.
- **Error state:** If the API returns a 4xx or 5xx error (especially 401 Unauthorized, which should trigger a logout/redirect).
- **Empty state:** If a list endpoint returns an empty array (e.g., "No reminders found for this patient").
