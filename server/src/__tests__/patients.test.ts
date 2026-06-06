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
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma.patient as any;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_ID = "patient-uuid-001";

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const tokenA = makeToken(CAREGIVER_A_ID);

const samplePatient = {
  id: PATIENT_ID,
  caregiverId: CAREGIVER_A_ID,
  name: "Mary Johnson",
  phoneNumber: "+18185550123",
  deviceId: "android-demo-001",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const updatedPatient = { ...samplePatient, name: "Mary J." };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Auth guard ────────────────────────────────────────────────────────────────

describe("Auth guard on patient routes", () => {
  it("GET /api/patients returns 401 without a token", async () => {
    const res = await request(app).get("/api/patients");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("POST /api/patients returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/patients")
      .send({ name: "Mary Johnson" });
    expect(res.status).toBe(401);
  });
});

// ─── Create ────────────────────────────────────────────────────────────────────

describe("POST /api/patients", () => {
  it("creates a patient and returns 201", async () => {
    p.create.mockResolvedValue(samplePatient);

    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Mary Johnson", phoneNumber: "+18185550123", deviceId: "android-demo-001" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Mary Johnson");
    expect(res.body.data.caregiverId).toBe(CAREGIVER_A_ID);
    expect(p.create).toHaveBeenCalledWith({
      data: {
        name: "Mary Johnson",
        phoneNumber: "+18185550123",
        deviceId: "android-demo-001",
        caregiverId: CAREGIVER_A_ID,
      },
    });
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ phoneNumber: "+18185550123" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name is an empty string", async () => {
    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

// ─── List ──────────────────────────────────────────────────────────────────────

describe("GET /api/patients", () => {
  it("returns only the authenticated caregiver's patients", async () => {
    p.findMany.mockResolvedValue([samplePatient]);
    p.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].caregiverId).toBe(CAREGIVER_A_ID);
    expect(res.body.pagination.total).toBe(1);
    // caregiverId scoping enforced in the where clause
    expect(p.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ caregiverId: CAREGIVER_A_ID }),
      })
    );
  });

  it("returns an empty list when caregiver has no patients", async () => {
    p.findMany.mockResolvedValue([]);
    p.count.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});

// ─── Get one ───────────────────────────────────────────────────────────────────

describe("GET /api/patients/:id", () => {
  it("returns the patient when it belongs to the caregiver", async () => {
    p.findFirst.mockResolvedValue(samplePatient);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PATIENT_ID);
    expect(p.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_ID, caregiverId: CAREGIVER_A_ID },
    });
  });

  it("returns 404 for a nonexistent patient", async () => {
    p.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/does-not-exist`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 404 when patient belongs to a different caregiver (no info leak)", async () => {
    // Caregiver B's patient — query with caregiver A's id returns null
    p.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_B_ID)}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    // Ownership enforced via caregiverId in the where clause
    expect(p.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_ID, caregiverId: CAREGIVER_B_ID },
    });
  });
});

// ─── Update ────────────────────────────────────────────────────────────────────

describe("PUT /api/patients/:id", () => {
  it("updates the patient and returns 200", async () => {
    p.findFirst.mockResolvedValue(samplePatient);
    p.update.mockResolvedValue(updatedPatient);

    const res = await request(app)
      .put(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Mary J." });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Mary J.");
    expect(p.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(p.update).toHaveBeenCalledWith({
      where: { id: PATIENT_ID },
      data: { name: "Mary J." },
    });
  });

  it("returns 404 when updating another caregiver's patient", async () => {
    p.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_B_ID)}`)
      .send({ name: "Hacked" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(p.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid update payload", async () => {
    const res = await request(app)
      .put(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

// ─── Delete ────────────────────────────────────────────────────────────────────

describe("DELETE /api/patients/:id", () => {
  it("deletes the patient and returns 200", async () => {
    p.findFirst.mockResolvedValue(samplePatient);
    p.delete.mockResolvedValue(samplePatient);

    const res = await request(app)
      .delete(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(p.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(p.delete).toHaveBeenCalledWith({ where: { id: PATIENT_ID } });
  });

  it("returns 404 when deleting another caregiver's patient", async () => {
    p.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/patients/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${makeToken(CAREGIVER_B_ID)}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(p.delete).not.toHaveBeenCalled();
  });
});
