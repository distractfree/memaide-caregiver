# memaide-caregiver
Recommended Repo Structure:

memaide-caregiver/
  backend/
  caregiver-portal/
  mobile-android/
  watch-wearos/
  docs/
  deployment/
  README.md


Branch strategy

Use:
main        stable/demo branch
dev         integration branch
feature/*  student work branches


Rules:

* Students push to feature/student-name-feature
* Pull request into dev
* You test dev
* Merge dev into main for stable demo


Exammple Commands:
git checkout -b feature/reminders
git add .
git commit -m "Add reminder CRUD"
git push origin feature/reminders



3) Server deployment workflow

A. Clone repo on server

Login as your deployment user:

ssh fariborz@YOUR_SERVER_IP
mkdir -p ~/apps
cd ~/apps
git clone git@github.com:GuardiaNova/memaide-caregiver.git
cd memaide-caregiver

If using HTTPS:

git clone https://github.com/GuardiaNova/memaide-caregiver.git

SSH deploy key is better later.

⸻

B. Backend runtime recommendation

For student project:

* Backend: Node.js/Express or FastAPI
* Database: PostgreSQL
* Frontend: React
* Reverse proxy: Nginx
* Process manager: PM2 for Node or systemd for Python

Install Node:

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v

Install PostgreSQL:

sudo apt install -y postgresql postgresql-contrib

⸻

4) Real-time integration/testing workflow

Recommended flow:

Student pushes branch
→ Pull Request
→ merge to dev
→ server pulls dev
→ restart backend/frontend
→ everyone tests same live server

Manual deploy command on server:

cd ~/apps/memaide-caregiver
git checkout dev
git pull origin dev

Then, for backend:

cd backend
npm install
npm run build
pm2 restart memaide-backend

For React portal:

cd caregiver-portal
npm install
npm run build
sudo cp -r dist/* /var/www/memaide/

⸻

5) Recommended GitHub Actions later

Once basic manual deploy works, add CI/CD:

push to dev
→ run tests
→ SSH into DigitalOcean
→ git pull
→ rebuild
→ restart services

---

## Local QA Commands

To run lints, tests, and build validation locally, use the following commands:

### Server (Backend)
```bash
cd server
npm run lint --if-present
npm test --if-present
npm run build --if-present
```

### Client (Caregiver Portal)
```bash
cd client
npm run lint --if-present
npm test --if-present
npm run build --if-present
```

### End-to-End Smoke Test
To verify the backend APIs end-to-end, execute the following command from the repository root directory:
```bash
node smoke.js
```
*(Ensure the backend development server is running on `http://localhost:4000` before running the smoke script. The script automatically reads `process.env.ADMIN_PASSWORD` or falls back to the default demo password `"admin123"`).*

---

## Manual Browser Smoke Checklist

Ensure the caregiver portal works correctly by walking through the following checklist:

1. **Service Startup:** Start backend (`cd server; npm run dev`) and frontend (`cd client; npm run dev`).
2. **Authentication:** Navigate to `http://localhost:5273` and log in with the demo caregiver account (`demo@memaide.local` / `Password123!`).
3. **Dashboard Overview:** Confirm that the **Patient Care Snapshot** card and its 4 compact status tiles load successfully.
4. **Data Refresh:** Click **Refresh snapshot** and verify that the "Last updated" time updates correctly.
5. **Patient Switching:** Select the patient dropdown in the Topbar and switch to another patient (e.g., from *Mary Johnson* to *Robert Lee*). Confirm that the old patient's details are cleared and the new patient's snapshot details, recent activity, and device info load correctly.
6. **Help Flow:** Open the **Help** page from the sidebar and verify that it loads the correct patient context, active WhatsApp caregiver contacts, and AI support session history.
7. **Stream Flow:** Open the **Stream Status** page and verify the current session status and stream history are shown.
8. **Layout Check:** Confirm there is no horizontal scroll/overflow on mobile or tablet screen sizes, and that the navigation drawer opens and closes cleanly.
9. **Console Validation:** Open browser Developer Tools (`F12`) and confirm there are no console errors.

---

## Public Deployment Validation Checklist

> [!WARNING]
> Do NOT deploy the codebase or change any live production configurations during this validation step.

### Public Environments

* **Frontend Caregiver Portal:** [http://134.122.115.15:5273](http://134.122.115.15:5273)
* **Backend REST API:** [http://134.122.115.15:4000](http://134.122.115.15:4000)
* **Backend Health Status:** [http://134.122.115.15:4000/api/health](http://134.122.115.15:4000/api/health)

### Verification Checks (Post-Deployment)

1. Navigate to `/api/health` and verify that the status returns `{"status":"ok"}`.
2. Open the public caregiver portal URL and verify that the page loads cleanly.
3. Log in using the registered caregiver credentials.
4. Verify that the **Overview** dashboard and **Patient Care Snapshot** load successfully.
5. Click **Refresh snapshot** to ensure backend report APIs are fully functional.
6. Verify that switching the selected patient in the Topbar updates the page context dynamically.
7. Click through the **Help** and **Stream Status** sidebar routes to verify Nginx route proxying.
8. Verify that `GET /api/mobile/patients` returns the caregiver's patients when queried with a valid authorization token.
9. Verify that the mobile app is configured to use the public URL (`http://134.122.115.15:4000`) instead of `localhost`.

---

## Database Operations & Safety Warnings

### Safe Commands
These commands are safe to run to verify database status or restart services:
* `docker compose up -d` — Start the database containers.
* `docker compose restart postgres` — Restart the database process.
* `pm2 restart memaide-backend --update-env` — Safe backend service reload.
* `pm2 restart memaide-frontend` — Safe frontend portal reload.

### Dangerous Commands
> [!CAUTION]
> Avoid running the following commands under normal operations, especially in shared or production environments, as they cause immediate and permanent data loss:
* `docker compose down -v` — Deletes the Docker database volume, which permanently deletes all registered caregiver accounts, patient records, reminder schedules, and historical events.
* `npx prisma migrate reset` — Re-creates the database from scratch, deleting all existing data.
* `DROP DATABASE memaide` / `CREATE DATABASE memaide` — Manually drops database tables.

---

## Demo Seed Guidelines

* Seeding the database via `npx prisma db seed` is fully safe to run locally or in a sandbox demo context, as it utilizes safe `upsert` queries to prevent duplicate insertions and does not truncate data.
* **Important:** Do NOT run the seed command on the live/production server unless you intentionally wish to overwrite or append default testing datasets to the production environment.

---

## Mobile Integration & Pairing Guidelines

The mobile API accepts two kinds of bearer token. **The patient-facing Android app uses the patient flow.** The caregiver flow below is unchanged and remains available for existing integrations.

### Patient flow (patient-facing Android app)

1. **API URL:** As in the caregiver flow below — never `localhost` on a physical device.
2. **Login:** The patient enters **their own phone number** in E.164 form and the app calls `POST /api/mobile/patient-login`. The response returns a patient-scoped token and only that patient's `id`.
3. **No patient selection:** The app must **not** call `GET /api/mobile/patients` — it is caregiver-only and returns `403 CAREGIVER_ONLY` for a patient token. The patient never sees or picks from a patient list.
4. **No `deviceId`:** The patient token identifies the patient. Sending a `deviceId` is accepted but ignored for identity and can never select a different patient.
5. **Token handling:** Store the token securely, send it as `Authorization: Bearer <PATIENT_JWT>`, clear it on `401` and return to the login screen, and clear it on local logout/reset. Never store a caregiver JWT in the patient app.
6. **Demo-only limitation:** Phone-number login is **prototype authentication only** and is not suitable for real production patient data without SMS OTP or a PIN. See `docs/MOBILE_API_CONTRACT.md` → "Security limitations".

See `docs/MOBILE_INTEGRATION_GUIDE.md` for the full app flow and error handling.

### Caregiver flow (existing integrations)

For successful pairing and integration with a caregiver-operated mobile client, ensure the following requirements are met:

1. **API URL:** The phone/mobile app must point to the public backend URL (`http://134.122.115.15:4000`) for remote testing, or the local LAN IP when running locally (do not use `localhost` on a physical device).
2. **Initial Sync:** The mobile app must authenticate first (login) before making request calls.
3. **Account Linkage:** The mobile client must fetch the available patient profiles by invoking `GET /api/mobile/patients` using the logged-in caregiver token.
4. **Dynamic Pairing:** The mobile application must sync and pair using the returned `deviceId` from the server. **Do not hardcode old device IDs** (such as `wewe` or outdated sandbox values) in the mobile client.
5. **API Errors:** If the mobile app receives a `404 Not Found` with the message `No patient found for this device`, it indicates that the endpoint is functioning correctly, but the requested `deviceId` is not currently registered or assigned to a patient in the database.
