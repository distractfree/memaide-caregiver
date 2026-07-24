import { beforeEach, describe, expect, it, vi } from "vitest";
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
    AI_CALLBACK_API_KEY: "test-callback-key",
    AI_FRAME_JSON_LIMIT: "1mb",
  },
}));

vi.mock("../lib/prisma", () => ({
  prisma: {
    patient: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    reminder: { findFirst: vi.fn(), findMany: vi.fn() },
    reminderEvent: { create: vi.fn() },
    helpContact: { findFirst: vi.fn() },
    helpEvent: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    beacon: { findFirst: vi.fn(), findMany: vi.fn() },
    beaconEvent: { create: vi.fn() },
    vitalEvent: { create: vi.fn() },
    streamSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    aiSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    aiSessionMessage: { create: vi.fn() },
    $transaction: vi.fn((callback) => callback({})),
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A = "caregiver-a";
const PATIENT_A = "patient-a";
const PATIENT_B = "patient-b";
const DEVICE_A = "device-a";
const DEVICE_B = "device-b";

const patientA = { id: PATIENT_A, name: "Patient A", deviceId: DEVICE_A };
const patientB = { id: PATIENT_B, name: "Patient B", deviceId: DEVICE_B };

const patientToken = (patientId: string, options: jwt.SignOptions = {}) =>
  jwt.sign({ sub: patientId, typ: "patient" }, JWT_SECRET, {
    expiresIn: "1h",
    ...options,
  });

const caregiverToken = (caregiverId: string) =>
  jwt.sign({ sub: caregiverId }, JWT_SECRET, { expiresIn: "1h" });

const asPatient = (patientId: string) => `Bearer ${patientToken(patientId)}`;
const asCaregiver = (caregiverId: string) =>
  `Bearer ${caregiverToken(caregiverId)}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  p.patient.findFirst.mockResolvedValue(null);
  // Patient tokens resolve their own record by id, and nothing else.
  p.patient.findUnique.mockImplementation(async ({ where }: any) => {
    if (where?.id === PATIENT_A) return patientA;
    if (where?.id === PATIENT_B) return patientB;
    return null;
  });
});

describe("mobile actor middleware", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/mobile/reminders");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
    expect(p.patient.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const res = await request(app)
      .get("/api/mobile/reminders")
      .set("Authorization", patientToken(PATIENT_A));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("accepts a valid patient token", async () => {
    p.reminder.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/mobile/reminders")
      .set("Authorization", asPatient(PATIENT_A));

    expect(res.status).toBe(200);
  });

  it("accepts a legacy caregiver token that carries no typ claim", async () => {
    p.patient.findFirst.mockResolvedValue(patientA);
    p.reminder.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_A}`)
      .set("Authorization", asCaregiver(CAREGIVER_A));

    expect(res.status).toBe(200);
    expect(p.patient.findFirst).toHaveBeenCalledWith({
      where: { caregiverId: CAREGIVER_A, deviceId: DEVICE_A },
      select: { id: true, name: true, deviceId: true },
    });
  });

  it("accepts an explicit caregiver-typed token", async () => {
    p.patient.findFirst.mockResolvedValue(patientA);
    p.reminder.findMany.mockResolvedValue([]);
    const token = jwt.sign({ sub: CAREGIVER_A, typ: "caregiver" }, JWT_SECRET, {
      expiresIn: "1h",
    });

    const res = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_A}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it.each([
    ["expired patient token", () => patientToken(PATIENT_A, { expiresIn: "-1h" })],
    ["token signed with the wrong secret", () =>
      jwt.sign({ sub: PATIENT_A, typ: "patient" }, "a-different-secret-value")],
    ["tampered patient token", () => {
      const [header, payload] = patientToken(PATIENT_A).split(".");
      return `${header}.${payload}.tampered-signature`;
    }],
    ["unknown token type", () =>
      jwt.sign({ sub: PATIENT_A, typ: "admin" }, JWT_SECRET, { expiresIn: "1h" })],
    ["token with no subject", () =>
      jwt.sign({ typ: "patient" }, JWT_SECRET, { expiresIn: "1h" })],
    ["structurally invalid token", () => "not-a-jwt"],
  ])("rejects a %s", async (_label, makeToken) => {
    const res = await request(app)
      .get("/api/mobile/reminders")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
    expect(p.patient.findUnique).not.toHaveBeenCalled();
    expect(p.patient.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a patient token on the caregiver portal API", async () => {
    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", asPatient(PATIENT_A));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
    expect(p.patient.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/mobile/patients stays caregiver-only", () => {
  it("denies a patient token", async () => {
    const res = await request(app)
      .get("/api/mobile/patients")
      .set("Authorization", asPatient(PATIENT_A));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CAREGIVER_ONLY");
    expect(p.patient.findMany).not.toHaveBeenCalled();
  });

  it("leaks no patient identifiers in the denial", async () => {
    const res = await request(app)
      .get("/api/mobile/patients")
      .set("Authorization", asPatient(PATIENT_A));

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(PATIENT_A);
    expect(serialized).not.toContain(PATIENT_B);
    expect(serialized).not.toContain(DEVICE_A);
  });

  it("still serves a caregiver token unchanged", async () => {
    p.patient.findMany.mockResolvedValue([
      { id: PATIENT_A, name: "Patient A", deviceId: DEVICE_A },
    ]);

    const res = await request(app)
      .get("/api/mobile/patients")
      .set("Authorization", asCaregiver(CAREGIVER_A));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: PATIENT_A, name: "Patient A", deviceId: DEVICE_A },
    ]);
  });
});

describe("a patient token resolves its own patient", () => {
  it("reads its own reminders without sending a deviceId", async () => {
    p.reminder.findMany.mockResolvedValue([
      { id: "reminder-a", type: "medication", description: "Pills" },
    ]);

    const res = await request(app)
      .get("/api/mobile/reminders")
      .set("Authorization", asPatient(PATIENT_A));

    expect(res.status).toBe(200);
    expect(p.patient.findUnique).toHaveBeenCalledWith({
      where: { id: PATIENT_A },
      select: { id: true, name: true, deviceId: true },
    });
    expect(p.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: PATIENT_A, active: true } })
    );
    // Identity never goes through the caregiver ownership lookup.
    expect(p.patient.findFirst).not.toHaveBeenCalled();
  });

  it("reads its own beacons and help contact", async () => {
    p.beacon.findMany.mockResolvedValue([]);
    p.helpContact.findFirst.mockResolvedValue({
      id: "contact-a",
      whatsappNumber: "+18185550199",
      label: "Primary caregiver",
      active: true,
    });

    const beacons = await request(app)
      .get("/api/mobile/beacons")
      .set("Authorization", asPatient(PATIENT_A));
    const helpContact = await request(app)
      .get("/api/mobile/help-contact")
      .set("Authorization", asPatient(PATIENT_A));

    expect(beacons.status).toBe(200);
    expect(helpContact.status).toBe(200);
    expect(p.beacon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: PATIENT_A, active: true } })
    );
    expect(p.helpContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: PATIENT_A, active: true },
      })
    );
  });

  it("submits its own events against its own patient id", async () => {
    p.reminder.findFirst.mockResolvedValue({ id: "reminder-a" });
    p.reminderEvent.create.mockResolvedValue({ id: "event-a" });
    p.beacon.findFirst.mockResolvedValue({ id: "beacon-a", roomName: "Kitchen" });
    p.beaconEvent.create.mockResolvedValue({ id: "beacon-event-a" });
    p.vitalEvent.create.mockResolvedValue({ id: "vital-event-a" });
    p.helpContact.findFirst.mockResolvedValue({ whatsappNumber: "+18185550199" });
    p.helpEvent.create.mockResolvedValue({ id: "help-event-a" });

    const reminderEvent = await request(app)
      .post("/api/mobile/reminder-events")
      .set("Authorization", asPatient(PATIENT_A))
      .send({
        reminderId: "reminder-a",
        scheduledAt: "2026-07-15T12:00:00.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });
    const beaconEvent = await request(app)
      .post("/api/mobile/beacon-events")
      .set("Authorization", asPatient(PATIENT_A))
      .send({ beaconId: "beacon-a", detectedAt: "2026-07-15T12:00:00.000Z" });
    const vitalEvent = await request(app)
      .post("/api/mobile/vital-events")
      .set("Authorization", asPatient(PATIENT_A))
      .send({
        timestamp: "2026-07-15T12:00:00.000Z",
        heartRate: 72,
        sourceDevice: "watch",
      });
    const helpEvent = await request(app)
      .post("/api/mobile/help-events")
      .set("Authorization", asPatient(PATIENT_A))
      .send({ sourceDevice: "phone", status: "triggered" });

    expect(reminderEvent.status).toBe(201);
    expect(beaconEvent.status).toBe(201);
    expect(vitalEvent.status).toBe(201);
    expect(helpEvent.status).toBe(201);

    for (const create of [
      p.reminderEvent.create,
      p.beaconEvent.create,
      p.vitalEvent.create,
      p.helpEvent.create,
    ]) {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patientId: PATIENT_A }),
        })
      );
    }
  });

  it("controls its own stream", async () => {
    p.streamSession.create.mockResolvedValue({ id: "stream-a" });

    const res = await request(app)
      .post("/api/mobile/stream/start")
      .set("Authorization", asPatient(PATIENT_A))
      .send({ source: "glasses" });

    expect(res.status).toBe(201);
    expect(p.streamSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: PATIENT_A }),
      })
    );
  });

  it("starts its own AI session and registers that patient with the AI agent", async () => {
    process.env.AI_AGENT_URL = "http://ai-agent.test";
    process.env.AI_AGENT_WS_URL = "ws://ai-agent.test/ws";
    process.env.AI_AGENT_API_KEY = "test-agent-key";
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ status: "registered" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    p.aiSession.create.mockResolvedValue({ id: "session-a" });
    p.aiSession.update.mockResolvedValue({ id: "session-a" });
    p.aiSession.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/mobile/ai-sessions/start")
      .set("Authorization", asPatient(PATIENT_A))
      .send({ vitals: null, beacons: [] });

    expect(res.status).toBe(200);
    expect(p.aiSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: PATIENT_A }),
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(requestInit.body);
    expect(payload.patient.patient_id).toBe(PATIENT_A);
    expect(requestInit.body).not.toContain(PATIENT_B);
  });

  it("reads and resolves its own AI session", async () => {
    p.aiSession.findUnique.mockResolvedValue({
      id: "session-a",
      patientId: PATIENT_A,
      status: "active",
      messages: [],
      patient: patientA,
    });
    p.aiSession.update.mockResolvedValue({ id: "session-a", status: "resolved" });
    p.streamSession.findMany.mockResolvedValue([]);
    // Resolution runs inside a transaction; hand the callback a working client.
    p.$transaction.mockImplementation((callback: any) => callback(p));

    const read = await request(app)
      .get("/api/mobile/ai-sessions/session-a")
      .set("Authorization", asPatient(PATIENT_A));
    const resolved = await request(app)
      .post("/api/mobile/ai-sessions/session-a/resolve")
      .set("Authorization", asPatient(PATIENT_A))
      .send({});

    expect(read.status).toBe(200);
    expect(read.body.data.patientId).toBe(PATIENT_A);
    expect(resolved.status).toBe(200);
  });
});

describe("a patient token cannot reach another patient", () => {
  it("cannot switch patient by supplying another patient's deviceId", async () => {
    p.reminder.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_B}`)
      .set("Authorization", asPatient(PATIENT_A));

    expect(res.status).toBe(200);
    // The supplied deviceId is inert: identity still came from the token.
    expect(p.patient.findUnique).toHaveBeenCalledWith({
      where: { id: PATIENT_A },
      select: { id: true, name: true, deviceId: true },
    });
    expect(p.patient.findFirst).not.toHaveBeenCalled();
    expect(p.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: PATIENT_A, active: true } })
    );
    expect(p.reminder.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: PATIENT_B, active: true } })
    );
  });

  it("cannot submit an event for another patient using their deviceId", async () => {
    p.reminder.findFirst.mockResolvedValue({ id: "reminder-a" });
    p.reminderEvent.create.mockResolvedValue({ id: "event-a" });

    const res = await request(app)
      .post("/api/mobile/reminder-events")
      .set("Authorization", asPatient(PATIENT_A))
      .send({
        deviceId: DEVICE_B,
        reminderId: "reminder-a",
        scheduledAt: "2026-07-15T12:00:00.000Z",
        status: "delivered",
        sourceDevice: "phone",
      });

    expect(res.status).toBe(201);
    expect(p.reminderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: PATIENT_A }),
      })
    );
    expect(p.reminderEvent.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: PATIENT_B }),
      })
    );
  });

  it("cannot read another patient's AI session", async () => {
    p.aiSession.findUnique.mockResolvedValue({
      id: "session-b",
      patientId: PATIENT_B,
      status: "active",
      messages: [],
      patient: patientB,
    });

    const res = await request(app)
      .get("/api/mobile/ai-sessions/session-b")
      .set("Authorization", asPatient(PATIENT_A));

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(PATIENT_B);
  });

  it.each([
    ["message", () =>
      request(app)
        .post("/api/mobile/ai-sessions/session-b/messages")
        .set("Authorization", asPatient(PATIENT_A))
        .send({ message: "Hello", senderType: "patient" })],
    ["resolve", () =>
      request(app)
        .post("/api/mobile/ai-sessions/session-b/resolve")
        .set("Authorization", asPatient(PATIENT_A))
        .send({})],
    ["emergency acknowledgement", () =>
      request(app)
        .post("/api/mobile/ai-sessions/session-b/emergency-suggestion-ack")
        .set("Authorization", asPatient(PATIENT_A))
        .send({ action: "dismissed" })],
  ])("cannot act on another patient's AI session (%s)", async (_label, perform) => {
    p.aiSession.findUnique.mockResolvedValue({
      id: "session-b",
      patientId: PATIENT_B,
      status: "emergency_suggested",
      messages: [],
      patient: patientB,
    });

    const res = await perform();

    expect(res.status).toBe(404);
    expect(p.aiSessionMessage.create).not.toHaveBeenCalled();
    expect(p.aiSession.update).not.toHaveBeenCalled();
  });

  it("cannot control another patient's stream", async () => {
    p.streamSession.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/stream/status")
      .set("Authorization", asPatient(PATIENT_A))
      .send({ streamSessionId: "stream-b", status: "active" });

    expect(res.status).toBe(404);
    // Ownership was scoped in the query to the token's own patient.
    expect(p.streamSession.findFirst).toHaveBeenCalledWith({
      where: { id: "stream-b", patientId: PATIENT_A },
    });
    expect(p.streamSession.update).not.toHaveBeenCalled();
  });

  it("fails safely when the token subject no longer exists", async () => {
    p.patient.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/mobile/reminders")
      .set("Authorization", asPatient("deleted-patient"));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(p.reminder.findMany).not.toHaveBeenCalled();
  });
});

describe("caregiver mobile behavior is unchanged", () => {
  it("still requires deviceId and fails before any patient lookup", async () => {
    const res = await request(app)
      .post("/api/mobile/vital-events")
      .set("Authorization", asCaregiver(CAREGIVER_A))
      .send({
        timestamp: "2026-07-15T12:00:00.000Z",
        heartRate: 72,
        sourceDevice: "watch",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(p.patient.findFirst).not.toHaveBeenCalled();
    expect(p.vitalEvent.create).not.toHaveBeenCalled();
  });

  it("still rejects a device owned by a different caregiver", async () => {
    p.patient.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_B}`)
      .set("Authorization", asCaregiver(CAREGIVER_A));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(p.reminder.findMany).not.toHaveBeenCalled();
  });

  it("still resolves its own device through the caregiver ownership check", async () => {
    p.patient.findFirst.mockResolvedValue(patientA);
    p.reminder.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_A}`)
      .set("Authorization", asCaregiver(CAREGIVER_A));

    expect(res.status).toBe(200);
    expect(p.patient.findUnique).not.toHaveBeenCalled();
  });
});
