import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
    streamSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    aiSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    aiSessionMessage: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const patient = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reminderEvent = prisma.reminderEvent as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const beaconEvent = prisma.beaconEvent as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vitalEvent = prisma.vitalEvent as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const helpEvent = prisma.helpEvent as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const streamSession = prisma.streamSession as any;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const NOW = new Date("2026-05-22T18:00:00.000Z");

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

function mockOverviewEvents({
  todayReminders = [],
  recentReminders = todayReminders,
  beacons = [],
  vitals = [],
  todayHelp = [],
  recentHelp = todayHelp,
  streams = [],
}: {
  todayReminders?: unknown[];
  recentReminders?: unknown[];
  beacons?: unknown[];
  vitals?: unknown[];
  todayHelp?: unknown[];
  recentHelp?: unknown[];
  streams?: unknown[];
}) {
  reminderEvent.findMany
    .mockResolvedValueOnce(todayReminders)
    .mockResolvedValueOnce(recentReminders);
  beaconEvent.findMany.mockResolvedValueOnce(beacons);
  vitalEvent.findMany.mockResolvedValueOnce(vitals);
  helpEvent.findMany.mockResolvedValueOnce(todayHelp).mockResolvedValueOnce(recentHelp);
  streamSession.findMany.mockResolvedValueOnce(streams);
}

const samplePatient = {
  id: PATIENT_A_ID,
  name: "Robert Lee",
};

const acknowledgedReminder = {
  id: "reminder-event-ack",
  reminderId: "reminder-1",
  patientId: PATIENT_A_ID,
  scheduledAt: new Date("2026-05-22T15:00:00.000Z"),
  deliveredAt: new Date("2026-05-22T15:00:05.000Z"),
  acknowledgedAt: new Date("2026-05-22T15:02:00.000Z"),
  status: "acknowledged",
  sourceDevice: "watch",
  reminder: {
    id: "reminder-1",
    type: "medication",
    description: "Morning medication",
    timeOfDay: "08:00",
    frequency: "daily",
  },
};

const missedReminder = {
  ...acknowledgedReminder,
  id: "reminder-event-missed",
  acknowledgedAt: null,
  status: "missed",
  sourceDevice: "phone",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/patients/:patientId/overview", () => {
  it("returns an overview for the caregiver's own patient", async () => {
    patient.findFirst.mockResolvedValue(samplePatient);
    mockOverviewEvents({
      todayReminders: [acknowledgedReminder],
      beacons: [
        {
          id: "beacon-event-1",
          patientId: PATIENT_A_ID,
          beaconId: "beacon-1",
          roomName: "Kitchen",
          detectedAt: new Date("2026-05-22T17:30:00.000Z"),
          exitedAt: null,
          dwellSeconds: 120,
          estimatedDistanceM: 1.4,
          sourceDevice: "phone",
          createdAt: new Date("2026-05-22T17:30:00.000Z"),
          updatedAt: new Date("2026-05-22T17:30:00.000Z"),
        },
      ],
      vitals: [
        {
          id: "vital-event-1",
          patientId: PATIENT_A_ID,
          timestamp: new Date("2026-05-22T17:40:00.000Z"),
          heartRate: 78,
          motionState: "walking",
          stepCount: 1200,
          sourceDevice: "watch",
          createdAt: new Date("2026-05-22T17:40:00.000Z"),
          updatedAt: new Date("2026-05-22T17:40:00.000Z"),
        },
      ],
      todayHelp: [],
    });

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/overview`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patientId).toBe(PATIENT_A_ID);
    expect(res.body.data.patientName).toBe("Robert Lee");
    expect(res.body.data.summaryCards).toHaveLength(4);
    expect(res.body.data.summaryCards[0]).toMatchObject({
      key: "reminders",
      value: "1 acknowledged / 0 missed",
      status: "normal",
    });
    expect(res.body.data.timeline[0]).toBeDefined();
    expect(patient.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
      select: { id: true, name: true },
    });
  });

  it("does not allow a caregiver to fetch another caregiver's patient overview", async () => {
    patient.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/overview`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_B_ID)}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(reminderEvent.findMany).not.toHaveBeenCalled();
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns safe empty states when there are no events", async () => {
    patient.findFirst.mockResolvedValue(samplePatient);
    mockOverviewEvents({});

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/overview`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summaryCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "reminders",
          value: "No reminder events today",
          status: "empty",
        }),
        expect.objectContaining({
          key: "location",
          value: "No room update yet",
          status: "empty",
        }),
        expect.objectContaining({
          key: "wellness",
          value: "No wellness update today",
          status: "empty",
        }),
        expect.objectContaining({
          key: "help",
          value: "No help request today",
          status: "normal",
        }),
      ])
    );
    expect(res.body.data.attentionItems).toEqual([]);
    expect(res.body.data.timeline).toEqual([]);
  });

  it("returns attention items for missed reminders, urgent help, and active stream sessions", async () => {
    patient.findFirst.mockResolvedValue(samplePatient);
    mockOverviewEvents({
      todayReminders: [acknowledgedReminder, missedReminder],
      beacons: [
        {
          id: "beacon-event-stale",
          patientId: PATIENT_A_ID,
          beaconId: "beacon-1",
          roomName: "Bedroom",
          detectedAt: new Date("2026-05-22T12:00:00.000Z"),
          exitedAt: null,
          dwellSeconds: 60,
          estimatedDistanceM: 2,
          sourceDevice: "phone",
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-22T12:00:00.000Z"),
        },
      ],
      vitals: [],
      todayHelp: [
        {
          id: "help-event-1",
          patientId: PATIENT_A_ID,
          triggeredAt: new Date("2026-05-22T17:50:00.000Z"),
          sourceDevice: "watch",
          whatsappNumber: "+18185550123",
          status: "triggered",
          createdAt: new Date("2026-05-22T17:50:00.000Z"),
          updatedAt: new Date("2026-05-22T17:50:00.000Z"),
        },
      ],
      streams: [
        {
          id: "stream-session-active",
          patientId: PATIENT_A_ID,
          helpEventId: "help-event-1",
          startedAt: new Date("2026-05-22T17:51:00.000Z"),
          endedAt: null,
          source: "glasses",
          status: "active",
          viewerUrl: "https://example.com/view/demo",
          metadata: null,
          createdAt: new Date("2026-05-22T17:51:00.000Z"),
          updatedAt: new Date("2026-05-22T17:52:00.000Z"),
        },
      ],
    });

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/overview`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summaryCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "reminders", status: "attention" }),
        expect.objectContaining({ key: "location", status: "normal" }),
        expect.objectContaining({ key: "wellness", status: "empty" }),
        expect.objectContaining({ key: "help", status: "urgent" }),
      ])
    );
    expect(res.body.data.attentionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "1 missed reminder today" }),
        expect.objectContaining({ message: "Active stream session available for caregiver review." }),
        expect.objectContaining({ severity: "urgent" }),
      ])
    );
  });
});
