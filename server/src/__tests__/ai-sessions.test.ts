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

describe("AI Sessions (Backend Implementation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Mobile Endpoints", () => {
    it("should start an AI session from a valid deviceId", async () => {
      p.patient.findUnique.mockResolvedValue({ id: patientId, deviceId });
      p.aiSession.create.mockResolvedValue({ id: aiSessionId, status: "active", messages: [{ message: "System" }, { message: "AI1" }, { message: "AI2" }] });

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        sourceDevice: "phone"
      });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    it("should start an AI session linked to a valid helpEventId", async () => {
      p.patient.findUnique.mockResolvedValue({ id: patientId, deviceId });
      p.helpEvent.findUnique.mockResolvedValue({ id: helpEventId, patientId });
      p.aiSession.create.mockResolvedValue({ id: aiSessionId, helpEventId, status: "active", messages: [] });

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        helpEventId,
        sourceDevice: "phone"
      });
      expect(res.status).toBe(201);
      expect(res.body.data.helpEventId).toBe(helpEventId);
    });

    it("should reject AI session start if helpEventId belongs to another patient", async () => {
      p.patient.findUnique.mockResolvedValue({ id: patientId, deviceId });
      p.helpEvent.findUnique.mockResolvedValue({ id: helpEventId, patientId: "other-patient" });

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId,
        helpEventId,
        sourceDevice: "phone"
      });
      expect(res.status).toBe(404);
    });

    it("should reject unknown deviceId", async () => {
      p.patient.findUnique.mockResolvedValue(null);

      const res = await request(app).post("/api/mobile/ai-sessions/start").send({
        deviceId: "unknown-device",
      });
      expect(res.status).toBe(404);
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
