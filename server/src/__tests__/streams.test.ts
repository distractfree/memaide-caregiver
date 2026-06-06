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
      findFirst: vi.fn(),
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
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const helpEvent = prisma.helpEvent as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const streamSession = (prisma as any).streamSession;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const PATIENT_B_ID = "patient-b-uuid-002";
const DEVICE_ID = "android-demo-001";
const STREAM_SESSION_ID = "stream-session-uuid-001";
const HELP_EVENT_ID = "help-event-uuid-001";
const VIEWER_URL = "https://example.com/view/demo-session";
const STARTED_AT = new Date("2026-05-22T16:30:00.000Z");
const ENDED_AT = new Date("2026-05-22T16:45:00.000Z");
const CREATED_AT = new Date("2026-05-22T16:29:00.000Z");

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

const activeSession = {
  id: STREAM_SESSION_ID,
  patientId: PATIENT_A_ID,
  helpEventId: HELP_EVENT_ID,
  startedAt: STARTED_AT,
  endedAt: null,
  source: "glasses",
  status: "active",
  viewerUrl: VIEWER_URL,
  metadata: { provider: "mock" },
  createdAt: CREATED_AT,
  updatedAt: STARTED_AT,
};

const endedSession = {
  ...activeSession,
  id: "stream-session-uuid-ended",
  status: "ended",
  endedAt: ENDED_AT,
  updatedAt: ENDED_AT,
};

const unavailableSession = {
  ...activeSession,
  id: "stream-session-uuid-unavailable",
  startedAt: null,
  endedAt: null,
  source: "unknown",
  status: "unavailable",
  viewerUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Mobile stream session endpoints", () => {
  it("POST /api/mobile/stream/start creates stream session for valid deviceId", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    streamSession.create.mockResolvedValue(activeSession);

    const res = await request(app)
      .post("/api/mobile/stream/start")
      .send({
        deviceId: DEVICE_ID,
        source: "glasses",
        status: "active",
        startedAt: "2026-05-22T16:30:00.000Z",
        viewerUrl: VIEWER_URL,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("active");
    expect(pat.findUnique).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID },
      select: { id: true },
    });
    expect(streamSession.create).toHaveBeenCalledWith({
      data: {
        patientId: PATIENT_A_ID,
        helpEventId: null,
        startedAt: expect.any(Date),
        source: "glasses",
        status: "active",
        viewerUrl: VIEWER_URL,
        metadata: undefined,
      },
    });
  });

  it("POST /api/mobile/stream/start defaults status to starting and startedAt to server time", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    streamSession.create.mockResolvedValue({ ...activeSession, status: "starting" });

    const res = await request(app)
      .post("/api/mobile/stream/start")
      .send({
        deviceId: DEVICE_ID,
        source: "mock",
      });

    expect(res.status).toBe(201);
    expect(streamSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "starting",
          startedAt: expect.any(Date),
        }),
      })
    );
  });

  it("POST /api/mobile/stream/start with unknown deviceId returns 404", async () => {
    pat.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/stream/start")
      .send({
        deviceId: "unknown-device",
        source: "glasses",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(streamSession.create).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/stream/start with invalid source returns 400", async () => {
    const res = await request(app)
      .post("/api/mobile/stream/start")
      .send({
        deviceId: DEVICE_ID,
        source: "smartglasses",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findUnique).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/stream/start with invalid viewerUrl returns 400", async () => {
    const res = await request(app)
      .post("/api/mobile/stream/start")
      .send({
        deviceId: DEVICE_ID,
        source: "glasses",
        viewerUrl: "not-a-url",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(streamSession.create).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/stream/start with helpEventId belonging to another patient returns 404", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    helpEvent.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/stream/start")
      .send({
        deviceId: DEVICE_ID,
        source: "glasses",
        helpEventId: HELP_EVENT_ID,
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(helpEvent.findFirst).toHaveBeenCalledWith({
      where: { id: HELP_EVENT_ID, patientId: PATIENT_A_ID },
      select: { id: true },
    });
    expect(streamSession.create).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/stream/stop ends stream session for valid deviceId/session", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    streamSession.findFirst.mockResolvedValue(activeSession);
    streamSession.update.mockResolvedValue(endedSession);

    const res = await request(app)
      .post("/api/mobile/stream/stop")
      .send({
        deviceId: DEVICE_ID,
        streamSessionId: STREAM_SESSION_ID,
        endedAt: "2026-05-22T16:45:00.000Z",
        status: "ended",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ended");
    expect(streamSession.findFirst).toHaveBeenCalledWith({
      where: { id: STREAM_SESSION_ID, patientId: PATIENT_A_ID },
    });
    expect(streamSession.update).toHaveBeenCalledWith({
      where: { id: STREAM_SESSION_ID },
      data: { status: "ended", endedAt: expect.any(Date) },
    });
  });

  it("POST /api/mobile/stream/stop with session belonging to another patient returns 404", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    streamSession.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/stream/stop")
      .send({
        deviceId: DEVICE_ID,
        streamSessionId: "other-session",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(streamSession.update).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/stream/stop with invalid status returns 400", async () => {
    const res = await request(app)
      .post("/api/mobile/stream/stop")
      .send({
        deviceId: DEVICE_ID,
        streamSessionId: STREAM_SESSION_ID,
        status: "active",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findUnique).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/stream/status updates active status", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    streamSession.findFirst.mockResolvedValue({ ...activeSession, status: "starting" });
    streamSession.update.mockResolvedValue(activeSession);

    const res = await request(app)
      .post("/api/mobile/stream/status")
      .send({
        deviceId: DEVICE_ID,
        streamSessionId: STREAM_SESSION_ID,
        status: "active",
        viewerUrl: VIEWER_URL,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect(streamSession.update).toHaveBeenCalledWith({
      where: { id: STREAM_SESSION_ID },
      data: { status: "active", viewerUrl: VIEWER_URL },
    });
  });

  it("POST /api/mobile/stream/status with failed sets endedAt if missing", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    streamSession.findFirst.mockResolvedValue(activeSession);
    streamSession.update.mockResolvedValue({ ...activeSession, status: "failed", endedAt: ENDED_AT });

    const res = await request(app)
      .post("/api/mobile/stream/status")
      .send({
        deviceId: DEVICE_ID,
        streamSessionId: STREAM_SESSION_ID,
        status: "failed",
      });

    expect(res.status).toBe(200);
    expect(streamSession.update).toHaveBeenCalledWith({
      where: { id: STREAM_SESSION_ID },
      data: { status: "failed", endedAt: expect.any(Date) },
    });
  });
});

describe("Protected stream session routes", () => {
  it("GET /api/patients/:patientId/stream-sessions returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/stream-sessions`
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("lists stream sessions for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    streamSession.findMany.mockResolvedValue([activeSession]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/stream-sessions`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(streamSession.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_A_ID },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    });
  });

  it("returns 404 when caregiver A lists caregiver B's stream sessions", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/stream-sessions`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(streamSession.findMany).not.toHaveBeenCalled();
  });

  it("filters stream session list by status, source, and date range", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    streamSession.findMany.mockResolvedValue([activeSession]);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/stream-sessions?status=active&source=glasses&from=2026-05-22T00:00:00.000Z&to=2026-05-23T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(streamSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          status: "active",
          source: "glasses",
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("GET /api/stream-sessions/:id returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/stream-sessions/${STREAM_SESSION_ID}`
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("gets own stream session by id", async () => {
    streamSession.findFirst.mockResolvedValue(activeSession);

    const res = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(STREAM_SESSION_ID);
    expect(streamSession.findFirst).toHaveBeenCalledWith({
      where: { id: STREAM_SESSION_ID, patient: { caregiverId: CAREGIVER_A_ID } },
    });
  });

  it("returns 404 when caregiver A gets caregiver B's stream session", async () => {
    streamSession.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/patients/:patientId/stream-status", () => {
  it("returns unavailable message when no sessions exist", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    streamSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/stream-status`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      hasActiveStream: false,
      displayStatus: "unavailable",
      viewerAvailable: false,
      caregiverMessage:
        "No patient perspective stream is available for this session.",
      activeSession: null,
      latestSession: null,
    });
  });

  it("returns active session when active stream exists", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    streamSession.findFirst
      .mockResolvedValueOnce(activeSession)
      .mockResolvedValueOnce(activeSession);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/stream-status`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hasActiveStream).toBe(true);
    expect(res.body.data.displayStatus).toBe("active");
    expect(res.body.data.viewerAvailable).toBe(true);
    expect(res.body.data.caregiverMessage).toBe(
      "Patient perspective stream is active."
    );
    expect(res.body.data.activeSession.id).toBe(STREAM_SESSION_ID);
  });

  it("returns latest session when no active stream exists", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    streamSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(endedSession);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/stream-status`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hasActiveStream).toBe(false);
    expect(res.body.data.displayStatus).toBe("ended");
    expect(res.body.data.viewerAvailable).toBe(false);
    expect(res.body.data.activeSession).toBeNull();
    expect(res.body.data.latestSession.id).toBe(endedSession.id);
  });

  it("returns latest unavailable status message", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    streamSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(unavailableSession);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/stream-status`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.displayStatus).toBe("unavailable");
    expect(res.body.data.caregiverMessage).toBe(
      "No patient perspective stream is available for this session."
    );
  });

  it("returns 404 when caregiver A requests caregiver B's stream status", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/stream-status`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(streamSession.findFirst).not.toHaveBeenCalled();
  });
});
