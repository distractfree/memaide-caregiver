import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// vi.mock calls are hoisted — keep at top before all other imports.

vi.mock("../config/env", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4001,
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/memaide_test",
    JWT_SECRET: "test-jwt-secret-vitest-min16chars",
    JWT_EXPIRES_IN: "1h",
    CORS_ORIGIN: "http://localhost:5273",
  },
}));

vi.mock("../lib/prisma", () => ({
  prisma: {
    patient: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reminder: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rem = prisma.reminder as any;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const PATIENT_B_ID = "patient-b-uuid-002";
const REMINDER_ID = "reminder-uuid-001";
const DEVICE_ID = "android-demo-001";

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const tokenA = makeToken(CAREGIVER_A_ID);
const tokenB = makeToken(CAREGIVER_B_ID);

const samplePatientA = {
  id: PATIENT_A_ID,
  caregiverId: CAREGIVER_A_ID,
  name: "Mary Johnson",
  phoneNumber: "+18185550123",
  deviceId: DEVICE_ID,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const sampleReminder = {
  id: REMINDER_ID,
  patientId: PATIENT_A_ID,
  type: "medication",
  description: "Take morning medication",
  timeOfDay: "08:00",
  frequency: "daily",
  active: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const updatedReminder = {
  ...sampleReminder,
  description: "Take morning medication with water",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Auth guard ────────────────────────────────────────────────────────────────

describe("Auth guard on reminder routes", () => {
  it("GET /api/patients/:patientId/reminders returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/reminders`
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("POST /api/patients/:patientId/reminders returns 401 without a token", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/reminders`)
      .send({ type: "medication", description: "Test", timeOfDay: "08:00", frequency: "daily" });
    expect(res.status).toBe(401);
  });

  it("PUT /api/reminders/:id returns 401 without a token", async () => {
    const res = await request(app)
      .put(`/api/reminders/${REMINDER_ID}`)
      .send({ description: "Updated" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/reminders/:id returns 401 without a token", async () => {
    const res = await request(app).delete(`/api/reminders/${REMINDER_ID}`);
    expect(res.status).toBe(401);
  });
});

// ─── Create ────────────────────────────────────────────────────────────────────

describe("POST /api/patients/:patientId/reminders", () => {
  it("creates a reminder for caregiver's own patient and returns 201", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    rem.create.mockResolvedValue(sampleReminder);

    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "medication",
        description: "Take morning medication",
        timeOfDay: "08:00",
        frequency: "daily",
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe("medication");
    expect(res.body.data.patientId).toBe(PATIENT_A_ID);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(rem.create).toHaveBeenCalledWith({
      data: {
        type: "medication",
        description: "Take morning medication",
        timeOfDay: "08:00",
        frequency: "daily",
        active: true,
        patientId: PATIENT_A_ID,
      },
    });
  });

  it("returns 404 when creating reminder for another caregiver's patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        type: "medication",
        description: "Take morning medication",
        timeOfDay: "08:00",
        frequency: "daily",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(rem.create).not.toHaveBeenCalled();
  });

  it("returns 404 for nonexistent patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/patients/does-not-exist/reminders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "medication",
        description: "Take morning medication",
        timeOfDay: "08:00",
        frequency: "daily",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "medication" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for empty type", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "",
        description: "Take medication",
        timeOfDay: "08:00",
        frequency: "daily",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid timeOfDay format", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "medication",
        description: "Take medication",
        timeOfDay: "8:00am",
        frequency: "daily",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

// ─── List ──────────────────────────────────────────────────────────────────────

describe("GET /api/patients/:patientId/reminders", () => {
  it("returns reminders for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    rem.findMany.mockResolvedValue([sampleReminder]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(REMINDER_ID);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
  });

  it("returns 404 for another caregiver's patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reminders`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(rem.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for nonexistent patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/does-not-exist/reminders`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

// ─── Update ────────────────────────────────────────────────────────────────────

describe("PUT /api/reminders/:id", () => {
  it("updates the reminder and returns 200", async () => {
    rem.findFirst.mockResolvedValue(sampleReminder);
    rem.update.mockResolvedValue(updatedReminder);

    const res = await request(app)
      .put(`/api/reminders/${REMINDER_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ description: "Take morning medication with water" });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe("Take morning medication with water");
    expect(rem.findFirst).toHaveBeenCalledWith({
      where: { id: REMINDER_ID, patient: { caregiverId: CAREGIVER_A_ID } },
    });
    expect(rem.update).toHaveBeenCalledWith({
      where: { id: REMINDER_ID },
      data: { description: "Take morning medication with water" },
    });
  });

  it("returns 404 when updating another caregiver's reminder", async () => {
    rem.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/reminders/${REMINDER_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ description: "Hacked" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(rem.update).not.toHaveBeenCalled();
  });

  it("returns 404 for nonexistent reminder", async () => {
    rem.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/reminders/does-not-exist`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ description: "Updated" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 400 for empty update body", async () => {
    const res = await request(app)
      .put(`/api/reminders/${REMINDER_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid field value (empty string)", async () => {
    const res = await request(app)
      .put(`/api/reminders/${REMINDER_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

// ─── Delete ────────────────────────────────────────────────────────────────────

describe("DELETE /api/reminders/:id", () => {
  it("deletes the reminder and returns 200", async () => {
    rem.findFirst.mockResolvedValue(sampleReminder);
    rem.delete.mockResolvedValue(sampleReminder);

    const res = await request(app)
      .delete(`/api/reminders/${REMINDER_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(rem.findFirst).toHaveBeenCalledWith({
      where: { id: REMINDER_ID, patient: { caregiverId: CAREGIVER_A_ID } },
    });
    expect(rem.delete).toHaveBeenCalledWith({ where: { id: REMINDER_ID } });
  });

  it("returns 404 when deleting another caregiver's reminder", async () => {
    rem.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/reminders/${REMINDER_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(rem.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for nonexistent reminder", async () => {
    rem.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/reminders/does-not-exist`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

// ─── Mobile sync ───────────────────────────────────────────────────────────────

describe("GET /api/mobile/reminders", () => {
  it("returns active reminders for a known deviceId", async () => {
    pat.findUnique.mockResolvedValue({
      id: PATIENT_A_ID,
      name: "Mary Johnson",
      deviceId: DEVICE_ID,
    });
    rem.findMany.mockResolvedValue([sampleReminder]);

    const res = await request(app).get(
      `/api/mobile/reminders?deviceId=${DEVICE_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patient.id).toBe(PATIENT_A_ID);
    expect(res.body.data.patient.deviceId).toBe(DEVICE_ID);
    expect(res.body.data.reminders).toHaveLength(1);
    expect(res.body.data.reminders[0].type).toBe("medication");
    expect(pat.findUnique).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID },
      select: { id: true, name: true, deviceId: true },
    });
    expect(rem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: PATIENT_A_ID, active: true },
      })
    );
  });

  it("returns 400 when deviceId query param is missing", async () => {
    const res = await request(app).get("/api/mobile/reminders");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when deviceId does not match any patient", async () => {
    pat.findUnique.mockResolvedValue(null);

    const res = await request(app).get(
      "/api/mobile/reminders?deviceId=unknown-device"
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("does not require authentication", async () => {
    pat.findUnique.mockResolvedValue({
      id: PATIENT_A_ID,
      name: "Mary Johnson",
      deviceId: DEVICE_ID,
    });
    rem.findMany.mockResolvedValue([]);

    const res = await request(app).get(
      `/api/mobile/reminders?deviceId=${DEVICE_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.reminders).toHaveLength(0);
  });
});
