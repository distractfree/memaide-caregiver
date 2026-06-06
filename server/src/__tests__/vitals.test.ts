import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

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
    helpContact: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    helpEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    beacon: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    beaconEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    vitalEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vitalEvent = (prisma as any).vitalEvent;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const PATIENT_B_ID = "patient-b-uuid-002";
const DEVICE_ID = "android-demo-001";
const VITAL_EVENT_ID = "vital-event-uuid-001";
const TIMESTAMP = new Date("2026-05-22T16:30:00.000Z");
const CREATED_AT = new Date("2026-05-22T16:31:00.000Z");

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const tokenA = makeToken(CAREGIVER_A_ID);
const tokenB = makeToken(CAREGIVER_B_ID);

const samplePatientA = {
  id: PATIENT_A_ID,
  caregiverId: CAREGIVER_A_ID,
  name: "Mary Johnson",
  deviceId: DEVICE_ID,
};

const sampleVitalEvent = {
  id: VITAL_EVENT_ID,
  patientId: PATIENT_A_ID,
  timestamp: TIMESTAMP,
  heartRate: 78,
  motionState: "walking",
  stepCount: 2450,
  sourceDevice: "watch",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const motionStepVitalEvent = {
  ...sampleVitalEvent,
  id: "vital-event-uuid-002",
  heartRate: null,
  motionState: "active",
  stepCount: 1200,
  sourceDevice: "phone",
};

const reportEvents = [
  {
    ...sampleVitalEvent,
    id: "vital-event-report-004",
    timestamp: new Date("2026-05-23T09:00:00.000Z"),
    heartRate: null,
    motionState: "unknown",
    stepCount: 2600,
    sourceDevice: "phone",
  },
  {
    ...sampleVitalEvent,
    id: "vital-event-report-003",
    timestamp: new Date("2026-05-22T18:00:00.000Z"),
    heartRate: 78,
    motionState: "active",
    stepCount: 2450,
    sourceDevice: "watch",
  },
  {
    ...sampleVitalEvent,
    id: "vital-event-report-002",
    timestamp: new Date("2026-05-22T08:00:00.000Z"),
    heartRate: 72,
    motionState: "walking",
    stepCount: 650,
    sourceDevice: "watch",
  },
  {
    ...sampleVitalEvent,
    id: "vital-event-report-001",
    timestamp: new Date("2026-05-21T20:00:00.000Z"),
    heartRate: 90,
    motionState: "walking",
    stepCount: 100,
    sourceDevice: "watch",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/mobile/vital-events", () => {
  it("creates an event for a valid deviceId with heartRate", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    vitalEvent.create.mockResolvedValue(sampleVitalEvent);

    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        heartRate: 78,
        sourceDevice: "watch",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.heartRate).toBe(78);
    expect(pat.findUnique).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID },
      select: { id: true },
    });
    expect(vitalEvent.create).toHaveBeenCalledWith({
      data: {
        patientId: PATIENT_A_ID,
        timestamp: expect.any(Date),
        heartRate: 78,
        motionState: null,
        stepCount: null,
        sourceDevice: "watch",
      },
    });
  });

  it("creates an event for a valid deviceId with motionState and stepCount", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    vitalEvent.create.mockResolvedValue(motionStepVitalEvent);

    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        motionState: "active",
        stepCount: 1200,
        sourceDevice: "phone",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.motionState).toBe("active");
    expect(res.body.data.stepCount).toBe(1200);
    expect(vitalEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        heartRate: null,
        motionState: "active",
        stepCount: 1200,
        sourceDevice: "phone",
      }),
    });
  });

  it("returns 400 when deviceId is missing", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        timestamp: "2026-05-22T16:30:00.000Z",
        heartRate: 78,
        sourceDevice: "watch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findUnique).not.toHaveBeenCalled();
    expect(vitalEvent.create).not.toHaveBeenCalled();
  });

  it("returns 404 when deviceId does not match any patient", async () => {
    pat.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: "unknown-device",
        timestamp: "2026-05-22T16:30:00.000Z",
        heartRate: 78,
        sourceDevice: "watch",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(vitalEvent.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid heartRate", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        heartRate: 250,
        sourceDevice: "watch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid stepCount", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        stepCount: -1,
        sourceDevice: "watch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(vitalEvent.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid motionState", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        motionState: "running",
        sourceDevice: "watch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid sourceDevice", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        heartRate: 78,
        sourceDevice: "ring",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when no sample fields are provided", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .send({
        deviceId: DEVICE_ID,
        timestamp: "2026-05-22T16:30:00.000Z",
        sourceDevice: "watch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(vitalEvent.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/patients/:patientId/vitals", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get(`/api/patients/${PATIENT_A_ID}/vitals`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("lists vitals for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue([sampleVitalEvent]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.notes.positioning).toContain("Wellness data is best-effort");
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(vitalEvent.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_A_ID },
      skip: 0,
      take: 50,
      orderBy: { timestamp: "desc" },
    });
  });

  it("returns 404 when caregiver A lists caregiver B's patient vitals", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/patients/does-not-exist/vitals")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("filters vitals by sourceDevice", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue([sampleVitalEvent]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/vitals?sourceDevice=watch`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(vitalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          sourceDevice: "watch",
        }),
      })
    );
  });

  it("filters vitals by motionState", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue([sampleVitalEvent]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/vitals?motionState=walking`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(vitalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          motionState: "walking",
        }),
      })
    );
  });

  it("filters vitals by from/to date range", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue([sampleVitalEvent]);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/vitals?from=2026-05-01T00:00:00.000Z&to=2026-05-31T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(vitalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          timestamp: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("returns 400 for invalid from/to date", async () => {
    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/vitals?from=not-a-date`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when from is after to", async () => {
    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/vitals?from=2026-05-23T00:00:00.000Z&to=2026-05-22T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/patients/:patientId/reports/vitals", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/reports/vitals`
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("returns a vitals report for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.heartRateTrend).toBeDefined();
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(vitalEvent.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_A_ID },
      orderBy: { timestamp: "desc" },
    });
  });

  it("returns 404 when caregiver A requests caregiver B's patient report", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/patients/does-not-exist/reports/vitals")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns zero totals and empty arrays for empty vitals history", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({
      totalSamples: 0,
      samplesWithHeartRate: 0,
      samplesWithMotionState: 0,
      samplesWithStepCount: 0,
      firstSampleAt: null,
      latestSampleAt: null,
      latestHeartRate: null,
      latestMotionState: null,
      latestStepCount: null,
      totalStepsLatestValue: null,
      averageHeartRate: null,
      minHeartRate: null,
      maxHeartRate: null,
      stepCountDelta: null,
      mostCommonMotionState: null,
      countsBySourceDevice: { watch: 0, phone: 0, system: 0 },
      countsByMotionState: { idle: 0, walking: 0, active: 0, unknown: 0 },
    });
    expect(res.body.data.heartRateTrend).toEqual([]);
    expect(res.body.data.stepTrend).toEqual([]);
    expect(res.body.data.motionTimeline).toEqual([]);
    expect(res.body.data.dailySummaries).toEqual([]);
    expect(res.body.data.events).toEqual([]);
  });

  it("calculates totalSamples", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.totalSamples).toBe(4);
  });

  it("calculates sample field counts", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.samplesWithHeartRate).toBe(3);
    expect(res.body.data.summary.samplesWithMotionState).toBe(4);
    expect(res.body.data.summary.samplesWithStepCount).toBe(4);
  });

  it("calculates heart-rate aggregate values", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.averageHeartRate).toBe(80);
    expect(res.body.data.summary.minHeartRate).toBe(72);
    expect(res.body.data.summary.maxHeartRate).toBe(90);
  });

  it("identifies latest sample values", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.firstSampleAt).toBe(
      "2026-05-21T20:00:00.000Z"
    );
    expect(res.body.data.summary.latestSampleAt).toBe(
      "2026-05-23T09:00:00.000Z"
    );
    expect(res.body.data.summary.latestHeartRate).toBe(78);
    expect(res.body.data.summary.latestMotionState).toBe("unknown");
    expect(res.body.data.summary.latestStepCount).toBe(2600);
  });

  it("calculates stepCountDelta when step values are usable", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.stepCountDelta).toBe(2500);
    expect(res.body.data.summary.totalStepsLatestValue).toBe(2600);
  });

  it("identifies mostCommonMotionState", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.mostCommonMotionState).toBe("walking");
  });

  it("groups countsBySourceDevice", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.countsBySourceDevice).toEqual({
      watch: 3,
      phone: 1,
      system: 0,
    });
  });

  it("groups countsByMotionState", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.countsByMotionState).toEqual({
      idle: 0,
      walking: 2,
      active: 1,
      unknown: 1,
    });
  });

  it("returns a chart-ready heart-rate trend with only heartRate samples", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.heartRateTrend).toEqual([
      {
        timestamp: "2026-05-21T20:00:00.000Z",
        heartRate: 90,
        sourceDevice: "watch",
      },
      {
        timestamp: "2026-05-22T08:00:00.000Z",
        heartRate: 72,
        sourceDevice: "watch",
      },
      {
        timestamp: "2026-05-22T18:00:00.000Z",
        heartRate: 78,
        sourceDevice: "watch",
      },
    ]);
  });

  it("returns a chart-ready step trend with only stepCount samples", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.stepTrend.map((row: { stepCount: number }) => row.stepCount)).toEqual([
      100,
      650,
      2450,
      2600,
    ]);
    expect(res.body.data.stepTrend[0].timestamp).toBe(
      "2026-05-21T20:00:00.000Z"
    );
  });

  it("returns a motion timeline with only motionState samples", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(
      res.body.data.motionTimeline.map(
        (row: { motionState: string }) => row.motionState
      )
    ).toEqual(["walking", "walking", "active", "unknown"]);
  });

  it("groups daily summaries by timestamp date", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.dailySummaries).toEqual([
      {
        date: "2026-05-21",
        sampleCount: 1,
        averageHeartRate: 90,
        minHeartRate: 90,
        maxHeartRate: 90,
        latestStepCount: 100,
        mostCommonMotionState: "walking",
        countsByMotionState: { idle: 0, walking: 1, active: 0, unknown: 0 },
      },
      {
        date: "2026-05-22",
        sampleCount: 2,
        averageHeartRate: 75,
        minHeartRate: 72,
        maxHeartRate: 78,
        latestStepCount: 2450,
        mostCommonMotionState: "walking",
        countsByMotionState: { idle: 0, walking: 1, active: 1, unknown: 0 },
      },
      {
        date: "2026-05-23",
        sampleCount: 1,
        averageHeartRate: null,
        minHeartRate: null,
        maxHeartRate: null,
        latestStepCount: 2600,
        mostCommonMotionState: "unknown",
        countsByMotionState: { idle: 0, walking: 0, active: 0, unknown: 1 },
      },
    ]);
  });

  it("returns raw event rows newest first", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.events[0].id).toBe("vital-event-report-004");
    expect(res.body.data.events[3].id).toBe("vital-event-report-001");
  });

  it("filters report by sourceDevice", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents.slice(1));

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals?sourceDevice=watch`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(vitalEvent.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_A_ID, sourceDevice: "watch" },
      orderBy: { timestamp: "desc" },
    });
  });

  it("filters report by motionState", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue([reportEvents[1]]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals?motionState=active`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(vitalEvent.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_A_ID, motionState: "active" },
      orderBy: { timestamp: "desc" },
    });
  });

  it("filters report by from/to date range", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reports/vitals?from=2026-05-22T00:00:00.000Z&to=2026-05-22T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(vitalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          timestamp: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("returns 400 for invalid from/to date", async () => {
    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals?from=not-a-date`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when from is after to", async () => {
    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reports/vitals?from=2026-05-23T00:00:00.000Z&to=2026-05-22T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(vitalEvent.findMany).not.toHaveBeenCalled();
  });

  it("includes safe wellness positioning notes", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    vitalEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/vitals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.notes.positioning).toBe(
      "Wellness data is best-effort and intended for care coordination, not diagnosis."
    );
    expect(res.body.data.notes.availability).toBe(
      "Wearable samples may vary by device, permissions, and collection availability."
    );
  });
});
