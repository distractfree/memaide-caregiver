const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', e => reject(e));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Smoke Test ---');
  try {
    // 1. Caregiver login
    const loginRes = await request('POST', '/api/auth/login', { email: 'demo@memaide.local', password: 'Password123!' });
    console.log('1. Caregiver login:', loginRes.status, JSON.stringify(loginRes.data));
    const token = loginRes.data.data.token;
    const caregiverId = loginRes.data.data.caregiver.id;

    // 2. Patients
    const patientsRes = await request('GET', '/api/patients', null, token);
    console.log('2. Patients:', patientsRes.status);
    let patientId;
    if (patientsRes.data.data && patientsRes.data.data.length > 0) {
      patientId = patientsRes.data.data[0].id;
    } else {
      console.log('No patients found, cannot run patient-specific tests.');
      return;
    }

    // 3. Reminders
    const remRes = await request('GET', `/api/patients/${patientId}/reminders`, null, token);
    console.log('3. Reminders:', remRes.status);

    // 4. Reminder events
    const remEvtRes = await request('GET', `/api/patients/${patientId}/reminder-events`, null, token);
    console.log('4. Reminder events:', remEvtRes.status);

    // 5. Help contact
    const helpConRes = await request('GET', `/api/patients/${patientId}/help-contact`, null, token);
    console.log('5. Help contact:', helpConRes.status);

    // 6. Help events
    const helpEvtRes = await request('GET', `/api/patients/${patientId}/help-events`, null, token);
    console.log('6. Help events:', helpEvtRes.status);

    // 7. Mobile help event
    const mobHelpRes = await request('POST', '/api/mobile/help-events', {
      deviceId: "android-demo-001",
      sourceDevice: "phone",
      status: "triggered"
    });
    console.log('7. Mobile help event:', mobHelpRes.status);
    const helpEventId = mobHelpRes.data.data.id;

    // 8. Mobile AI session start
    const mobAiRes = await request('POST', '/api/mobile/ai-sessions/start', {
      deviceId: "android-demo-001",
      helpEventId: helpEventId,
      sourceDevice: "phone"
    });
    console.log('8. Mobile AI session start:', mobAiRes.status);
    const aiSessionId = mobAiRes.data.data.id;

    // 9. Mobile AI message
    const aiMsgRes = await request('POST', `/api/mobile/ai-sessions/${aiSessionId}/messages`, {
      deviceId: "android-demo-001",
      message: "I fell down and I am hurt",
      senderType: "patient"
    });
    console.log('9. Mobile AI message:', aiMsgRes.status);

    // 10. Caregiver AI sessions
    const careAiRes = await request('GET', `/api/patients/${patientId}/ai-sessions`, null, token);
    console.log('10. Caregiver AI sessions:', careAiRes.status);

    // 11. Stream status
    const streamRes = await request('GET', `/api/patients/${patientId}/stream-status`, null, token);
    console.log('11. Stream status:', streamRes.status);

    // 12. Beacons
    const beaconRes = await request('GET', `/api/patients/${patientId}/beacons`, null, token);
    console.log('12. Beacons:', beaconRes.status);

    // 13. Vitals
    const vitalsRes = await request('GET', `/api/patients/${patientId}/reports/vitals`, null, token);
    console.log('13. Vitals:', vitalsRes.status);

    // 14. Admin login
    const adminLogRes = await request('POST', '/api/admin/login', { password: 'admin123' });
    console.log('14. Admin login:', adminLogRes.status, JSON.stringify(adminLogRes.data));
    const adminToken = adminLogRes.data.token;

    // 15. Admin caregivers
    const adminCareRes = await request('GET', '/api/admin/caregivers', null, adminToken);
    console.log('15. Admin caregivers:', adminCareRes.status);

    // 16. Admin caregiver detail
    const adminCareDetRes = await request('GET', `/api/admin/caregivers/${caregiverId}`, null, adminToken);
    console.log('16. Admin caregiver detail:', adminCareDetRes.status);

    // 17. Admin AI sessions
    const adminAiRes = await request('GET', '/api/admin/ai-sessions', null, adminToken);
    console.log('17. Admin AI sessions:', adminAiRes.status);

    // Check token separation
    const invalidAdminRes = await request('GET', '/api/admin/caregivers', null, token);
    console.log('Check Admin auth with Caregiver token:', invalidAdminRes.status);

    const invalidCareRes = await request('GET', `/api/patients`, null, adminToken);
    console.log('Check Caregiver auth with Admin token:', invalidCareRes.status);

  } catch (err) {
    console.error('Error:', err);
  }
}
run();
