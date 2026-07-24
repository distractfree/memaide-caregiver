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
  },
}));

vi.mock("../lib/prisma", () => ({
  prisma: {
    patient: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const PATIENT_A = "patient-a-uuid";
const PATIENT_B = "patient-b-uuid";

// Controlled demo values only. No real patient phone number appears in tests.
const PHONE_A = "+18185550123";
const PHONE_B = "+18185550124";

beforeEach(() => {
  vi.clearAllMocks();
  p.patient.findMany.mockResolvedValue([]);
});

const login = (body: unknown) =>
  request(app).post("/api/mobile/patient-login").send(body as object);

describe("POST /api/mobile/patient-login", () => {
  it("is reachable without any Authorization header", async () => {
    p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }]);

    const res = await login({ phoneNumber: PHONE_A });

    expect(res.status).toBe(200);
  });

  it("issues a patient-scoped token for exactly one match", async () => {
    p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }]);

    const res = await login({ phoneNumber: PHONE_A });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.patient).toEqual({ id: PATIENT_A });

    const decoded = jwt.verify(res.body.token, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.sub).toBe(PATIENT_A);
    expect(decoded.typ).toBe("patient");
    expect(decoded.iat).toEqual(expect.any(Number));
    expect(decoded.exp).toEqual(expect.any(Number));
  });

  it("looks the number up exactly, bounded to two rows", async () => {
    p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }]);

    await login({ phoneNumber: PHONE_A });

    expect(p.patient.findMany).toHaveBeenCalledWith({
      where: { phoneNumber: PHONE_A },
      take: 2,
      select: { id: true },
    });
  });

  it("trims surrounding whitespace before lookup", async () => {
    p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }]);

    const res = await login({ phoneNumber: `  ${PHONE_A}  ` });

    expect(res.status).toBe(200);
    expect(p.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneNumber: PHONE_A } })
    );
  });

  it("never exposes a patient list, caregiver data, or extra patient fields", async () => {
    p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }]);

    const res = await login({ phoneNumber: PHONE_A });

    expect(Object.keys(res.body).sort()).toEqual([
      "patient",
      "success",
      "token",
    ]);
    expect(Object.keys(res.body.patient)).toEqual(["id"]);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("caregiver");
    expect(serialized).not.toContain("phoneNumber");
    expect(serialized).not.toContain("deviceId");
    expect(serialized).not.toContain("name");
    expect(serialized).not.toContain(PATIENT_B);
  });

  describe("request validation", () => {
    it.each([
      ["missing body", undefined],
      ["empty object", {}],
      ["null phone number", { phoneNumber: null }],
      ["empty string", { phoneNumber: "" }],
      ["national format", { phoneNumber: "8185551234" }],
      ["dashed format", { phoneNumber: "818-555-1234" }],
      ["parenthesised format", { phoneNumber: "(818) 555-1234" }],
      ["spaced E.164", { phoneNumber: "+1 818 555 1234" }],
      ["letters", { phoneNumber: "+1818555ABCD" }],
      ["leading zero country code", { phoneNumber: "+0818555123" }],
      ["too short", { phoneNumber: "+1234567" }],
      ["too long", { phoneNumber: "+1234567890123456" }],
    ])("rejects %s with 400 and never queries the database", async (_label, body) => {
      const res = await login(body ?? {});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(p.patient.findMany).not.toHaveBeenCalled();
    });
  });

  describe("generic failure behavior", () => {
    it("returns the generic failure when no patient matches", async () => {
      p.patient.findMany.mockResolvedValue([]);

      const res = await login({ phoneNumber: PHONE_B });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("PATIENT_LOGIN_NOT_AVAILABLE");
      expect(res.body.message).toBe(
        "Unable to sign in with the provided information."
      );
      expect(res.body.token).toBeUndefined();
    });

    it("returns the identical failure when the number is duplicated", async () => {
      p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }, { id: PATIENT_B }]);

      const duplicate = await login({ phoneNumber: PHONE_A });

      p.patient.findMany.mockResolvedValue([]);
      const unknown = await login({ phoneNumber: PHONE_B });

      // A caller must not be able to tell "duplicated" from "does not exist".
      expect(duplicate.status).toBe(unknown.status);
      expect(duplicate.body).toEqual(unknown.body);
      expect(duplicate.body.token).toBeUndefined();
      expect(JSON.stringify(duplicate.body)).not.toContain(PATIENT_A);
      expect(JSON.stringify(duplicate.body)).not.toContain(PATIENT_B);
    });

    it("never signs a token when the match is ambiguous", async () => {
      p.patient.findMany.mockResolvedValue([{ id: PATIENT_A }, { id: PATIENT_B }]);

      const res = await login({ phoneNumber: PHONE_A });

      expect(res.status).toBe(404);
      expect(res.body.token).toBeUndefined();
    });

    it("sanitizes an unexpected database failure into a 500 with no internals", async () => {
      p.patient.findMany.mockRejectedValue(
        new Error("connect ECONNREFUSED 10.0.0.5:5432 memaide_prod")
      );

      const res = await login({ phoneNumber: PHONE_A });

      expect(res.status).toBe(500);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain("ECONNREFUSED");
      expect(serialized).not.toContain("memaide_prod");
      expect(serialized).not.toContain("prisma");
      expect(res.body.stack).toBeUndefined();
    });
  });
});
