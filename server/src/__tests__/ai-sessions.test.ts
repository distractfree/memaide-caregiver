import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

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
      findUnique: vi.fn(),
    },
    caregiver: {
      findUnique: vi.fn(),
    },
    aiSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    aiSessionMessage: {
      create: vi.fn(),
    },
    helpEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    helpContact: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      aiSession: { update: vi.fn().mockResolvedValue({}) },
      aiSessionMessage: { create: vi.fn().mockResolvedValue({}) }
    })),
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const caregiverId = "caregiver-id";
const otherCaregiverId = "other-caregiver-id";
const caregiverToken = jwt.sign({ sub: caregiverId }, "test-jwt-secret-vitest-min16chars", { expiresIn: "1h" });
const otherCaregiverToken = jwt.sign({ sub: otherCaregiverId }, "test-jwt-secret-vitest-min16chars", { expiresIn: "1h" });

const patientId = "patient-id";
const deviceId = "test-device-id";
const helpEventId = "cm0y7w29w00003b715x18h6o0";
const aiSessionId = "ai-session-id";
const aiAgentUrl = "http://ai-agent.test";
const aiAgentWsUrl = "ws://ai-agent.test";
const aiAgentApiKey = "test-agent-key";
const aiCallbackApiKey = "test-callback-key";
const startVitals = {
  heart_rate: 82,
  motion_state: "walking",
  step_count: 1200,
  timestamp: "2026-07-08T02:10:00Z",
};
const startBeacon = {
  room: "kitchen",
  detected_at: "2026-07-08T02:10:00Z",
  dwell_seconds: 45,
  estimated_distance_m: 1.5,
  exited_at: null,
};
const escalationBody = {
  reason: "fall detected",
  triggered_by: ["audio", "vision"],
};
const concludeBody = {
  id: "abc-123",
  patient_id: patientId,
  related_caretaker_id: caregiverId,
  started_at: "2026-07-08T02:10:00+00:00",
  ended_at: "2026-07-08T02:14:32+00:00",
  handoff_at: null,
  handoff_type: "patient_ended",
  transcript: [
    {
      role: "agent",
      text: "Hi Rose, I'm here to help. What's going on?",
      ts: "2026-07-08T02:10:01+00:00",
      scene_label: null,
    },
    {
      role: "patient",
      text: "I can't find my pills",
      ts: "2026-07-08T02:10:20+00:00",
      scene_label: "kitchen",
    },
  ],
  final_scene_label: "kitchen",
  escalated: false,
  status: "ended",
  outcome: "patient_ended",
};

const patientContext = {
  id: patientId,
  deviceId,
  name: "Mary Johnson",
  phoneNumber: null,
  caregiver: {
    id: caregiverId,
    name: "Arian Caregiver",
  },
  reminders: [
    {
      id: "reminder-medication",
      type: "medication",
      description: "Take morning medication",
      timeOfDay: "08:00",
      frequency: "daily",
    },
  ],
  helpContacts: [
    {
      whatsappNumber: "+18185550123",
      label: "Primary caregiver",
    },
  ],
  vitalEvents: [
    {
      timestamp: new Date("2026-07-08T01:55:00.000Z"),
      heartRate: 78,
      motionState: "idle",
      stepCount: 900,
    },
  ],
  beaconEvents: [
    {
      roomName: "Living Room",
      detectedAt: new Date("2026-07-08T01:50:00.000Z"),
      exitedAt: null,
      dwellSeconds: 120,
      estimatedDistanceM: 2.4,
    },
  ],
  helpEvents: [
    {
      id: "help-event-1",
      triggeredAt: new Date("2026-07-07T22:00:00.000Z"),
      sourceDevice: "watch",
      status: "triggered",
    },
  ],
  aiSessions: [
    {
      id: "previous-ai-session",
      status: "resolved",
      startedAt: new Date("2026-07-07T22:01:00.000Z"),
      endedAt: new Date("2026-07-07T22:10:00.000Z"),
      summary: "Previous resolved support session.",
    },
  ],
};

function mockAiAgentResponse(status: number, body: unknown = { status: "registered" }) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    json: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setupSuccessfulAiStart() {
  p.patient.findUnique.mockResolvedValue(patientContext);
  p.aiSession.create.mockResolvedValue({ id: aiSessionId });
  p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });
  return mockAiAgentResponse(200);
}

describe("AI Sessions (Backend Implementation)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env.AI_AGENT_URL = aiAgentUrl;
    process.env.AI_AGENT_WS_URL = aiAgentWsUrl;
    process.env.AI_AGENT_API_KEY = aiAgentApiKey;
    process.env.AI_AGENT_TIMEOUT_MS = "5000";
    process.env.AI_CALLBACK_API_KEY = aiCallbackApiKey;
  });

  describe("Mobile Endpoints", () => {
    it("returns 200 when deviceId exists and Anthony returns registered", async () => {
      setupSuccessfulAiStart();

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        vitals: startVitals,
        beacons: [startBeacon],
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        sessionId: aiSessionId,
        websocketUrl: aiAgentWsUrl,
        helloMessage: {
          type: "hello",
          session_id: aiSessionId,
        },
      });
      expect(p.aiSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId,
            status: "starting",
          }),
        })
      );
      expect(p.aiSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: aiSessionId },
          data: expect.objectContaining({ status: "active" }),
        })
      );
    });

    it("should start an AI session linked to a valid helpEventId", async () => {
      setupSuccessfulAiStart();
      p.helpEvent.findUnique.mockResolvedValue({ id: helpEventId, patientId });

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        helpEventId,
        sourceDevice: "phone"
      });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(aiSessionId);
      expect(p.aiSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            helpEventId,
          }),
        })
      );
    });

    it("should reject AI session start if helpEventId belongs to another patient", async () => {
      p.patient.findUnique.mockResolvedValue(patientContext);
      p.helpEvent.findUnique.mockResolvedValue({ id: helpEventId, patientId: "other-patient" });

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        helpEventId,
        sourceDevice: "phone"
      });
      expect(res.status).toBe(404);
      expect(p.aiSession.create).not.toHaveBeenCalled();
    });

    it("returns 404 when deviceId does not match a patient", async () => {
      p.patient.findUnique.mockResolvedValue(null);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId: "unknown-device",
      });
      expect(res.status).toBe(404);
      expect(p.aiSession.create).not.toHaveBeenCalled();
    });

    it.each([401, 422, 503])("returns 502 when Anthony returns %s", async (statusCode) => {
      p.patient.findUnique.mockResolvedValue(patientContext);
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "start_failed" });
      mockAiAgentResponse(statusCode);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        vitals: startVitals,
        beacons: [startBeacon],
      });

      expect(res.status).toBe(502);
      // Non-production responses include safe upstream diagnostics (no API key).
      expect(res.body).toEqual({
        success: false,
        message: "AI backend session start failed",
        details: {
          upstreamStatus: statusCode,
          upstreamBody: expect.any(String),
        },
      });
      expect(p.aiSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: aiSessionId },
          data: expect.objectContaining({ status: "start_failed" }),
        })
      );
    });

    it("returns 504 when Anthony times out", async () => {
      process.env.AI_AGENT_TIMEOUT_MS = "1";
      p.patient.findUnique.mockResolvedValue(patientContext);
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "start_failed" });

      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          });
        })
      );

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        vitals: startVitals,
      });

      expect(res.status).toBe(504);
      expect(res.body).toEqual({
        success: false,
        message: "AI backend session start failed",
      });
      expect(p.aiSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: aiSessionId },
          data: expect.objectContaining({ status: "start_failed" }),
        })
      );
    });

    it("does not return success before Anthony returns registered", async () => {
      p.patient.findUnique.mockResolvedValue(patientContext);
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });

      let resolveFetch: (value: unknown) => void = () => undefined;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

      let settled = false;
      const pendingResponse = request(app)
        .post("/api/mobile/ai-sessions/start")
        .send({ deviceId, vitals: startVitals })
        .then((response) => {
          settled = true;
          return response;
        });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);

      resolveFetch({
        status: 200,
        json: vi.fn().mockResolvedValue({ status: "registered" }),
      });

      const res = await pendingResponse;
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("sends the required session context to Anthony", async () => {
      const fetchMock = setupSuccessfulAiStart();

      await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        vitals: startVitals,
        beacons: [startBeacon],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${aiAgentUrl}/session/start`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "X-Api-Key": aiAgentApiKey,
            "Content-Type": "application/json",
          },
          body: expect.any(String),
        })
      );

      const [, requestOptions] = fetchMock.mock.calls[0];
      const anthonyBody = JSON.parse(String(requestOptions.body));

      expect(anthonyBody).toEqual(
        expect.objectContaining({
          session_id: aiSessionId,
          vitals: startVitals,
        })
      );
      expect(anthonyBody.patient).toEqual(
        expect.objectContaining({
          patient_id: patientId,
          name: "Mary Johnson",
          preferred_name: "Mary Johnson",
        })
      );
      expect(anthonyBody.patient.caregiver).toEqual(
        expect.objectContaining({
          id: caregiverId,
          name: "Arian Caregiver",
          phone: "+18185550123",
        })
      );
      expect(anthonyBody.patient.medications).toEqual([
        {
          name: "Take morning medication",
          schedule: "08:00 daily",
          active: true,
        },
      ]);
      expect(anthonyBody.beacons[0]).toEqual(startBeacon);
      expect(anthonyBody.beacons).toContainEqual({
        room: "Living Room",
        detected_at: "2026-07-08T01:50:00.000Z",
        dwell_seconds: 120,
        estimated_distance_m: 2.4,
        exited_at: null,
      });
    });

    it("accepts an explicit null vitals field", async () => {
      const fetchMock = setupSuccessfulAiStart();

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        vitals: null,
        beacons: [],
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("accepts an omitted vitals field", async () => {
      const fetchMock = setupSuccessfulAiStart();

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("accepts a valid vitals object", async () => {
      setupSuccessfulAiStart();

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        vitals: startVitals,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects a malformed vitals object with 400", async () => {
      p.patient.findUnique.mockResolvedValue(patientContext);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        // heart_rate out of range and required timestamp missing.
        vitals: { heart_rate: 500 },
      });

      expect(res.status).toBe(400);
      expect(p.aiSession.create).not.toHaveBeenCalled();
    });

    it("sends vitals: null to Anthony when no vitals are available", async () => {
      // Patient with no stored vitals, and no vitals in the request.
      p.patient.findUnique.mockResolvedValue({ ...patientContext, vitalEvents: [] });
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });
      const fetchMock = mockAiAgentResponse(200);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
      });

      expect(res.status).toBe(200);
      const [, requestOptions] = fetchMock.mock.calls[0];
      const anthonyBody = JSON.parse(String(requestOptions.body));
      expect(anthonyBody.vitals).toBeNull();
      expect(anthonyBody.session_id).toBe(aiSessionId);
      expect(anthonyBody.patient.patient_id).toBe(patientId);
      expect(anthonyBody.patient.name).toBe("Mary Johnson");
      expect(Array.isArray(anthonyBody.beacons)).toBe(true);
    });

    it("maps active reminders to Anthony medication objects with name, schedule, active", async () => {
      p.patient.findUnique.mockResolvedValue({
        ...patientContext,
        reminders: [
          {
            id: "reminder-1",
            type: "medication",
            description: "take your medication",
            timeOfDay: "10:18",
            frequency: "daily",
          },
        ],
      });
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });
      const fetchMock = mockAiAgentResponse(200);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
      });

      expect(res.status).toBe(200);
      const [, requestOptions] = fetchMock.mock.calls[0];
      const anthonyBody = JSON.parse(String(requestOptions.body));
      expect(anthonyBody.patient.medications).toEqual([
        {
          name: "take your medication",
          schedule: "10:18 daily",
          active: true,
        },
      ]);
    });

    it("never sends a medication object without a name", async () => {
      p.patient.findUnique.mockResolvedValue({
        ...patientContext,
        reminders: [
          // No description and no type: must still produce a named fallback.
          {
            id: "reminder-blank",
            type: "",
            description: "",
            timeOfDay: "09:00",
            frequency: "weekly",
          },
        ],
      });
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });
      const fetchMock = mockAiAgentResponse(200);

      await request(app).post("/api/mobile/ai-sessions/start").send({ deviceId });

      const [, requestOptions] = fetchMock.mock.calls[0];
      const anthonyBody = JSON.parse(String(requestOptions.body));
      expect(anthonyBody.patient.medications).toHaveLength(1);
      for (const medication of anthonyBody.patient.medications) {
        expect(typeof medication.name).toBe("string");
        expect(medication.name.length).toBeGreaterThan(0);
      }
      expect(anthonyBody.patient.medications[0].name).toBe("Medication reminder");
    });

    it("sends medications: [] when there are no active reminders", async () => {
      p.patient.findUnique.mockResolvedValue({ ...patientContext, reminders: [] });
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });
      const fetchMock = mockAiAgentResponse(200);

      await request(app).post("/api/mobile/ai-sessions/start").send({ deviceId });

      const [, requestOptions] = fetchMock.mock.calls[0];
      const anthonyBody = JSON.parse(String(requestOptions.body));
      expect(anthonyBody.patient.medications).toEqual([]);
    });

    it("should return initial scripted messages", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, patient: { deviceId }, messages: [{ message: "System" }, { message: "AI1" }, { message: "AI2" }] });

      const res = await request(app).get(`/api/mobile/ai-sessions/${aiSessionId}?deviceId=${deviceId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.messages).toBeDefined();
    });

    it("mobile get session requires matching deviceId", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, patient: { deviceId } });

      const res = await request(app).get(`/api/mobile/ai-sessions/${aiSessionId}?deviceId=other-device`);
      expect(res.status).toBe(404);
    });

    it("mobile message creates patient message and AI response", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, status: "active", patient: { deviceId }, messages: [] });
      p.$transaction.mockResolvedValue({ patientMessage: { message: "I feel dizzy" }, aiResponse: { message: "Response" }, sessionStatus: "active" });

      const res = await request(app).post(`/api/mobile/ai-sessions/${aiSessionId}/messages`).send({
        deviceId,
        message: "I feel dizzy",
        senderType: "patient"
      });
      expect(res.status).toBe(200);
    });

    it("high-risk words trigger safe emergency_suggested behavior", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, status: "active", patient: { deviceId }, messages: [] });
      p.$transaction.mockResolvedValue({ patientMessage: { message: "fall hurt" }, aiResponse: { message: "Response" }, sessionStatus: "emergency_suggested" });

      const res = await request(app).post(`/api/mobile/ai-sessions/${aiSessionId}/messages`).send({
        deviceId,
        message: "fall hurt",
        senderType: "patient"
      });
      expect(res.status).toBe(200);
      expect(res.body.data.sessionStatus).toBe("emergency_suggested");
    });

    it("emergency ack logs event but does not call emergency services", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, status: "emergency_suggested", patient: { deviceId } });
      p.aiSessionMessage.create.mockResolvedValue({});

      const res = await request(app).post(`/api/mobile/ai-sessions/${aiSessionId}/emergency-suggestion-ack`).send({
        deviceId,
        action: "call_initiated"
      });
      expect(res.status).toBe(200);
    });

    it("resolve session from mobile", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, status: "active", patient: { deviceId } });
      p.$transaction.mockResolvedValue({ status: "resolved" });

      const res = await request(app).post(`/api/mobile/ai-sessions/${aiSessionId}/resolve`).send({
        deviceId,
      });
      expect(res.status).toBe(200);
    });

    it("starting a new session supersedes previous non-terminal sessions", async () => {
      p.patient.findUnique.mockResolvedValue(patientContext);
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "active" });
      p.aiSession.findMany.mockResolvedValue([
        { id: "old-session-1", metadata: { sourceDevice: "phone" } },
      ]);
      mockAiAgentResponse(200);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({ deviceId });

      expect(res.status).toBe(200);
      // Only previous, non-terminal sessions for this patient are considered.
      expect(p.aiSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId,
            id: { not: aiSessionId },
            status: expect.objectContaining({ in: expect.arrayContaining(["active"]) }),
          }),
        })
      );
      // The previous session is closed and tagged as superseded, preserving history.
      expect(p.aiSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old-session-1" },
          data: expect.objectContaining({
            status: "cancelled",
            endedAt: expect.any(Date),
            metadata: expect.objectContaining({
              supersededBy: aiSessionId,
              supersededReason: "superseded_by_new_session",
            }),
          }),
        })
      );
    });

    it("a failed start does not supersede the patient's existing sessions", async () => {
      p.patient.findUnique.mockResolvedValue(patientContext);
      p.aiSession.create.mockResolvedValue({ id: aiSessionId });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "start_failed" });
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, metadata: null });
      mockAiAgentResponse(503);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({ deviceId });

      expect(res.status).toBe(502);
      // Supersede only runs after a successful registration.
      expect(p.aiSession.findMany).not.toHaveBeenCalled();
    });
  });

  describe("AI Backend Callback Endpoints", () => {
    it("escalation callback returns 200 with a valid API key", async () => {
      p.aiSession.findUnique.mockResolvedValue({
        id: aiSessionId,
        status: "active",
        emergencySuggestedAt: null,
        metadata: null,
      });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "emergency_suggested" });
      p.aiSessionMessage.create.mockResolvedValue({});

      const res = await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/escalation`)
        .set("X-Api-Key", aiCallbackApiKey)
        .send(escalationBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(p.aiSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: aiSessionId },
          data: expect.objectContaining({
            status: "emergency_suggested",
            emergencySuggestedAt: expect.any(Date),
            metadata: expect.objectContaining({
              aiEscalation: expect.objectContaining({
                reason: "fall detected",
                triggered_by: ["audio", "vision"],
              }),
            }),
          }),
        })
      );
      expect(p.aiSessionMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aiSessionId,
          senderType: "event",
          message: "AI escalation requested: fall detected",
          metadata: expect.objectContaining({
            type: "ai_escalation",
            reason: "fall detected",
            triggered_by: ["audio", "vision"],
          }),
        }),
      });
    });

    it.each([undefined, "wrong-key"])(
      "escalation callback returns 401 with missing or wrong API key",
      async (apiKey) => {
        const requestBuilder = request(app)
          .post(`/api/ai-sessions/${aiSessionId}/escalation`)
          .send(escalationBody);

        if (apiKey) {
          requestBuilder.set("X-Api-Key", apiKey);
        }

        const res = await requestBuilder;

        expect(res.status).toBe(401);
        expect(p.aiSession.findUnique).not.toHaveBeenCalled();
      }
    );

    it("escalation callback returns 404 for an unknown sessionId", async () => {
      p.aiSession.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/ai-sessions/unknown-session/escalation")
        .set("X-Api-Key", aiCallbackApiKey)
        .send(escalationBody);

      expect(res.status).toBe(404);
      expect(p.aiSession.update).not.toHaveBeenCalled();
      expect(p.aiSessionMessage.create).not.toHaveBeenCalled();
    });

    it("conclude callback returns 200 with a valid API key", async () => {
      p.aiSession.findUnique.mockResolvedValue({
        id: aiSessionId,
        status: "active",
        metadata: null,
      });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "resolved" });
      p.aiSessionMessage.create.mockResolvedValue({});

      const res = await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/conclude`)
        .set("X-Api-Key", aiCallbackApiKey)
        .send(concludeBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it("conclude callback saves transcript messages", async () => {
      p.aiSession.findUnique.mockResolvedValue({
        id: aiSessionId,
        status: "active",
        metadata: null,
      });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "resolved" });
      p.aiSessionMessage.create.mockResolvedValue({});

      await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/conclude`)
        .set("X-Api-Key", aiCallbackApiKey)
        .send(concludeBody);

      expect(p.aiSessionMessage.create).toHaveBeenCalledTimes(2);
      expect(p.aiSessionMessage.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          aiSessionId,
          senderType: "ai",
          message: "Hi Rose, I'm here to help. What's going on?",
          createdAt: new Date("2026-07-08T02:10:01+00:00"),
          metadata: expect.objectContaining({
            type: "ai_transcript",
            role: "agent",
            ts: "2026-07-08T02:10:01+00:00",
            scene_label: null,
          }),
        }),
      });
      expect(p.aiSessionMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          aiSessionId,
          senderType: "patient",
          message: "I can't find my pills",
          createdAt: new Date("2026-07-08T02:10:20+00:00"),
          metadata: expect.objectContaining({
            type: "ai_transcript",
            role: "patient",
            ts: "2026-07-08T02:10:20+00:00",
            scene_label: "kitchen",
          }),
        }),
      });
    });

    it("conclude callback updates session endedAt, status, and outcome metadata", async () => {
      p.aiSession.findUnique.mockResolvedValue({
        id: aiSessionId,
        status: "active",
        metadata: { sourceDevice: "phone" },
      });
      p.aiSession.update.mockResolvedValue({ id: aiSessionId, status: "resolved" });
      p.aiSessionMessage.create.mockResolvedValue({});

      await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/conclude`)
        .set("X-Api-Key", aiCallbackApiKey)
        .send(concludeBody);

      expect(p.aiSession.update).toHaveBeenCalledWith({
        where: { id: aiSessionId },
        data: expect.objectContaining({
          status: "resolved",
          endedAt: new Date("2026-07-08T02:14:32+00:00"),
          summary: expect.stringContaining("patient_ended"),
          metadata: expect.objectContaining({
            sourceDevice: "phone",
            aiConclusion: expect.objectContaining({
              anthony_session_id: "abc-123",
              outcome: "patient_ended",
              status: "ended",
              final_scene_label: "kitchen",
              transcript_message_count: 2,
            }),
          }),
        }),
      });
    });

    it.each([undefined, "wrong-key"])(
      "conclude callback returns 401 with missing or wrong API key",
      async (apiKey) => {
        const requestBuilder = request(app)
          .post(`/api/ai-sessions/${aiSessionId}/conclude`)
          .send(concludeBody);

        if (apiKey) {
          requestBuilder.set("X-Api-Key", apiKey);
        }

        const res = await requestBuilder;

        expect(res.status).toBe(401);
        expect(p.aiSession.findUnique).not.toHaveBeenCalled();
      }
    );

    it("conclude callback returns 404 for an unknown sessionId", async () => {
      p.aiSession.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/ai-sessions/unknown-session/conclude")
        .set("X-Api-Key", aiCallbackApiKey)
        .send(concludeBody);

      expect(res.status).toBe(404);
      expect(p.aiSession.update).not.toHaveBeenCalled();
      expect(p.aiSessionMessage.create).not.toHaveBeenCalled();
    });

    it("duplicate conclude callback is idempotent and does not duplicate transcripts", async () => {
      // Session already carries an aiConclusion (a prior conclude was recorded).
      p.aiSession.findUnique.mockResolvedValue({
        id: aiSessionId,
        status: "resolved",
        metadata: { aiConclusion: { anthony_session_id: "abc-123" } },
      });

      const res = await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/conclude`)
        .set("X-Api-Key", aiCallbackApiKey)
        .send(concludeBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      // Idempotent: no terminal-state rewrite and no duplicated transcript rows.
      expect(p.aiSession.update).not.toHaveBeenCalled();
      expect(p.aiSessionMessage.create).not.toHaveBeenCalled();
    });
  });

  describe("Caregiver Endpoints", () => {
    it("caregiver can list AI sessions for owned patient", async () => {
      p.patient.findUnique.mockResolvedValue({ id: patientId, caregiverId });
      p.aiSession.findMany.mockResolvedValue([{ id: aiSessionId, _count: { messages: 0 } }]);

      const res = await request(app)
        .get(`/api/patients/${patientId}/ai-sessions`)
        .set("Authorization", `Bearer ${caregiverToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it("caregiver cannot list sessions for another caregiver's patient", async () => {
      p.patient.findUnique.mockResolvedValue({ id: patientId, caregiverId });

      const res = await request(app)
        .get(`/api/patients/${patientId}/ai-sessions`)
        .set("Authorization", `Bearer ${otherCaregiverToken}`);
      expect(res.status).toBe(404);
    });

    it("caregiver can get AI session detail for owned patient", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, patient: { caregiverId } });

      const res = await request(app)
        .get(`/api/ai-sessions/${aiSessionId}`)
        .set("Authorization", `Bearer ${caregiverToken}`);
      expect(res.status).toBe(200);
    });

    it("caregiver joined transition works", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, status: "active", patient: { caregiverId } });
      p.$transaction.mockResolvedValue({ status: "caregiver_joined" });

      const res = await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/caregiver-joined`)
        .set("Authorization", `Bearer ${caregiverToken}`);
      expect(res.status).toBe(200);
    });

    it("invalid transition returns 400", async () => {
      p.aiSession.findUnique.mockResolvedValue({ id: aiSessionId, status: "resolved", patient: { caregiverId } });

      const res = await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/caregiver-joined`)
        .set("Authorization", `Bearer ${caregiverToken}`);
      expect(res.status).toBe(400); // Because it's resolved, can't join
    });

    it("rejects a manual join for a stale (non-joinable) active session with 409", async () => {
      const old = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      p.aiSession.findUnique.mockResolvedValue({
        id: aiSessionId,
        status: "active",
        startedAt: old,
        updatedAt: old,
        endedAt: null,
        caregiverJoinedAt: null,
        emergencySuggestedAt: null,
        metadata: null,
        messages: [],
        patient: { caregiverId },
      });

      const res = await request(app)
        .post(`/api/ai-sessions/${aiSessionId}/caregiver-joined`)
        .set("Authorization", `Bearer ${caregiverToken}`);
      expect(res.status).toBe(409);
      expect(p.$transaction).not.toHaveBeenCalled();
    });

    it("list response includes backend-authoritative joinability fields", async () => {
      p.patient.findUnique.mockResolvedValue({ id: patientId, caregiverId });
      p.aiSession.findMany.mockResolvedValue([
        {
          id: aiSessionId,
          patientId,
          status: "resolved",
          startedAt: new Date(),
          endedAt: new Date(),
          summary: null,
          metadata: null,
          messages: [],
          _count: { messages: 0 },
        },
      ]);

      const res = await request(app)
        .get(`/api/patients/${patientId}/ai-sessions`)
        .set("Authorization", `Bearer ${caregiverToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          isJoinable: false,
          joinabilityReason: "terminal_status",
          displayStatus: "Resolved",
        })
      );
    });

    it("existing Help event flow still works", async () => {
      p.aiSession.create.mockClear();
      p.patient.findUnique.mockResolvedValue({ id: patientId, deviceId });
      p.helpContact.findFirst.mockResolvedValue({ id: "contact-id", whatsappNumber: "123456" });
      p.helpEvent.create.mockResolvedValue({ id: helpEventId });

      const res = await request(app).post("/api/mobile/help-events").send({
        deviceId,
        sourceDevice: "phone",
        status: "triggered",
      });
      expect(res.status).toBe(201);
      expect(p.aiSession.create).not.toHaveBeenCalled();
    });
  });
});
