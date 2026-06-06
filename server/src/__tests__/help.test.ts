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
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reminder: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reminderEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    helpContact: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    helpEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },

  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hc = (prisma as any).helpContact;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const he = (prisma as any).helpEvent;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const CONTACT_ID = "contact-uuid-001";
const EVENT_ID = "event-uuid-001";
const DEVICE_ID = "android-demo-001";
const WHATSAPP_NUMBER = "+18185550123";

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const tokenA = makeToken(CAREGIVER_A_ID);
const tokenB = makeToken(CAREGIVER_B_ID);

const NOW = new Date("2026-05-22T10:00:00.000Z");

const samplePatientA = {
  id: PATIENT_A_ID,
  caregiverId: CAREGIVER_A_ID,
  name: "Mary Johnson",
  deviceId: DEVICE_ID,
};

const samplePatientForDevice = {
  id: PATIENT_A_ID,
  name: "Mary Johnson",
  deviceId: DEVICE_ID,
};

const sampleContact = {
  id: CONTACT_ID,
  patientId: PATIENT_A_ID,
  whatsappNumber: WHATSAPP_NUMBER,
  label: "Primary caregiver",
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const mobileContactShape = {
  id: CONTACT_ID,
  whatsappNumber: WHATSAPP_NUMBER,
  label: "Primary caregiver",
  active: true,
};

const sampleHelpEvent = {
  id: EVENT_ID,
  patientId: PATIENT_A_ID,
  triggeredAt: NOW,
  sourceDevice: "phone",
  whatsappNumber: WHATSAPP_NUMBER,
  status: "triggered",
  createdAt: NOW,
  updatedAt: NOW,
};

const watchHelpEvent = {
  ...sampleHelpEvent,
  id: "event-uuid-002",
  sourceDevice: "watch",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /api/patients/:patientId/help-contact ────────────────────────────────

describe("GET /api/patients/:patientId/help-contact", () => {
  // Test 1: unauthenticated returns 401
  it("returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/help-contact`
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  // Test 3: authenticated caregiver gets own patient's contact
  it("returns active help contact for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    hc.findFirst.mockResolvedValue(sampleContact);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.whatsappNumber).toBe(WHATSAPP_NUMBER);
    expect(res.body.data.label).toBe("Primary caregiver");
    expect(res.body.data.active).toBe(true);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(hc.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_A_ID, active: true }),
      })
    );
  });

  it("returns null data when no help contact is configured", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    hc.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });

  // Test 5: caregiver A cannot read caregiver B's patient's contact
  it("returns 404 when accessing another caregiver's patient help contact", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(hc.findFirst).not.toHaveBeenCalled();
  });
});

// ─── POST /api/patients/:patientId/help-contact ───────────────────────────────

describe("POST /api/patients/:patientId/help-contact", () => {
  // Test 2: create new contact (no existing)
  it("creates a new help contact for own patient when none exists", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    hc.findFirst.mockResolvedValue(null);
    hc.create.mockResolvedValue(sampleContact);

    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ whatsappNumber: WHATSAPP_NUMBER, label: "Primary caregiver" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.whatsappNumber).toBe(WHATSAPP_NUMBER);
    expect(hc.create).toHaveBeenCalledOnce();
    expect(hc.update).not.toHaveBeenCalled();
  });

  it("updates existing help contact for own patient when one already exists", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    hc.findFirst.mockResolvedValue({ id: CONTACT_ID });
    hc.update.mockResolvedValue({ ...sampleContact, whatsappNumber: "+12125559999" });

    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ whatsappNumber: "+12125559999" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(hc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTACT_ID },
        data: expect.objectContaining({ whatsappNumber: "+12125559999" }),
      })
    );
    expect(hc.create).not.toHaveBeenCalled();
  });

  // Test 4: invalid whatsapp number returns 400
  it("returns 400 for an invalid WhatsApp number", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ whatsappNumber: "not-a-number" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(hc.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a number missing the + prefix", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ whatsappNumber: "18185550123" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when whatsappNumber is missing", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ label: "Some label" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  // Test 6: caregiver A cannot modify caregiver B's patient's contact
  it("returns 404 when creating help contact for another caregiver's patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/help-contact`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ whatsappNumber: WHATSAPP_NUMBER });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(hc.create).not.toHaveBeenCalled();
    expect(hc.update).not.toHaveBeenCalled();
  });
});

// ─── GET /api/mobile/help-contact ─────────────────────────────────────────────

describe("GET /api/mobile/help-contact", () => {
  // Test 7: returns active contact for valid deviceId
  it("returns active help contact for valid deviceId", async () => {
    pat.findUnique.mockResolvedValue(samplePatientForDevice);
    hc.findFirst.mockResolvedValue(mobileContactShape);

    const res = await request(app)
      .get(`/api/mobile/help-contact?deviceId=${DEVICE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patient.id).toBe(PATIENT_A_ID);
    expect(res.body.data.patient.deviceId).toBe(DEVICE_ID);
    expect(res.body.data.helpContact.whatsappNumber).toBe(WHATSAPP_NUMBER);
    expect(pat.findUnique).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID },
      select: { id: true, name: true, deviceId: true },
    });
  });

  // Test 8: missing deviceId returns 400
  it("returns 400 when deviceId query param is missing", async () => {
    const res = await request(app).get("/api/mobile/help-contact");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findUnique).not.toHaveBeenCalled();
  });

  // Test 9: unknown deviceId returns 404
  it("returns 404 when deviceId does not match any patient", async () => {
    pat.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/mobile/help-contact?deviceId=unknown-device-xyz");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 404 when patient has no active help contact configured", async () => {
    pat.findUnique.mockResolvedValue(samplePatientForDevice);
    hc.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/mobile/help-contact?deviceId=${DEVICE_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

// ─── POST /api/mobile/help-events ─────────────────────────────────────────────

describe("POST /api/mobile/help-events", () => {
  // Test 10: creates phone help event using configured contact
  it("creates a phone help event using the configured help contact", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    hc.findFirst.mockResolvedValue({ whatsappNumber: WHATSAPP_NUMBER });
    he.create.mockResolvedValue(sampleHelpEvent);

    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "phone",
        status: "triggered",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceDevice).toBe("phone");
    expect(res.body.data.status).toBe("triggered");
    expect(res.body.data.whatsappNumber).toBe(WHATSAPP_NUMBER);
    expect(hc.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_A_ID, active: true }),
      })
    );
    expect(he.create).toHaveBeenCalledOnce();
  });

  // Test 11: creates watch help event using configured contact
  it("creates a watch help event using the configured help contact", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    hc.findFirst.mockResolvedValue({ whatsappNumber: WHATSAPP_NUMBER });
    he.create.mockResolvedValue(watchHelpEvent);

    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "watch",
        status: "triggered",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.sourceDevice).toBe("watch");
    expect(he.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceDevice: "watch" }),
      })
    );
  });

  // Test 12: can use provided whatsappNumber (bypasses contact lookup)
  it("uses provided whatsappNumber without looking up the help contact", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    he.create.mockResolvedValue(sampleHelpEvent);

    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "phone",
        status: "whatsapp_opened",
        whatsappNumber: WHATSAPP_NUMBER,
      });

    expect(res.status).toBe(201);
    expect(hc.findFirst).not.toHaveBeenCalled();
    expect(he.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ whatsappNumber: WHATSAPP_NUMBER }),
      })
    );
  });

  // Test 13: invalid sourceDevice returns 400
  it("returns 400 for an invalid sourceDevice value", async () => {
    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "smartwatch",
        status: "triggered",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(he.create).not.toHaveBeenCalled();
  });

  // Test 14: invalid status returns 400
  it("returns 400 for an invalid status value", async () => {
    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "phone",
        status: "unknown-status",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(he.create).not.toHaveBeenCalled();
  });

  // Test 15: unknown deviceId returns 404
  it("returns 404 when deviceId does not match any patient", async () => {
    pat.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: "unknown-device-xyz",
        sourceDevice: "phone",
        status: "triggered",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(he.create).not.toHaveBeenCalled();
  });

  // Test 16: no contact and no whatsappNumber returns clean error
  it("returns 400 when no whatsappNumber provided and no active help contact exists", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    hc.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "watch",
        status: "triggered",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_HELP_CONTACT");
    expect(he.create).not.toHaveBeenCalled();
  });

  it("returns 400 when provided whatsappNumber is not valid E.164", async () => {
    const res = await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "phone",
        status: "triggered",
        whatsappNumber: "not-a-number",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(he.create).not.toHaveBeenCalled();
  });

  it("defaults triggeredAt to server time when not provided", async () => {
    pat.findUnique.mockResolvedValue({ id: PATIENT_A_ID });
    hc.findFirst.mockResolvedValue({ whatsappNumber: WHATSAPP_NUMBER });
    he.create.mockResolvedValue(sampleHelpEvent);

    await request(app)
      .post("/api/mobile/help-events")
      .send({
        deviceId: DEVICE_ID,
        sourceDevice: "phone",
        status: "triggered",
      });

    expect(he.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggeredAt: expect.any(Date),
        }),
      })
    );
  });
});

// ─── GET /api/patients/:patientId/help-events ─────────────────────────────────

describe("GET /api/patients/:patientId/help-events", () => {
  // Test 17: unauthenticated returns 401
  it("returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/help-events`
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  // Test 18: authenticated caregiver can list events for own patient
  it("returns help events for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    he.findMany.mockResolvedValue([sampleHelpEvent, watchHelpEvent]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-events`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].patientId).toBe(PATIENT_A_ID);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(he.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_A_ID }),
        orderBy: { triggeredAt: "desc" },
      })
    );
  });

  // Test 19: caregiver A cannot list events for caregiver B's patient
  it("returns 404 when accessing another caregiver's patient help events", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-events`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(he.findMany).not.toHaveBeenCalled();
  });

  // Test 20: filters work correctly

  it("filters help events by sourceDevice", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    he.findMany.mockResolvedValue([watchHelpEvent]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-events?sourceDevice=watch`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(he.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sourceDevice: "watch" }),
      })
    );
  });

  it("filters help events by status", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    he.findMany.mockResolvedValue([sampleHelpEvent]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-events?status=triggered`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(he.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "triggered" }),
      })
    );
  });

  it("filters help events by date range", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    he.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/help-events?from=2026-05-01T00:00:00.000Z&to=2026-05-31T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(he.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          triggeredAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("returns 400 for an invalid sourceDevice filter value", async () => {
    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-events?sourceDevice=tablet`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for an invalid status filter value", async () => {
    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/help-events?status=bad-status`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});
