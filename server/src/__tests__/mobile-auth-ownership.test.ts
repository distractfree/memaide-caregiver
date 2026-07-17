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
    streamSession: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
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
const CAREGIVER_B = "caregiver-b";
const DEVICE_A = "device-a";
const DEVICE_B = "device-b";
const PATIENT_A = "patient-a";

const tokenFor = (caregiverId: string) =>
  jwt.sign({ sub: caregiverId }, JWT_SECRET, { expiresIn: "1h" });

const ownPatient = { id: PATIENT_A, name: "Owner patient", deviceId: DEVICE_A };
const bearerFor = (caregiverId: string) => `Bearer ${tokenFor(caregiverId)}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  p.patient.findFirst.mockResolvedValue(null);
});

describe("mobile JWT and device ownership", () => {
  it("rejects missing and invalid caregiver JWTs before patient lookup", async () => {
    const missing = await request(app).get(
      `/api/mobile/reminders?deviceId=${DEVICE_A}`
    );
    const invalid = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_A}`)
      .set("Authorization", "Bearer not-a-jwt");

    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe("MISSING_TOKEN");
    expect(invalid.status).toBe(401);
    expect(invalid.body.code).toBe("INVALID_TOKEN");
    expect(p.patient.findFirst).not.toHaveBeenCalled();
  });

  it("accepts a valid caregiver JWT for that caregiver's device", async () => {
    p.patient.findFirst.mockResolvedValue(ownPatient);
    p.reminder.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/mobile/reminders?deviceId=${DEVICE_A}`)
      .set("Authorization", bearerFor(CAREGIVER_A));

    expect(response.status).toBe(200);
    expect(p.patient.findFirst).toHaveBeenCalledWith({
      where: { caregiverId: CAREGIVER_A, deviceId: DEVICE_A },
      select: { id: true, name: true, deviceId: true },
    });
  });

  it.each([
    ["reminders", () => request(app).get(`/api/mobile/reminders?deviceId=${DEVICE_A}`).set("Authorization", bearerFor(CAREGIVER_B)), () => expect(p.reminder.findMany).not.toHaveBeenCalled()],
    ["reminder event", () => request(app).post("/api/mobile/reminder-events").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, reminderId: "reminder-a", scheduledAt: "2026-07-15T12:00:00.000Z", status: "delivered", sourceDevice: "phone" }), () => expect(p.reminderEvent.create).not.toHaveBeenCalled()],
    ["help contact", () => request(app).get(`/api/mobile/help-contact?deviceId=${DEVICE_A}`).set("Authorization", bearerFor(CAREGIVER_B)), () => expect(p.helpContact.findFirst).not.toHaveBeenCalled()],
    ["help event", () => request(app).post("/api/mobile/help-events").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, sourceDevice: "phone", status: "triggered" }), () => expect(p.helpEvent.create).not.toHaveBeenCalled()],
    ["beacon configuration", () => request(app).get(`/api/mobile/beacons?deviceId=${DEVICE_A}`).set("Authorization", bearerFor(CAREGIVER_B)), () => expect(p.beacon.findMany).not.toHaveBeenCalled()],
    ["beacon event", () => request(app).post("/api/mobile/beacon-events").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, beaconId: "beacon-a", detectedAt: "2026-07-15T12:00:00.000Z" }), () => expect(p.beaconEvent.create).not.toHaveBeenCalled()],
    ["vital event", () => request(app).post("/api/mobile/vital-events").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, timestamp: "2026-07-15T12:00:00.000Z", heartRate: 72, sourceDevice: "watch" }), () => expect(p.vitalEvent.create).not.toHaveBeenCalled()],
    ["stream start", () => request(app).post("/api/mobile/stream/start").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, source: "glasses" }), () => expect(p.streamSession.create).not.toHaveBeenCalled()],
    ["stream status", () => request(app).post("/api/mobile/stream/status").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, streamSessionId: "stream-a", status: "active" }), () => expect(p.streamSession.update).not.toHaveBeenCalled()],
    ["stream stop", () => request(app).post("/api/mobile/stream/stop").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, streamSessionId: "stream-a", status: "ended" }), () => expect(p.streamSession.update).not.toHaveBeenCalled()],
    ["AI-session start", () => request(app).post("/api/mobile/ai-sessions/start").set("Authorization", bearerFor(CAREGIVER_B)).send({ deviceId: DEVICE_A, vitals: null, beacons: [] }), () => expect(p.aiSession.create).not.toHaveBeenCalled()],
  ])("rejects a different caregiver's device for %s", async (_route, perform, assertNoSideEffect) => {
    const response = await perform();

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
    expect(p.patient.findFirst).toHaveBeenCalledWith({
      where: { caregiverId: CAREGIVER_B, deviceId: DEVICE_A },
      select: { id: true, name: true, deviceId: true },
    });
    assertNoSideEffect();
  });

  it("does not create an AI session or contact Anthony for a wrong-owner device", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await request(app)
      .post("/api/mobile/ai-sessions/start")
      .set("Authorization", bearerFor(CAREGIVER_B))
      .send({ deviceId: DEVICE_A, vitals: null, beacons: [] });

    expect(response.status).toBe(404);
    expect(p.aiSession.create).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", () => request(app).get(`/api/mobile/ai-sessions/session-b?deviceId=${DEVICE_A}`).set("Authorization", bearerFor(CAREGIVER_A))],
    ["message", () => request(app).post("/api/mobile/ai-sessions/session-b/messages").set("Authorization", bearerFor(CAREGIVER_A)).send({ deviceId: DEVICE_A, message: "Hello", senderType: "patient" })],
    ["resolve", () => request(app).post("/api/mobile/ai-sessions/session-b/resolve").set("Authorization", bearerFor(CAREGIVER_A)).send({ deviceId: DEVICE_A })],
    ["emergency acknowledgement", () => request(app).post("/api/mobile/ai-sessions/session-b/emergency-suggestion-ack").set("Authorization", bearerFor(CAREGIVER_A)).send({ deviceId: DEVICE_A, action: "dismissed" })],
  ])("rejects a cross-caregiver AI session %s", async (_operation, perform) => {
    p.patient.findFirst.mockResolvedValue(ownPatient);
    p.aiSession.findUnique.mockResolvedValue({
      id: "session-b",
      patientId: "patient-b",
      status: "active",
      patient: { deviceId: DEVICE_B },
      messages: [],
    });

    const response = await perform();

    expect(response.status).toBe(404);
    expect(p.aiSessionMessage.create).not.toHaveBeenCalled();
    expect(p.aiSession.update).not.toHaveBeenCalled();
  });

  it("rejects a stream session that is not attached to the owned device patient", async () => {
    p.patient.findFirst.mockResolvedValue(ownPatient);
    p.streamSession.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/mobile/stream/status")
      .set("Authorization", bearerFor(CAREGIVER_A))
      .send({ deviceId: DEVICE_A, streamSessionId: "stream-b", status: "active" });

    expect(response.status).toBe(404);
    expect(p.streamSession.findFirst).toHaveBeenCalledWith({
      where: { id: "stream-b", patientId: PATIENT_A },
    });
    expect(p.streamSession.update).not.toHaveBeenCalled();
  });
});
