type JsonRecord = Record<string, unknown>;

const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const DEVICE_ID = "android-demo-001";
const DEMO_EMAIL = "demo@memaide.local";
const DEMO_PASSWORD = "Password123!";

type RequestOptions = {
  method?: string;
  token?: string;
  body?: JsonRecord;
  expectedStatus?: number | number[];
  requireSuccess?: boolean;
};

class SmokeTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmokeTestError";
  }
}

function expectedStatuses(value?: number | number[]) {
  if (Array.isArray(value)) return value;
  return [value ?? 200];
}

async function request(path: string, options: RequestOptions = {}) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const validStatuses = expectedStatuses(options.expectedStatus);

  if (!validStatuses.includes(response.status)) {
    throw new SmokeTestError(
      `${method} ${path} returned ${response.status}; expected ${validStatuses.join(
        "/"
      )}. Body: ${text}`
    );
  }

  if (options.requireSuccess !== false && payload?.success !== true) {
    throw new SmokeTestError(
      `${method} ${path} did not return { success: true }. Body: ${text}`
    );
  }

  console.log(`PASS ${method} ${path}`);
  return payload;
}

function requireObject(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SmokeTestError(`${label} was not an object`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new SmokeTestError(`${label} was not an array`);
  }
  return value as JsonRecord[];
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SmokeTestError(`${label} was not a non-empty string`);
  }
  return value;
}

function requireData(payload: unknown, label: string) {
  const object = requireObject(payload, label);
  if (!("data" in object)) {
    throw new SmokeTestError(`${label} did not include data`);
  }
  return object.data;
}

async function login() {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    }),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (response.status !== 200 || payload?.success !== true) {
    throw new SmokeTestError(
      `Demo login failed. Run migrations and npm run prisma:seed before smoke testing. Body: ${text}`
    );
  }

  console.log("PASS POST /api/auth/login");
  const data = requireObject(payload.data, "login data");
  return requireString(data.token, "login token");
}

function findMary(patients: JsonRecord[]) {
  const mary = patients.find((patient) => patient.deviceId === DEVICE_ID);
  if (!mary) {
    throw new SmokeTestError(
      `Patient with deviceId ${DEVICE_ID} was not found. Run npm run prisma:seed first.`
    );
  }
  return mary;
}

async function main() {
  console.log(`Smoke testing ${API_BASE_URL}`);

  const health = await request("/api/health", { requireSuccess: false });
  if (health?.status !== "ok") {
    throw new SmokeTestError("Health endpoint did not return status ok");
  }

  const token = await login();
  await request("/api/auth/me", { token });

  const patientsPayload = await request("/api/patients", { token });
  const patients = requireArray(requireData(patientsPayload, "patients response"), "patients data");
  const mary = findMary(patients);
  const patientId = requireString(mary.id, "Mary Johnson id");

  const remindersPayload = await request(`/api/patients/${patientId}/reminders`, {
    token,
  });
  const reminders = requireArray(
    requireData(remindersPayload, "reminders response"),
    "reminders data"
  );
  if (reminders.length === 0) {
    throw new SmokeTestError("Seeded patient has no reminders");
  }
  const reminderId = requireString(reminders[0].id, "reminder id");

  const mobileRemindersPayload = await request(
    `/api/mobile/reminders?deviceId=${encodeURIComponent(DEVICE_ID)}`
  );
  const mobileRemindersData = requireObject(
    requireData(mobileRemindersPayload, "mobile reminders response"),
    "mobile reminders data"
  );
  if (requireArray(mobileRemindersData.reminders, "mobile reminders").length === 0) {
    throw new SmokeTestError("Mobile reminder sync returned no reminders");
  }

  await request("/api/mobile/reminder-events", {
    method: "POST",
    expectedStatus: 201,
    body: {
      deviceId: DEVICE_ID,
      reminderId,
      scheduledAt: "2026-05-23T16:00:00.000Z",
      status: "acknowledged",
      sourceDevice: "phone",
    },
  });
  await request(`/api/patients/${patientId}/reports/reminders`, { token });

  await request(`/api/patients/${patientId}/help-contact`, { token });
  await request(`/api/mobile/help-contact?deviceId=${encodeURIComponent(DEVICE_ID)}`);
  await request("/api/mobile/help-events", {
    method: "POST",
    expectedStatus: 201,
    body: {
      deviceId: DEVICE_ID,
      sourceDevice: "watch",
      status: "triggered",
      triggeredAt: "2026-05-23T16:05:00.000Z",
    },
  });
  await request(`/api/patients/${patientId}/help-events`, { token });

  const beaconsPayload = await request(`/api/patients/${patientId}/beacons`, {
    token,
  });
  const beacons = requireArray(requireData(beaconsPayload, "beacons response"), "beacons data");
  if (beacons.length === 0) {
    throw new SmokeTestError("Seeded patient has no beacons");
  }
  const beaconId = requireString(beacons[0].id, "beacon id");

  const mobileBeaconsPayload = await request(
    `/api/mobile/beacons?deviceId=${encodeURIComponent(DEVICE_ID)}`
  );
  const mobileBeaconsData = requireObject(
    requireData(mobileBeaconsPayload, "mobile beacons response"),
    "mobile beacons data"
  );
  if (requireArray(mobileBeaconsData.beacons, "mobile beacons").length === 0) {
    throw new SmokeTestError("Mobile beacon sync returned no beacons");
  }

  await request("/api/mobile/beacon-events", {
    method: "POST",
    expectedStatus: 201,
    body: {
      deviceId: DEVICE_ID,
      beaconId,
      detectedAt: "2026-05-23T16:10:00.000Z",
      dwellSeconds: 8,
      estimatedDistanceM: 2.4,
      sourceDevice: "phone",
    },
  });
  await request(`/api/patients/${patientId}/reports/beacons`, { token });

  await request("/api/mobile/vital-events", {
    method: "POST",
    expectedStatus: 201,
    body: {
      deviceId: DEVICE_ID,
      timestamp: "2026-05-23T16:15:00.000Z",
      heartRate: 78,
      motionState: "walking",
      stepCount: 2600,
      sourceDevice: "watch",
    },
  });
  await request(`/api/patients/${patientId}/reports/vitals`, { token });

  const streamStartPayload = await request("/api/mobile/stream/start", {
    method: "POST",
    expectedStatus: 201,
    body: {
      deviceId: DEVICE_ID,
      source: "mock",
      status: "active",
      viewerUrl: "https://example.com/view/smoke-session",
      metadata: { smokeTest: true },
    },
  });
  const streamSession = requireObject(
    requireData(streamStartPayload, "stream start response"),
    "stream session"
  );
  const streamSessionId = requireString(streamSession.id, "stream session id");

  const streamStatusPayload = await request(
    `/api/patients/${patientId}/stream-status`,
    { token }
  );
  const streamStatus = requireObject(
    requireData(streamStatusPayload, "stream status response"),
    "stream status"
  );
  if (streamStatus.hasActiveStream !== true) {
    throw new SmokeTestError("Stream status did not report an active stream");
  }

  await request("/api/mobile/stream/stop", {
    method: "POST",
    body: {
      deviceId: DEVICE_ID,
      streamSessionId,
      status: "ended",
    },
  });

  console.log("Smoke test completed successfully");
}

main().catch((error) => {
  console.error("Smoke test failed");
  console.error(error);
  process.exitCode = 1;
});
