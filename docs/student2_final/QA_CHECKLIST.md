# QA Checklist

## Build Checks
- [x] Backend runs cleanly (`npm run dev` on port 4000).
- [x] Frontend runs cleanly (`npm run dev` on port 5273).
- [x] No breaking build errors.

## Backend Checks
- [x] PostgreSQL database connects successfully.
- [x] Prisma schema is properly migrated.
- [x] REST API endpoints return successful responses for auth and data.
- [x] Test data (demo user, patients) is seeded and accessible.

## Frontend Route Checks
- [x] `/` (Dashboard) loads successfully.
- [x] `/patients` loads successfully.
- [x] `/reminders` loads successfully.
- [x] `/reports/reminders` loads successfully.
- [x] `/help` loads successfully.
- [x] `/beacons` loads successfully.
- `/reports/beacons` loads successfully.
- `/reports/vitals` loads successfully.
- `/stream` loads successfully.
- `/settings` loads successfully.
- AI Session Backend tests pass successfully.
- `/admin` (Admin Portal) loads successfully.
- [x] `/admin/caregivers/:caregiverId` (Admin Caregiver Detail) loads successfully.

## Application Flow Checks
- [x] Login successfully with `demo@memaide.local` / `Password123!`.
- [x] Signup works end-to-end:
  - [x] valid signup
  - [x] duplicate email
  - [x] invalid password
  - [x] mismatched password
  - [x] auth persistence after signup
  - [x] zero-patient state
- [x] Patient selector works (successfully selected Mary Johnson).
- [x] Data populates correctly on reports for the selected patient.
- [x] Admin flow works:
  - [x] Admin auth separates from caregiver auth
  - [x] Admin login redirects to admin dashboard
  - [x] Admin dashboard shows caregiver counts
  - [x] View details opens caregiver detail view
  - [x] Patient context panel displays safe context only

## Screenshot Checklist
- [x] 00-auth-signin.png captured.
- [x] 00-auth-signup.png captured.
- [x] 01-dashboard.png captured.
- [x] 02-patients.png captured.
- [x] 03-reminders.png captured.
- [x] 04-reminder-reports.png captured.
- [x] 05-help.png captured.
- [x] 06-beacons.png captured.
- [x] 07-beacon-reports.png captured.
- [x] 08-wellness-trends.png captured.
- [x] 09-stream-status.png captured.
- [x] 10-settings.png captured.
- [ ] 11-admin-login.png captured (Placeholder: Needs manual capture).
- [ ] 12-admin-dashboard.png captured (Placeholder: Needs manual capture).
- [ ] 13-admin-caregiver-detail.png captured (Placeholder: Needs manual capture).
- [ ] 14-admin-patient-context.png captured (Placeholder: Needs manual capture).
- [ ] 15-caregiver-ai-session.png captured (Placeholder: Needs manual capture).
- [ ] 16-admin-ai-session-modal.png captured (Placeholder: Needs manual capture).

## Known Issues
- Build passes successfully.
- Minor Vite chunk-size warnings or existing lint warnings may exist in console output during frontend build, but are non-blocking.
