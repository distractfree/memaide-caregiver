# Demo Script

### 1. Start the Application
- Open a terminal and run the backend:
  ```bash
  cd server
  npm run dev
  ```
- Open a second terminal and run the frontend:
  ```bash
  cd client
  npm run dev
  ```

### 2. Login
- Open a browser and navigate to `http://localhost:5273`.
- Log in using the test credentials:
  - **Email:** demo@memaide.local
  - **Password:** Password123!
- *(Optional)* Demonstrate creating a new caregiver account by toggling to the "Create Account" tab and completing the registration.

### 3. Patient Selection
- Go to **Patients** on the sidebar or via the overview.
- Select the patient **Mary Johnson**.
- Briefly explain how the backend connects patient configurations to the caregiver profile via the relational database.

### 4. Application Tour
- **Dashboard:** Show the current overview.
- **Reminders & Reminder Reports:** Show where schedules are configured and point out how the backend handles event ingestion to display acknowledgment history.
- **Help:** Show the WhatsApp contacts list.
- **Beacons & Beacon Reports:** Explain the REST API logic that handles room beacon setup and ingests proximity events from the device.
- **Wellness Trends:** Show the vitals charts populated from the backend.
- **Stream Status & Settings:** Finish the tour showing stream statuses.
- **AI Support Sessions:** Explain how the mobile app can manually start a scripted AI session after an emergency help event is created, and demonstrate the safe scripted flow and emergency suggestion handling without using real LLMs or real emergency services.

### 5. Admin Portal Tour
- **Admin Login:** Open `http://localhost:5273/admin` and explain how admin auth is entirely separate from caregiver auth, using its own JWT token and a plain `.env` password for student demo simplicity.
- **Admin Dashboard:** Log in with the admin password. Show the read-only list of caregivers and summary metrics.
- **Caregiver Details:** Click "View details" for a caregiver to show the `AdminCaregiverDetailPage`.
- **Patient Context Panel:** Click on a patient to open the context panel, explaining that it displays only safe, non-medical context (e.g., "Independent living support profile"). Mention that caregiver Enable/Disable features are deferred to a future schema update.

### 6. Safe Positioning Disclaimer
During the presentation, clearly state:
> "MemAide provides caregiver coordination, reminder support, wellness trends, and approximate BLE proximity. **It is not a medical device.** Wellness data is only general context for independent living support, and BLE proximity is approximate. The Help feature coordinates communication, and the Stream feature shows patient perspective stream status without promising a video call or replacing WhatsApp camera feeds."
