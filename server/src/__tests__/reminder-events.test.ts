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
    reminderEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rem = prisma.reminder as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const evt = prisma.reminderEvent as any;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const REMINDER_ID = "reminder-uuid-001";
const EVENT_ID = "event-uuid-001";
const DEVICE_ID = "android-demo-001";

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const tokenA = makeToken(CAREGIVER_A_ID);
const tokenB = makeToken(CAREGIVER_B_ID);

const mobileRequest = {
  get: (path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${tokenA}`),
  post: (path: string) =>
    request(app).post(path).set("Authorization", `Bearer ${tokenA}`),
};

const SCHEDULED_AT = new Date("2026-05-22T08:00:00.000Z");
const DELIVERED_AT = new Date("2026-05-22T08:00:05.000Z");
const ACKNOWLEDGED_AT = new Date("2026-05-22T08:03:05.000Z");

const samplePatientA = {
  id: PATIENT_A_ID,
  caregiverId: CAREGIVER_A_ID,
  name: "Mary Johnson",
  deviceId: DEVICE_ID,
};

const sampleReminder = {
  id: REMINDER_ID,
  patientId: PATIENT_A_ID,
  type: "medication",
  description: "Take morning medication",
  timeOfDay: "08:00",
  frequency: "daily",
  active: true,
};

const deliveredEvent = {
  id: EVENT_ID,
  reminderId: REMINDER_ID,
  patientId: PATIENT_A_ID,
  scheduledAt: SCHEDULED_AT,
  deliveredAt: DELIVERED_AT,
  acknowledgedAt: null,
  status: "delivered",
  sourceDevice: "phone",
  createdAt: DELIVERED_AT,
  updatedAt: DELIVERED_AT,
};

const acknowledgedEvent = {
  ...deliveredEvent,
  id: "event-uuid-002",
  acknowledgedAt: ACKNOWLEDGED_AT,
  status: "acknowledged",
  sourceDevice: "watch",
};

const missedEvent = {
  ...deliveredEvent,
  id: "event-uuid-003",
  deliveredAt: null,
  acknowledgedAt: null,
  status: "missed",
};

const eventWithReminder = {
  ...acknowledgedEvent,
  reminder: {
    id: REMINDER_ID,
    type: "medication",
    description: "Take morning medication",
    timeOfDay: "08:00",
    frequency: "daily",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Mobile event ingestion ────────────────────────────────────────────────────

describe("POST /api/mobile/reminder-events", () => {
  beforeEach(() => {
    pat.findFirst.mockResolvedValue(samplePatientA);
  });

  it("creates a delivered event for a valid deviceId and reminderId", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    rem.findFirst.mockResolvedValue({ id: REMINDER_ID });
    evt.create.mockResolvedValue(deliveredEvent);

    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        deliveredAt: "2026-05-22T08:00:05.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("delivered");
    expect(res.body.data.sourceDevice).toBe("phone");
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { caregiverId: CAREGIVER_A_ID, deviceId: DEVICE_ID },
      select: { id: true, name: true, deviceId: true },
    });
    expect(rem.findFirst).toHaveBeenCalledWith({
      where: { id: REMINDER_ID, patientId: PATIENT_A_ID },
      select: { id: true },
    });
    expect(evt.create).toHaveBeenCalledOnce();
  });

  it("creates an acknowledged event from watch", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    rem.findFirst.mockResolvedValue({ id: REMINDER_ID });
    evt.create.mockResolvedValue(acknowledgedEvent);

    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        deliveredAt: "2026-05-22T08:00:05.000Z",
        acknowledgedAt: "2026-05-22T08:03:05.000Z",
        status: "acknowledged",
        sourceDevice: "watch",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("acknowledged");
    expect(res.body.data.sourceDevice).toBe("watch");
    expect(evt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "acknowledged",
          sourceDevice: "watch",
        }),
      })
    );
  });

  it("creates a missed event with null acknowledgedAt", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    rem.findFirst.mockResolvedValue({ id: REMINDER_ID });
    evt.create.mockResolvedValue(missedEvent);

    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "missed",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("missed");
    expect(evt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acknowledgedAt: null,
        }),
      })
    );
  });

  it("returns 400 when deviceId is missing", async () => {
    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(evt.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "unknown-status",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for an invalid sourceDevice value", async () => {
    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "delivered",
        sourceDevice: "smartwatch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when deviceId does not match any patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: "unknown-device",
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(evt.create).not.toHaveBeenCalled();
  });

  it("returns 404 when reminderId does not belong to the patient", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    rem.findFirst.mockResolvedValue(null);

    const res = await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: "wrong-reminder-id",
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(evt.create).not.toHaveBeenCalled();
  });

  it("defaults deliveredAt to server time when status is delivered and deliveredAt is omitted", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    rem.findFirst.mockResolvedValue({ id: REMINDER_ID });
    evt.create.mockResolvedValue(deliveredEvent);

    await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });

    expect(evt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveredAt: expect.any(Date),
        }),
      })
    );
  });

  it("defaults acknowledgedAt to server time when status is acknowledged and acknowledgedAt is omitted", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    rem.findFirst.mockResolvedValue({ id: REMINDER_ID });
    evt.create.mockResolvedValue(acknowledgedEvent);

    await mobileRequest.post("/api/mobile/reminder-events")
      .send({
        deviceId: DEVICE_ID,
        reminderId: REMINDER_ID,
        scheduledAt: "2026-05-22T08:00:00.000Z",
        status: "acknowledged",
        sourceDevice: "watch",
      });

    expect(evt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acknowledgedAt: expect.any(Date),
        }),
      })
    );
  });
});

// ─── Caregiver event list ──────────────────────────────────────────────────────

describe("GET /api/patients/:patientId/reminder-events", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/reminder-events`
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("returns reminder events with reminder details for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([eventWithReminder]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reminder-events`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(acknowledgedEvent.id);
    expect(res.body.data[0].reminder.type).toBe("medication");
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
  });

  it("returns 404 when accessing another caregiver's patient events", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reminder-events`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(evt.findMany).not.toHaveBeenCalled();
  });

  it("filters events by status", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([eventWithReminder]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reminder-events?status=acknowledged`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(evt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "acknowledged" }),
      })
    );
  });

  it("filters events by sourceDevice", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([eventWithReminder]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reminder-events?sourceDevice=watch`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(evt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sourceDevice: "watch" }),
      })
    );
  });

  it("returns 400 for invalid status filter value", async () => {
    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reminder-events?status=bad-value`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

// ─── Caregiver report ──────────────────────────────────────────────────────────

describe("GET /api/patients/:patientId/reports/reminders", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/reports/reminders`
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("returns report with summary for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([
      { ...eventWithReminder, status: "acknowledged" },
    ]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/reminders`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.events).toBeDefined();
    expect(res.body.data.summary.totalScheduled).toBe(1);
    expect(res.body.data.summary.totalAcknowledged).toBe(1);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
  });

  it("returns 404 when accessing another caregiver's patient report", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/reminders`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("correctly counts scheduled/delivered/acknowledged/missed in summary", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);

    const makeEvent = (
      id: string,
      status: string,
      delivered: Date | null,
      acked: Date | null
    ) => ({
      id,
      reminderId: REMINDER_ID,
      patientId: PATIENT_A_ID,
      scheduledAt: SCHEDULED_AT,
      deliveredAt: delivered,
      acknowledgedAt: acked,
      status,
      sourceDevice: "phone",
      createdAt: SCHEDULED_AT,
      updatedAt: SCHEDULED_AT,
      reminder: { id: REMINDER_ID, type: "medication", description: "Take meds" },
    });

    evt.findMany.mockResolvedValue([
      makeEvent("e1", "acknowledged", DELIVERED_AT, ACKNOWLEDGED_AT),
      makeEvent("e2", "acknowledged", DELIVERED_AT, ACKNOWLEDGED_AT),
      makeEvent("e3", "missed", null, null),
      makeEvent("e4", "delivered", DELIVERED_AT, null),
      makeEvent("e5", "scheduled", null, null),
    ]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/reminders`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const { summary } = res.body.data;
    expect(summary.totalScheduled).toBe(5);
    expect(summary.totalDelivered).toBe(3); // e1, e2, e4 have deliveredAt
    expect(summary.totalAcknowledged).toBe(2);
    expect(summary.totalMissed).toBe(1);
    expect(summary.countsByStatus.acknowledged).toBe(2);
    expect(summary.countsByStatus.missed).toBe(1);
    expect(summary.countsByStatus.delivered).toBe(1);
    expect(summary.countsByStatus.scheduled).toBe(1);
    expect(summary.countsBySourceDevice.phone).toBe(5);
  });

  it("computes average time-to-acknowledge from deliveredAt to acknowledgedAt", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);

    // event1: 180s (delivered at T+0, acked at T+180s)
    const deliveredAt1 = new Date("2026-01-01T08:00:00.000Z");
    const acknowledgedAt1 = new Date("2026-01-01T08:03:00.000Z");
    // event2: 60s (delivered at T+0, acked at T+60s)
    const deliveredAt2 = new Date("2026-01-01T08:00:00.000Z");
    const acknowledgedAt2 = new Date("2026-01-01T08:01:00.000Z");

    const makeAcked = (
      id: string,
      del: Date,
      ack: Date
    ) => ({
      id,
      reminderId: REMINDER_ID,
      patientId: PATIENT_A_ID,
      scheduledAt: SCHEDULED_AT,
      deliveredAt: del,
      acknowledgedAt: ack,
      status: "acknowledged",
      sourceDevice: "watch",
      createdAt: del,
      updatedAt: ack,
      reminder: { id: REMINDER_ID, type: "medication", description: "Take meds" },
    });

    evt.findMany.mockResolvedValue([
      makeAcked("e1", deliveredAt1, acknowledgedAt1),
      makeAcked("e2", deliveredAt2, acknowledgedAt2),
    ]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/reminders`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const { summary, events } = res.body.data;
    expect(summary.averageTimeToAcknowledgeSeconds).toBe(120);
    expect(events[0].timeToAcknowledgeSeconds).toBe(180);
    expect(events[1].timeToAcknowledgeSeconds).toBe(60);
  });

  it("returns averageTimeToAcknowledgeSeconds as null when there are no acknowledged events", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([
      {
        ...deliveredEvent,
        reminder: { id: REMINDER_ID, type: "medication", description: "Take meds" },
      },
    ]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/reminders`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.averageTimeToAcknowledgeSeconds).toBeNull();
  });

  it("passes date range filters to the database query", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reports/reminders?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(evt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("event list also respects date range filters", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    evt.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reminder-events?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(evt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });
});
