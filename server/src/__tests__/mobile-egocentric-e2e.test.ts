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
    CORS_ORIGINS: ["http://localhost:5273"],
    AI_FRAME_JSON_LIMIT: "1mb",
  },
}));

vi.mock("../lib/prisma", () => {
  const prisma = {
    patient: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    aiSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    aiSessionMessage: { create: vi.fn() },
    streamSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    helpEvent: { findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

import app from "../app";
import { prisma } from "../lib/prisma";
import {
  getLatestFrame,
  resetLatestFrameStoreForTests,
} from "../modules/ai-sessions/latest-ai-frame.store";

const p = prisma as any;
const JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CALLBACK_KEY = "test-frame-callback-key";
const CAREGIVER_A_ID = "caregiver-e2e-owner";
const CAREGIVER_B_ID = "caregiver-e2e-other";
const PATIENT_ID = "patient-e2e";
const DEVICE_ID = "glasses-device-e2e";
const AI_SESSION_ID = "ai-session-e2e";
const TINY_JPEG_B64 = "/9j/2Q==";

function tokenFor(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, JWT_SECRET, { expiresIn: "1h" });
}

function matchesStatus(current: string, expected: unknown) {
  if (typeof expected === "string") return current === expected;
  if (expected && typeof expected === "object" && "in" in expected) {
    return Array.isArray((expected as { in?: unknown }).in) &&
      (expected as { in: unknown[] }).in.includes(current);
  }
  return true;
}

describe("mobile JWT and egocentric frame lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    resetLatestFrameStoreForTests();
    process.env.AI_AGENT_URL = "http://anthony.test";
    process.env.AI_AGENT_WS_URL = "ws://anthony.test";
    process.env.AI_AGENT_API_KEY = "anthony-test-key";
    process.env.AI_AGENT_TIMEOUT_MS = "5000";
    process.env.AI_CALLBACK_API_KEY = CALLBACK_KEY;
    process.env.AI_FRAME_MAX_DECODED_BYTES = "786432";

    const patientContext = {
      id: PATIENT_ID,
      deviceId: DEVICE_ID,
      name: "E2E Patient",
      phoneNumber: null,
      caregiver: { id: CAREGIVER_A_ID, name: "Arian Owner" },
      reminders: [],
      helpContacts: [],
      vitalEvents: [],
      beaconEvents: [],
      helpEvents: [],
      aiSessions: [],
    };
    let aiSession: any = null;
    const streamSessions: any[] = [];
    const transcriptMessages: any[] = [];
    let streamSequence = 0;

    p.patient.findFirst.mockImplementation(async ({ where }: any) => {
      const ownsDevice = where?.caregiverId === CAREGIVER_A_ID && where?.deviceId === DEVICE_ID;
      const ownsPatient = where?.caregiverId === CAREGIVER_A_ID && where?.id === PATIENT_ID;
      return ownsDevice || ownsPatient
        ? { id: PATIENT_ID, name: "E2E Patient", deviceId: DEVICE_ID }
        : null;
    });
    p.patient.findUnique.mockImplementation(async ({ where }: any) =>
      where?.deviceId === DEVICE_ID || where?.id === PATIENT_ID
        ? patientContext
        : null
    );

    p.aiSession.create.mockImplementation(async ({ data }: any) => {
      aiSession = {
        id: AI_SESSION_ID,
        patientId: data.patientId,
        helpEventId: data.helpEventId,
        status: data.status,
        metadata: data.metadata,
        startedAt: new Date("2026-07-15T10:30:00.000Z"),
        endedAt: null,
      };
      return { id: aiSession.id };
    });
    p.aiSession.findUnique.mockImplementation(async ({ where }: any) =>
      aiSession?.id === where?.id ? aiSession : null
    );
    p.aiSession.update.mockImplementation(async ({ where, data }: any) => {
      if (!aiSession || aiSession.id !== where.id) return null;
      Object.assign(aiSession, data);
      return aiSession;
    });
    p.aiSession.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (
        !aiSession ||
        aiSession.id !== where?.id ||
        !matchesStatus(aiSession.status, where?.status) ||
        (where?.endedAt === null && aiSession.endedAt !== null)
      ) {
        return { count: 0 };
      }
      Object.assign(aiSession, data);
      return { count: 1 };
    });
    p.aiSession.findMany.mockResolvedValue([]);
    p.aiSessionMessage.create.mockImplementation(async ({ data }: any) => {
      const created = { id: `message-${transcriptMessages.length + 1}`, ...data };
      transcriptMessages.push(created);
      return created;
    });

    p.streamSession.findFirst.mockImplementation(async ({ where }: any) => {
      const aiSessionId =
        typeof where?.metadata?.equals === "string"
          ? where.metadata.equals
          : undefined;
      if (typeof aiSessionId === "string") {
        return streamSessions.find(
          (session) =>
            session.patientId === where.patientId && session.metadata?.aiSessionId === aiSessionId
        ) ?? null;
      }
      if (where?.id) {
        const session = streamSessions.find((candidate) => candidate.id === where.id) ?? null;
        if (!session) return null;
        if (where?.patientId && session.patientId !== where.patientId) return null;
        if (where?.patient?.caregiverId && where.patient.caregiverId !== CAREGIVER_A_ID) return null;
        return session;
      }
      return streamSessions.find(
        (session) =>
          session.patientId === where?.patientId && matchesStatus(session.status, where?.status)
      ) ?? null;
    });
    p.streamSession.findMany.mockImplementation(async ({ where }: any) =>
      streamSessions.filter((session) => {
        if (where?.patientId && session.patientId !== where.patientId) return false;
        if (where?.metadata?.equals && session.metadata?.aiSessionId !== where.metadata.equals) return false;
        if (where?.source && session.source !== where.source) return false;
        return matchesStatus(session.status, where?.status) &&
          (where?.endedAt !== null || session.endedAt === null);
      })
    );
    p.streamSession.create.mockImplementation(async ({ data }: any) => {
      const created = {
        id: `stream-e2e-${++streamSequence}`,
        ...data,
        createdAt: new Date("2026-07-15T10:30:01.000Z"),
        endedAt: data.endedAt ?? null,
      };
      streamSessions.push(created);
      return created;
    });
    p.streamSession.update.mockImplementation(async ({ where, data }: any) => {
      const session = streamSessions.find((candidate) => candidate.id === where.id);
      if (!session) return null;
      Object.assign(session, data);
      return session;
    });
    p.$transaction.mockImplementation((callback: (transaction: typeof p) => unknown) => callback(p));
    p.helpEvent.findUnique.mockResolvedValue(null);
    p.helpEvent.findFirst.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, json: vi.fn().mockResolvedValue({ status: "registered" }) })
    );
  });

  it("runs the authorized mobile-to-frame-to-terminal lifecycle without persisting imagery", async () => {
    const ownerToken = tokenFor(CAREGIVER_A_ID);
    const otherToken = tokenFor(CAREGIVER_B_ID);
    const owner = {
      get: (path: string) => request(app).get(path).set("Authorization", `Bearer ${ownerToken}`),
      post: (path: string) => request(app).post(path).set("Authorization", `Bearer ${ownerToken}`),
    };
    const other = {
      get: (path: string) => request(app).get(path).set("Authorization", `Bearer ${otherToken}`),
      post: (path: string) => request(app).post(path).set("Authorization", `Bearer ${otherToken}`),
    };

    const start = await owner.post("/api/mobile/ai-sessions/start").send({
      deviceId: DEVICE_ID,
      sourceDevice: "phone",
      vitals: {
        heart_rate: 80,
        motion_state: "walking",
        step_count: 12,
        timestamp: "2026-07-15T10:30:00.000Z",
      },
      beacons: [],
    });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ success: true, sessionId: AI_SESSION_ID });
    expect(fetch).toHaveBeenCalledWith(
      "http://anthony.test/session/start",
      expect.objectContaining({ method: "POST" })
    );

    const initialFrame = {
      seq: 1,
      ts: "2026-07-15T10:30:02.000000+00:00",
      image: { mime: "image/jpeg", b64: TINY_JPEG_B64 },
      vision: { label: "kitchen", flags: ["person_seated"], advisory_flags: ["no_motion"] },
    };
    const frameAccepted = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(initialFrame);
    expect(frameAccepted.status).toBe(202);
    expect(frameAccepted.body).toMatchObject({ accepted: true, seq: 1 });

    const streamId = "stream-e2e-1";
    const ownerFrame = await owner.get(`/api/stream-sessions/${streamId}/frame/latest`);
    expect(ownerFrame.status).toBe(200);
    expect(ownerFrame.body.data).toMatchObject({
      available: true,
      seq: 1,
      image: { mime: "image/jpeg", b64: TINY_JPEG_B64 },
    });
    expect(ownerFrame.headers["cache-control"]).toBe("private, no-store, max-age=0");

    const ownerStatus = await owner.get(`/api/patients/${PATIENT_ID}/stream-status`);
    expect(ownerStatus.status).toBe(200);
    expect(ownerStatus.body.data).toMatchObject({
      hasActiveStream: true,
      activeSession: { id: streamId, source: "glasses", aiSessionId: AI_SESSION_ID },
    });

    expect((await other.get(`/api/stream-sessions/${streamId}/frame/latest`)).status).toBe(404);
    expect((await other.get(`/api/patients/${PATIENT_ID}/stream-status`)).status).toBe(404);

    const duplicate = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(initialFrame);
    const outOfOrder = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ ...initialFrame, seq: 0 });
    expect(duplicate.body).toMatchObject({ accepted: false, reason: "duplicate" });
    expect(outOfOrder.body).toMatchObject({ accepted: false, reason: "out_of_order" });

    const visionOnly = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({
        seq: 2,
        ts: "2026-07-15T10:30:03.000000+00:00",
        vision: { description: "Scene unchanged", flags: [] },
      });
    expect(visionOnly.body).toMatchObject({ accepted: true, seq: 2 });
    const visionOnlyRead = await owner.get(`/api/stream-sessions/${streamId}/frame/latest`);
    expect(visionOnlyRead.body.data).toMatchObject({
      available: true,
      seq: 2,
      image: { b64: TINY_JPEG_B64 },
      vision: { description: "Scene unchanged" },
    });

    const conclusion = {
      id: "anthony-conclusion-e2e",
      patient_id: PATIENT_ID,
      related_caretaker_id: CAREGIVER_A_ID,
      started_at: "2026-07-15T10:30:00+00:00",
      ended_at: "2026-07-15T10:31:00+00:00",
      handoff_at: null,
      handoff_type: "patient_ended",
      transcript: [{ role: "agent", text: "Session complete", ts: "2026-07-15T10:31:00+00:00" }],
      final_scene_label: "kitchen",
      escalated: false,
      status: "ended",
      outcome: "patient_ended",
    };
    const conclude = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/conclude`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(conclusion);
    const concludeRetry = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/conclude`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(conclusion);
    expect(conclude.status).toBe(200);
    expect(concludeRetry.status).toBe(200);

    const terminalFrame = await owner.get(`/api/stream-sessions/${streamId}/frame/latest`);
    expect(terminalFrame.body.data).toMatchObject({ available: false, frameStatus: "ended" });
    expect(terminalFrame.body.data.image).toBeUndefined();
    expect(getLatestFrame(AI_SESSION_ID)).toBeNull();

    const mobileStream = await owner.post("/api/mobile/stream/start").send({
      deviceId: DEVICE_ID,
      source: "phone",
      status: "active",
    });
    const mobileStreamId = mobileStream.body.data.id;
    expect(mobileStream.status).toBe(201);
    expect(
      (await other.post("/api/mobile/stream/stop").send({
        deviceId: DEVICE_ID,
        streamSessionId: mobileStreamId,
      })).status
    ).toBe(404);
    const ownerStop = await owner.post("/api/mobile/stream/stop").send({
      deviceId: DEVICE_ID,
      streamSessionId: mobileStreamId,
    });
    expect(ownerStop.status).toBe(200);
    expect(ownerStop.body.data).toMatchObject({ id: mobileStreamId, status: "ended" });
  });
});
