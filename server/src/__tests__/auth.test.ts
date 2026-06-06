import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// All vi.mock calls are hoisted before imports — keep them here at the top.

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
    caregiver: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

// Imports after mocks
import app from "../app";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

// Typed shorthand helpers for mock functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFindUnique = prisma.caregiver.findUnique as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreate = prisma.caregiver.create as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockBcryptHash = (bcrypt as any).hash;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockBcryptCompare = (bcrypt as any).compare;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";

const sampleCaregiver = {
  id: "uuid-caregiver-test-1",
  name: "Demo Caregiver",
  email: "caregiver@example.com",
  passwordHash: "$2b$12$hashedpasswordfortesting",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with token and caregiver on success", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockBcryptHash.mockResolvedValue("$2b$12$hashedpassword");
    mockCreate.mockResolvedValue(sampleCaregiver);

    const res = await request(app).post("/api/auth/register").send({
      name: "Demo Caregiver",
      email: "caregiver@example.com",
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.caregiver.email).toBe("caregiver@example.com");
    expect(res.body.data.caregiver.passwordHash).toBeUndefined();
  });

  it("returns 409 when email is already in use", async () => {
    mockFindUnique.mockResolvedValue(sampleCaregiver);

    const res = await request(app).post("/api/auth/register").send({
      name: "Demo Caregiver",
      email: "caregiver@example.com",
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("error");
    expect(res.body.code).toBe("EMAIL_CONFLICT");
  });

  it("returns 400 for invalid email", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Demo Caregiver",
      email: "not-an-email",
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when password is too short", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Demo Caregiver",
      email: "caregiver@example.com",
      password: "short",
      confirmPassword: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with token and caregiver on success", async () => {
    mockFindUnique.mockResolvedValue(sampleCaregiver);
    mockBcryptCompare.mockResolvedValue(true);

    const res = await request(app).post("/api/auth/login").send({
      email: "caregiver@example.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.caregiver.email).toBe("caregiver@example.com");
    expect(res.body.data.caregiver.passwordHash).toBeUndefined();
  });

  it("returns 401 when password is incorrect", async () => {
    mockFindUnique.mockResolvedValue(sampleCaregiver);
    mockBcryptCompare.mockResolvedValue(false);

    const res = await request(app).post("/api/auth/login").send({
      email: "caregiver@example.com",
      password: "wrongpassword",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 when email does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@example.com",
      password: "password123",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with caregiver when token is valid", async () => {
    mockFindUnique.mockResolvedValue(sampleCaregiver);

    const token = jwt.sign(
      { sub: sampleCaregiver.id },
      TEST_JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.caregiver.id).toBe(sampleCaregiver.id);
    expect(res.body.data.caregiver.passwordHash).toBeUndefined();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("returns 401 when token is invalid", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer this.is.not.a.valid.jwt");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("returns 401 when token is signed with wrong secret", async () => {
    const token = jwt.sign(
      { sub: sampleCaregiver.id },
      "wrong-secret-entirely",
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });
});
