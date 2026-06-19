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
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const DEMO_CAREGIVER_ID = "11111111-1111-4111-8111-111111111111";
const NEW_CAREGIVER_ID = "caregiver-arian-uuid";

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const demoPatientsFromDb = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    caregiverId: DEMO_CAREGIVER_ID,
    name: "Mary Johnson",
    phoneNumber: "+18185550123",
    deviceId: "android-demo-001",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    caregiverId: DEMO_CAREGIVER_ID,
    name: "Robert Lee",
    phoneNumber: "+18185550124",
    deviceId: "android-demo-002",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
];

const newCaregiverPatientsFromDb = [
  {
    id: "patient-arian-uuid",
    caregiverId: NEW_CAREGIVER_ID,
    name: "Arian Test Patient",
    phoneNumber: "+18185550125",
    deviceId: "arian-test-device-001",
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  pat.findMany.mockImplementation(({ where }: { where: { caregiverId: string } }) => {
    if (where.caregiverId === DEMO_CAREGIVER_ID) {
      return Promise.resolve(demoPatientsFromDb);
    }
    if (where.caregiverId === NEW_CAREGIVER_ID) {
      return Promise.resolve(newCaregiverPatientsFromDb);
    }
    return Promise.resolve([]);
  });
});

describe("GET /api/mobile/patients", () => {
  it("returns 401 without a Bearer token", async () => {
    const res = await request(app).get("/api/mobile/patients");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
    expect(pat.findMany).not.toHaveBeenCalled();
  });

  it("returns demo patients for the demo caregiver token", async () => {
    const res = await request(app)
      .get("/api/mobile/patients")
      .set("Authorization", `Bearer ${makeToken(DEMO_CAREGIVER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Mary Johnson",
        deviceId: "android-demo-001",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Robert Lee",
        deviceId: "android-demo-002",
      },
    ]);
    expect(pat.findMany).toHaveBeenCalledWith({
      where: { caregiverId: DEMO_CAREGIVER_ID },
      select: { id: true, name: true, deviceId: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns only the authenticated new caregiver's patient", async () => {
    const res = await request(app)
      .get("/api/mobile/patients")
      .set("Authorization", `Bearer ${makeToken(NEW_CAREGIVER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      {
        id: "patient-arian-uuid",
        name: "Arian Test Patient",
        deviceId: "arian-test-device-001",
      },
    ]);
    expect(res.body.data).not.toContainEqual(
      expect.objectContaining({ name: "Mary Johnson" })
    );
    expect(pat.findMany).toHaveBeenCalledWith({
      where: { caregiverId: NEW_CAREGIVER_ID },
      select: { id: true, name: true, deviceId: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns only id, name, and deviceId fields", async () => {
    const res = await request(app)
      .get("/api/mobile/patients")
      .set("Authorization", `Bearer ${makeToken(NEW_CAREGIVER_ID)}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      "deviceId",
      "id",
      "name",
    ]);
  });
});
