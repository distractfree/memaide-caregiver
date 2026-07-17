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

vi.mock("../lib/prisma", () => ({
  prisma: {
    aiSession: { findUnique: vi.fn() },
    streamSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";
import {
  acceptLatestFrame,
  clearExpiredFrames,
  getLatestFrame,
  resetLatestFrameStoreForTests,
} from "../modules/ai-sessions/latest-ai-frame.store";

const CALLBACK_KEY = "test-frame-callback-key";
const JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a";
const CAREGIVER_B_ID = "caregiver-b";
const AI_SESSION_ID = "ai-session-frame-001";
const STREAM_SESSION_ID = "stream-session-frame-001";
const PATIENT_ID = "patient-frame-001";
const TINY_JPEG_B64 = "/9j/2Q==";

const callbackSession = {
  id: AI_SESSION_ID,
  patientId: PATIENT_ID,
  helpEventId: "help-event-frame-001",
  status: "active",
  endedAt: null,
};

const framePayload = {
  seq: 12,
  ts: "2026-07-15T10:32:00.000000+00:00",
  vision: {
    description: "An older adult seated at a kitchen table.",
    label: "kitchen",
    flags: ["person_seated"],
    advisory_flags: ["no_motion"],
  },
  image: { mime: "image/jpeg", b64: TINY_JPEG_B64 },
};

const p = prisma as any;

function caregiverToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, JWT_SECRET, { expiresIn: "1h" });
}

function latestFrameInput(overrides: Partial<{ aiSessionId: string; patientId: string; seq: number }> = {}) {
  return {
    aiSessionId: overrides.aiSessionId ?? AI_SESSION_ID,
    patientId: overrides.patientId ?? PATIENT_ID,
    seq: overrides.seq ?? 1,
    capturedAt: "2026-07-15T10:32:00.000Z",
    receivedAt: "2026-07-15T10:32:01.000Z",
    image: { mime: "image/jpeg" as const, b64: TINY_JPEG_B64 },
    vision: {
      description: "Kitchen scene",
      label: "kitchen",
      flags: ["person_seated"],
      advisoryFlags: ["no_motion"],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLatestFrameStoreForTests();
  process.env.AI_CALLBACK_API_KEY = CALLBACK_KEY;
  process.env.AI_FRAME_MAX_DECODED_BYTES = "786432";
  process.env.AI_FRAME_CACHE_TTL_SECONDS = "300";
  process.env.AI_FRAME_CACHE_MAX_SESSIONS = "50";

  p.aiSession.findUnique.mockResolvedValue(callbackSession);
  p.streamSession.findFirst.mockResolvedValue(null);
  p.streamSession.findMany.mockResolvedValue([]);
  p.streamSession.create.mockImplementation(async ({ data }: any) => ({
    id: STREAM_SESSION_ID,
    ...data,
  }));
  p.streamSession.update.mockImplementation(async ({ where, data }: any) => ({
    id: where.id,
    ...data,
  }));
});

describe("latest AI frame store", () => {
  it("keeps one latest record per session, isolates sessions, and replaces newer frames", () => {
    acceptLatestFrame(latestFrameInput({ seq: 1 }));
    acceptLatestFrame(latestFrameInput({ seq: 2 }));
    acceptLatestFrame(latestFrameInput({ aiSessionId: "another-session", seq: 0 }));

    expect(getLatestFrame(AI_SESSION_ID)?.seq).toBe(2);
    expect(getLatestFrame("another-session")?.seq).toBe(0);
  });

  it("acknowledges duplicate and out-of-order events without replacement", () => {
    acceptLatestFrame(latestFrameInput({ seq: 5 }));

    expect(acceptLatestFrame(latestFrameInput({ seq: 5 }))).toMatchObject({
      accepted: false,
      reason: "duplicate",
    });
    expect(acceptLatestFrame(latestFrameInput({ seq: 4 }))).toMatchObject({
      accepted: false,
      reason: "out_of_order",
    });
    expect(getLatestFrame(AI_SESSION_ID)?.seq).toBe(5);
  });

  it("preserves the latest actual JPEG during a newer vision-only event", () => {
    acceptLatestFrame(latestFrameInput({ seq: 1 }));
    const next = acceptLatestFrame({
      ...latestFrameInput({ seq: 2 }),
      image: null,
      vision: {
        description: "Scene unchanged",
        label: "kitchen",
        flags: [],
        advisoryFlags: ["no_motion"],
      },
    });

    expect(next).toMatchObject({ accepted: true });
    const stored = getLatestFrame(AI_SESSION_ID)!;
    expect(stored.seq).toBe(2);
    expect(stored.image?.b64).toBe(TINY_JPEG_B64);
    expect(stored.imageUpdated).toBe(false);
    expect(stored.imageSeq).toBe(1);
    expect(stored.vision.description).toBe("Scene unchanged");
  });

  it("expires records and evicts the oldest session at the configured bound", () => {
    process.env.AI_FRAME_CACHE_TTL_SECONDS = "1";
    acceptLatestFrame(latestFrameInput({ seq: 1 }));
    expect(clearExpiredFrames(Date.now() + 1001)).toBe(1);
    expect(getLatestFrame(AI_SESSION_ID)).toBeNull();

    process.env.AI_FRAME_CACHE_MAX_SESSIONS = "1";
    acceptLatestFrame(latestFrameInput({ aiSessionId: "first", seq: 1 }));
    acceptLatestFrame(latestFrameInput({ aiSessionId: "second", seq: 1 }));
    expect(getLatestFrame("first")).toBeNull();
    expect(getLatestFrame("second")).not.toBeNull();
  });
});

describe("POST /api/ai-sessions/:sessionId/frames", () => {
  it.each([undefined, "wrong-frame-key"])(
    "rejects a missing or incorrect callback key without exposing it",
    async (key) => {
      const req = request(app).post(`/api/ai-sessions/${AI_SESSION_ID}/frames`).send(framePayload);
      if (key) req.set("X-Api-Key", key);

      const res = await req;
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(CALLBACK_KEY);
      expect(p.aiSession.findUnique).not.toHaveBeenCalled();
    }
  );

  it("rejects an unauthenticated oversized frame before invoking the frame parser", async () => {
    const oversizedBase64 = Buffer.alloc(800 * 1024, 0xff).toString("base64");

    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .send({
        seq: 1,
        ts: framePayload.ts,
        image: { mime: "image/jpeg", b64: oversizedBase64 },
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_AI_CALLBACK_API_KEY");
    expect(p.aiSession.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a full JPEG plus vision payload and persists only lightweight metadata", async () => {
    const startedAt = performance.now();
    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(framePayload);

    expect(res.status).toBe(202);
    // The mocked database path should remain comfortably inside Anthony's
    // five-second timeout budget; no image work is performed on this path.
    expect(performance.now() - startedAt).toBeLessThan(5000);
    expect(res.body).toEqual(
      expect.objectContaining({ success: true, accepted: true, sessionId: AI_SESSION_ID, seq: 12 })
    );
    expect(p.streamSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patientId: PATIENT_ID,
          source: "glasses",
          status: "active",
          viewerUrl: null,
          metadata: expect.objectContaining({
            aiSessionId: AI_SESSION_ID,
            lastFrameSeq: 12,
            visionDescription: framePayload.vision.description,
            advisoryFlags: ["no_motion"],
          }),
        }),
      })
    );
    expect(JSON.stringify(p.streamSession.create.mock.calls)).not.toContain(TINY_JPEG_B64);
  });

  it("accepts vision-only and image-only callbacks", async () => {
    const visionOnly = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ seq: 1, ts: framePayload.ts, vision: { label: "kitchen", flags: ["open_vocabulary"] } });
    expect(visionOnly.status).toBe(202);

    resetLatestFrameStoreForTests();
    p.streamSession.findFirst.mockResolvedValue(null);
    const imageOnly = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ seq: 2, ts: framePayload.ts, image: framePayload.image });
    expect(imageOnly.status).toBe(202);
  });

  it.each([
    ["negative sequence", { ...framePayload, seq: -1 }],
    ["non-integer sequence", { ...framePayload, seq: 1.5 }],
    ["invalid timestamp", { ...framePayload, ts: "not-a-time" }],
    ["missing meaningful content", { seq: 0, ts: framePayload.ts }],
    ["non-JPEG mime", { ...framePayload, image: { mime: "image/png", b64: TINY_JPEG_B64 } }],
    ["data URL", { ...framePayload, image: { mime: "image/jpeg", b64: `data:image/jpeg;base64,${TINY_JPEG_B64}` } }],
    ["malformed base64", { ...framePayload, image: { mime: "image/jpeg", b64: "not valid base64!" } }],
    ["client-supplied patient identity", { ...framePayload, patientId: "another-patient" }],
    ["long description", { ...framePayload, vision: { description: "x".repeat(2001) } }],
    ["too many flags", { ...framePayload, vision: { flags: Array.from({ length: 51 }, (_, i) => `flag_${i}`) } }],
    ["too many advisory flags", { ...framePayload, vision: { advisory_flags: Array.from({ length: 51 }, (_, i) => `flag_${i}`) } }],
  ])("rejects %s", async (_description, body) => {
    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(body);
    expect(res.status).toBe(400);
    expect(p.aiSession.findUnique).not.toHaveBeenCalled();
  });

  it("enforces the configured decoded image limit without processing an image", async () => {
    process.env.AI_FRAME_MAX_DECODED_BYTES = "3";
    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(framePayload);
    expect(res.status).toBe(400);
    expect(p.aiSession.findUnique).not.toHaveBeenCalled();
  });

  it("accepts six-digit fractional timestamps and open-vocabulary flags", async () => {
    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({
        seq: 0,
        ts: "2026-07-15T10:32:00.123456+00:00",
        vision: { flags: ["future_custom_rule"] },
      });
    expect(res.status).toBe(202);
  });

  it("allows a frame above the global 10 KB limit while ordinary callbacks retain it", async () => {
    const largerJpeg = Buffer.alloc(12 * 1024, 0xff).toString("base64");
    const frame = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ seq: 30, ts: framePayload.ts, image: { mime: "image/jpeg", b64: largerJpeg } });
    expect(frame.status).toBe(202);

    const ordinary = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/escalation`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ reason: "x".repeat(11 * 1024), triggered_by: [] });
    expect(ordinary.status).toBe(413);
    expect(ordinary.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns 404 for unknown sessions and 409 without mutation for terminal sessions", async () => {
    p.aiSession.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(app)
      .post("/api/ai-sessions/unknown/frames")
      .set("X-Api-Key", CALLBACK_KEY)
      .send(framePayload);
    expect(unknown.status).toBe(404);

    p.aiSession.findUnique.mockResolvedValueOnce({ ...callbackSession, status: "resolved", endedAt: new Date() });
    const terminal = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(framePayload);
    expect(terminal.status).toBe(409);
    expect(terminal.body.code).toBe("AI_SESSION_NOT_ACTIVE");
    expect(p.streamSession.create).not.toHaveBeenCalled();
    expect(p.streamSession.update).not.toHaveBeenCalled();
    expect(getLatestFrame(AI_SESSION_ID)).toBeNull();
  });

  it("rejects an inconsistent late frame when its historical stream is already terminal", async () => {
    p.streamSession.findFirst.mockResolvedValue({
      id: STREAM_SESSION_ID,
      patientId: PATIENT_ID,
      status: "ended",
      endedAt: new Date("2026-07-15T10:33:00.000Z"),
      metadata: { aiSessionId: AI_SESSION_ID },
    });

    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(framePayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STREAM_SESSION_NOT_ACTIVE");
    expect(getLatestFrame(AI_SESSION_ID)).toBeNull();
    expect(p.streamSession.create).not.toHaveBeenCalled();
    expect(p.streamSession.update).not.toHaveBeenCalled();
  });

  it("acknowledges duplicate/out-of-order events and does not update the stream metadata", async () => {
    const first = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ ...framePayload, seq: 10 });
    expect(first.status).toBe(202);

    const duplicate = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ ...framePayload, seq: 10, vision: { label: "changed" } });
    const old = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ ...framePayload, seq: 9 });

    expect(duplicate.body).toMatchObject({ accepted: false, reason: "duplicate" });
    expect(old.body).toMatchObject({ accepted: false, reason: "out_of_order" });
    expect(p.streamSession.create).toHaveBeenCalledTimes(1);
    expect(p.streamSession.update).not.toHaveBeenCalled();
    expect(getLatestFrame(AI_SESSION_ID)?.vision.label).toBe("kitchen");
  });

  it("updates vision while retaining a prior JPEG on a newer vision-only event", async () => {
    await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ ...framePayload, seq: 1 });

    p.streamSession.findFirst.mockResolvedValue({
      id: STREAM_SESSION_ID,
      status: "active",
      metadata: { aiSessionId: AI_SESSION_ID },
    });
    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send({ seq: 2, ts: framePayload.ts, vision: { description: "Scene unchanged" } });

    expect(res.status).toBe(202);
    expect(getLatestFrame(AI_SESSION_ID)).toMatchObject({
      seq: 2,
      image: { b64: TINY_JPEG_B64 },
      imageUpdated: false,
      imageSeq: 1,
      vision: { description: "Scene unchanged" },
    });
    expect(p.streamSession.create).toHaveBeenCalledTimes(1);
    expect(p.streamSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STREAM_SESSION_ID },
        data: expect.objectContaining({ status: "active" }),
      })
    );
  });

  it("ends an older active glasses stream while preserving its history", async () => {
    p.streamSession.findMany.mockResolvedValue([
      {
        id: "older-glasses-stream",
        status: "active",
        endedAt: null,
        metadata: { aiSessionId: "older-ai-session" },
      },
    ]);

    const res = await request(app)
      .post(`/api/ai-sessions/${AI_SESSION_ID}/frames`)
      .set("X-Api-Key", CALLBACK_KEY)
      .send(framePayload);

    expect(res.status).toBe(202);
    expect(p.streamSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "older-glasses-stream" },
        data: expect.objectContaining({
          status: "ended",
          metadata: expect.objectContaining({
            supersededByAiSessionId: AI_SESSION_ID,
            supersededReason: "superseded_by_new_ai_session",
          }),
        }),
      })
    );
  });
});

describe("GET /api/stream-sessions/:id/frame/latest", () => {
  it("requires a caregiver JWT", async () => {
    const res = await request(app).get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`);
    expect(res.status).toBe(401);
  });

  it("returns a matching caregiver's cached image and vision with no-store headers", async () => {
    acceptLatestFrame(latestFrameInput({ seq: 8 }));
    p.streamSession.findFirst.mockResolvedValue({
      id: STREAM_SESSION_ID,
      patientId: PATIENT_ID,
      status: "active",
      endedAt: null,
      metadata: { aiSessionId: AI_SESSION_ID },
    });

    const res = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`)
      .set("Authorization", `Bearer ${caregiverToken(CAREGIVER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(res.headers.pragma).toBe("no-cache");
    expect(res.body.data).toMatchObject({
      available: true,
      streamSessionId: STREAM_SESSION_ID,
      aiSessionId: AI_SESSION_ID,
      seq: 8,
      image: { mime: "image/jpeg", b64: TINY_JPEG_B64 },
      vision: { advisoryFlags: ["no_motion"] },
    });
  });

  it.each([
    ["ended", "ended"],
    ["failed", "failed"],
    ["unavailable", "unavailable"],
  ] as const)("never returns a cached image for a %s stream", async (status, frameStatus) => {
    acceptLatestFrame(latestFrameInput({ seq: 8 }));
    p.streamSession.findFirst.mockResolvedValue({
      id: STREAM_SESSION_ID,
      patientId: PATIENT_ID,
      status,
      endedAt: new Date("2026-07-15T10:33:00.000Z"),
      metadata: { aiSessionId: AI_SESSION_ID },
    });

    const res = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`)
      .set("Authorization", `Bearer ${caregiverToken(CAREGIVER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ available: false, frameStatus });
    expect(res.body.data.image).toBeUndefined();
  });

  it("blocks a stale cache entry when the associated AI session is terminal", async () => {
    acceptLatestFrame(latestFrameInput({ seq: 8 }));
    p.streamSession.findFirst.mockResolvedValue({
      id: STREAM_SESSION_ID,
      patientId: PATIENT_ID,
      status: "active",
      endedAt: null,
      metadata: { aiSessionId: AI_SESSION_ID },
    });
    p.aiSession.findUnique.mockResolvedValue({
      patientId: PATIENT_ID,
      status: "resolved",
      endedAt: new Date("2026-07-15T10:33:00.000Z"),
    });

    const res = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`)
      .set("Authorization", `Bearer ${caregiverToken(CAREGIVER_A_ID)}`);

    expect(res.body.data).toMatchObject({ available: false, frameStatus: "ended" });
    expect(res.body.data.image).toBeUndefined();
  });

  it("rejects another caregiver and returns waiting when no valid cache entry remains", async () => {
    p.streamSession.findFirst.mockResolvedValueOnce(null);
    const forbidden = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`)
      .set("Authorization", `Bearer ${caregiverToken(CAREGIVER_B_ID)}`);
    expect(forbidden.status).toBe(404);

    p.streamSession.findFirst.mockResolvedValueOnce({
      id: STREAM_SESSION_ID,
      patientId: PATIENT_ID,
      status: "active",
      endedAt: null,
      metadata: { aiSessionId: AI_SESSION_ID },
    });
    const waiting = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`)
      .set("Authorization", `Bearer ${caregiverToken(CAREGIVER_A_ID)}`);
    expect(waiting.status).toBe(200);
    expect(waiting.body.data).toMatchObject({ available: false, frameStatus: "waiting" });
  });

  it("does not leak a cached frame when its patient ID differs from the stream session", async () => {
    acceptLatestFrame(latestFrameInput({ patientId: "another-patient" }));
    p.streamSession.findFirst.mockResolvedValue({
      id: STREAM_SESSION_ID,
      patientId: PATIENT_ID,
      status: "active",
      endedAt: null,
      metadata: { aiSessionId: AI_SESSION_ID },
    });
    const res = await request(app)
      .get(`/api/stream-sessions/${STREAM_SESSION_ID}/frame/latest`)
      .set("Authorization", `Bearer ${caregiverToken(CAREGIVER_A_ID)}`);
    expect(res.body.data).toMatchObject({ available: false, frameStatus: "waiting" });
  });
});
