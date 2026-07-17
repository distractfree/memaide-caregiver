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
      count: vi.fn(),
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
    },
    beacon: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    beaconEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import app from "../app";
import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pat = prisma.patient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const beacon = (prisma as any).beacon;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const beaconEvent = (prisma as any).beaconEvent;

const TEST_JWT_SECRET = "test-jwt-secret-vitest-min16chars";
const CAREGIVER_A_ID = "caregiver-a-uuid";
const CAREGIVER_B_ID = "caregiver-b-uuid";
const PATIENT_A_ID = "patient-a-uuid-001";
const PATIENT_B_ID = "patient-b-uuid-002";
const BEACON_ID = "beacon-uuid-001";
const BEACON_B_ID = "beacon-uuid-002";
const EVENT_ID = "beacon-event-uuid-001";
const DEVICE_ID = "android-demo-001";
const DEVICE_B_ID = "android-demo-002";
const BEACON_UUID = "fda50693-a4e2-4fb1-afcf-c6eb07647825";
const BEACON_B_UUID = "74278bda-b644-4520-8f0c-720eaf059935";

function makeToken(caregiverId: string) {
  return jwt.sign({ sub: caregiverId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

const tokenA = makeToken(CAREGIVER_A_ID);
const tokenB = makeToken(CAREGIVER_B_ID);

const mobileRequest = {
  get: (path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${tokenA}`),
  post: (path: string) =>
    request(app).post(path).set("Authorization", `Bearer ${tokenA}`),
};
const NOW = new Date("2026-05-22T16:00:00.000Z");

const samplePatientA = {
  id: PATIENT_A_ID,
  caregiverId: CAREGIVER_A_ID,
  name: "Mary Johnson",
  phoneNumber: "+18185550123",
  deviceId: DEVICE_ID,
  createdAt: NOW,
  updatedAt: NOW,
};

const samplePatientForDevice = {
  id: PATIENT_A_ID,
  name: "Mary Johnson",
  deviceId: DEVICE_ID,
};

const sampleBeacon = {
  id: BEACON_ID,
  patientId: PATIENT_A_ID,
  roomName: "Kitchen",
  beaconUuid: BEACON_UUID,
  major: 100,
  minor: 1,
  thresholdDistanceM: 3,
  dwellSeconds: 5,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const inactiveBeacon = {
  ...sampleBeacon,
  id: "beacon-uuid-003",
  roomName: "Garage",
  active: false,
};

const beaconForOtherPatient = {
  ...sampleBeacon,
  id: BEACON_B_ID,
  patientId: PATIENT_B_ID,
  beaconUuid: BEACON_B_UUID,
};

const updatedBeacon = {
  ...sampleBeacon,
  roomName: "Dining Room",
  thresholdDistanceM: 2.5,
};

const sampleBeaconEvent = {
  id: EVENT_ID,
  patientId: PATIENT_A_ID,
  beaconId: BEACON_ID,
  roomName: "Kitchen",
  detectedAt: NOW,
  exitedAt: null,
  dwellSeconds: 8,
  estimatedDistanceM: 2.4,
  sourceDevice: "phone",
  createdAt: NOW,
  updatedAt: NOW,
};

const eventWithBeacon = {
  ...sampleBeaconEvent,
  beacon: {
    id: BEACON_ID,
    beaconUuid: BEACON_UUID,
    roomName: "Kitchen",
    thresholdDistanceM: 3,
    dwellSeconds: 5,
  },
};

const reportEvents = [
  {
    ...sampleBeaconEvent,
    id: "beacon-event-report-001",
    roomName: "Kitchen",
    detectedAt: new Date("2026-05-22T16:30:00.000Z"),
    dwellSeconds: 8,
    estimatedDistanceM: 2.4,
    sourceDevice: "phone",
    beacon: {
      id: BEACON_ID,
      beaconUuid: BEACON_UUID,
      roomName: "Kitchen",
      thresholdDistanceM: 3,
      dwellSeconds: 5,
    },
  },
  {
    ...sampleBeaconEvent,
    id: "beacon-event-report-002",
    beaconId: "beacon-living-room-001",
    roomName: "Living Room",
    detectedAt: new Date("2026-05-22T16:10:00.000Z"),
    dwellSeconds: 120,
    estimatedDistanceM: 3,
    sourceDevice: "phone",
    beacon: {
      id: "beacon-living-room-001",
      beaconUuid: "d9f13f4a-a2f9-4d89-9a97-5e7b9d6ec40f",
      roomName: "Living Room",
      thresholdDistanceM: 3,
      dwellSeconds: 5,
    },
  },
  {
    ...sampleBeaconEvent,
    id: "beacon-event-report-003",
    roomName: "Kitchen",
    detectedAt: new Date("2026-05-22T15:00:00.000Z"),
    dwellSeconds: 22,
    estimatedDistanceM: null,
    sourceDevice: "system",
    beacon: {
      id: BEACON_ID,
      beaconUuid: BEACON_UUID,
      roomName: "Kitchen",
      thresholdDistanceM: 3,
      dwellSeconds: 5,
    },
  },
  {
    ...sampleBeaconEvent,
    id: "beacon-event-report-004",
    roomName: "Kitchen",
    detectedAt: new Date("2026-05-22T14:00:00.000Z"),
    dwellSeconds: 10,
    estimatedDistanceM: 1.8,
    sourceDevice: "phone",
    beacon: {
      id: BEACON_ID,
      beaconUuid: BEACON_UUID,
      roomName: "Kitchen",
      thresholdDistanceM: 3,
      dwellSeconds: 5,
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Protected beacon configuration routes", () => {
  it("GET /api/patients/:patientId/beacons returns 401 without a token", async () => {
    const res = await request(app).get(`/api/patients/${PATIENT_A_ID}/beacons`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("creates a beacon for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beacon.create.mockResolvedValue(sampleBeacon);

    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/beacons`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        roomName: " Kitchen ",
        beaconUuid: BEACON_UUID,
        major: 100,
        minor: 1,
        thresholdDistanceM: 3,
        dwellSeconds: 5,
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.roomName).toBe("Kitchen");
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(beacon.create).toHaveBeenCalledWith({
      data: {
        roomName: "Kitchen",
        beaconUuid: BEACON_UUID,
        major: 100,
        minor: 1,
        thresholdDistanceM: 3,
        dwellSeconds: 5,
        active: true,
        patientId: PATIENT_A_ID,
      },
    });
  });

  it("lists beacons for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beacon.findMany.mockResolvedValue([sampleBeacon]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/beacons?active=true`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(beacon.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_A_ID, active: true },
      orderBy: [{ roomName: "asc" }, { createdAt: "asc" }],
    });
  });

  it("updates own beacon", async () => {
    beacon.findFirst.mockResolvedValue(sampleBeacon);
    beacon.update.mockResolvedValue(updatedBeacon);

    const res = await request(app)
      .put(`/api/beacons/${BEACON_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ roomName: "Dining Room", thresholdDistanceM: 2.5 });

    expect(res.status).toBe(200);
    expect(res.body.data.roomName).toBe("Dining Room");
    expect(beacon.findFirst).toHaveBeenCalledWith({
      where: { id: BEACON_ID, patient: { caregiverId: CAREGIVER_A_ID } },
    });
    expect(beacon.update).toHaveBeenCalledWith({
      where: { id: BEACON_ID },
      data: { roomName: "Dining Room", thresholdDistanceM: 2.5 },
    });
  });

  it("deletes own beacon", async () => {
    beacon.findFirst.mockResolvedValue(sampleBeacon);
    beacon.delete.mockResolvedValue(sampleBeacon);

    const res = await request(app)
      .delete(`/api/beacons/${BEACON_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(beacon.delete).toHaveBeenCalledWith({ where: { id: BEACON_ID } });
  });

  it("returns 404 when caregiver A lists caregiver B's patient beacons", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beacon.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when caregiver A creates a beacon for caregiver B's patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/patients/${PATIENT_B_ID}/beacons`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ roomName: "Kitchen", beaconUuid: BEACON_UUID });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beacon.create).not.toHaveBeenCalled();
  });

  it("returns 404 when caregiver A updates caregiver B's beacon", async () => {
    beacon.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/beacons/${BEACON_B_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ roomName: "Kitchen" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beacon.update).not.toHaveBeenCalled();
  });

  it("returns 404 when caregiver A deletes caregiver B's beacon", async () => {
    beacon.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/beacons/${BEACON_B_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beacon.delete).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid beacon create payload", async () => {
    const res = await request(app)
      .post(`/api/patients/${PATIENT_A_ID}/beacons`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ roomName: "", beaconUuid: "not-a-uuid", major: -1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(beacon.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid beacon update payload", async () => {
    const res = await request(app)
      .put(`/api/beacons/${BEACON_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(beacon.findFirst).not.toHaveBeenCalled();
    expect(beacon.update).not.toHaveBeenCalled();
  });
});

describe("Mobile beacon sync and ingestion", () => {
  beforeEach(() => {
    pat.findFirst.mockResolvedValue(samplePatientA);
  });

  it("GET /api/mobile/beacons returns only active beacons for a valid deviceId", async () => {
    pat.findFirst.mockResolvedValue(samplePatientForDevice);
    beacon.findMany.mockResolvedValue([sampleBeacon]);

    const res = await mobileRequest.get(`/api/mobile/beacons?deviceId=${DEVICE_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patient.id).toBe(PATIENT_A_ID);
    expect(res.body.data.patient.deviceId).toBe(DEVICE_ID);
    expect(res.body.data.beacons).toHaveLength(1);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { caregiverId: CAREGIVER_A_ID, deviceId: DEVICE_ID },
      select: { id: true, name: true, deviceId: true },
    });
    expect(beacon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: PATIENT_A_ID, active: true },
        select: expect.objectContaining({ beaconUuid: true }),
      })
    );
  });

  it("GET /api/mobile/beacons returns 400 without deviceId", async () => {
    const res = await mobileRequest.get("/api/mobile/beacons");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
  });

  it("GET /api/mobile/beacons returns 404 for unknown deviceId", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await mobileRequest.get("/api/mobile/beacons?deviceId=unknown-device"
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beacon.findMany).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/beacon-events creates an event for valid deviceId and beaconId", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    beacon.findFirst.mockResolvedValue({
      id: BEACON_ID,
      roomName: "Kitchen",
    });
    beaconEvent.create.mockResolvedValue(sampleBeaconEvent);

    const res = await mobileRequest.post("/api/mobile/beacon-events")
      .send({
        deviceId: DEVICE_ID,
        beaconId: BEACON_ID,
        roomName: "Kitchen",
        detectedAt: "2026-05-22T16:00:00.000Z",
        dwellSeconds: 8,
        estimatedDistanceM: 2.4,
        sourceDevice: "phone",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.roomName).toBe("Kitchen");
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { caregiverId: CAREGIVER_A_ID, deviceId: DEVICE_ID },
      select: { id: true, name: true, deviceId: true },
    });
    expect(beacon.findFirst).toHaveBeenCalledWith({
      where: { id: BEACON_ID, patientId: PATIENT_A_ID },
      select: { id: true, roomName: true },
    });
    expect(beaconEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patientId: PATIENT_A_ID,
          beaconId: BEACON_ID,
          roomName: "Kitchen",
          estimatedDistanceM: 2.4,
          sourceDevice: "phone",
        }),
      })
    );
  });

  it("POST /api/mobile/beacon-events uses the beacon roomName when roomName is missing", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    beacon.findFirst.mockResolvedValue({
      id: BEACON_ID,
      roomName: "Kitchen",
    });
    beaconEvent.create.mockResolvedValue(sampleBeaconEvent);

    const res = await mobileRequest.post("/api/mobile/beacon-events")
      .send({
        deviceId: DEVICE_ID,
        beaconId: BEACON_ID,
        detectedAt: "2026-05-22T16:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(beaconEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomName: "Kitchen",
          sourceDevice: "phone",
        }),
      })
    );
  });

  it("POST /api/mobile/beacon-events returns 404 when beaconId does not belong to the device patient", async () => {
    pat.findFirst.mockResolvedValue({ id: PATIENT_A_ID });
    beacon.findFirst.mockResolvedValue(null);

    const res = await mobileRequest.post("/api/mobile/beacon-events")
      .send({
        deviceId: DEVICE_ID,
        beaconId: BEACON_B_ID,
        detectedAt: "2026-05-22T16:00:00.000Z",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beaconEvent.create).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/beacon-events returns 400 when deviceId is missing", async () => {
    const res = await mobileRequest.post("/api/mobile/beacon-events")
      .send({
        beaconId: BEACON_ID,
        detectedAt: "2026-05-22T16:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(beaconEvent.create).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/beacon-events returns 400 for invalid estimatedDistanceM", async () => {
    const res = await mobileRequest.post("/api/mobile/beacon-events")
      .send({
        deviceId: DEVICE_ID,
        beaconId: BEACON_ID,
        detectedAt: "2026-05-22T16:00:00.000Z",
        estimatedDistanceM: -1,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(beaconEvent.create).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/beacon-events returns 404 for unknown deviceId", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await mobileRequest.post("/api/mobile/beacon-events")
      .send({
        deviceId: "unknown-device",
        beaconId: BEACON_ID,
        detectedAt: "2026-05-22T16:00:00.000Z",
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beacon.findFirst).not.toHaveBeenCalled();
    expect(beaconEvent.create).not.toHaveBeenCalled();
  });
});

describe("Protected beacon event log routes", () => {
  it("GET /api/patients/:patientId/beacon-events returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/beacon-events`
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("lists beacon events for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue([eventWithBeacon]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/beacon-events`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].beacon.beaconUuid).toBe(BEACON_UUID);
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
    expect(beaconEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: PATIENT_A_ID },
        include: expect.objectContaining({
          beacon: expect.objectContaining({
            select: expect.objectContaining({ beaconUuid: true }),
          }),
        }),
        orderBy: [{ detectedAt: "desc" }, { createdAt: "desc" }],
      })
    );
  });

  it("returns 404 when caregiver A lists caregiver B's beacon events", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/beacon-events`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });

  it("filters beacon events by beaconId, roomName, sourceDevice, and date range", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue([eventWithBeacon]);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/beacon-events?beaconId=${BEACON_ID}&roomName=Kitchen&sourceDevice=phone&from=2026-05-01T00:00:00.000Z&to=2026-05-31T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(beaconEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          beaconId: BEACON_ID,
          roomName: "Kitchen",
          sourceDevice: "phone",
          detectedAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("returns 400 for invalid sourceDevice filter", async () => {
    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/beacon-events?sourceDevice=watch`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });

  it("does not include inactive beacons in the mobile sync query", async () => {
    pat.findFirst.mockResolvedValue(samplePatientForDevice);
    beacon.findMany.mockResolvedValue([sampleBeacon]);

    await mobileRequest.get(`/api/mobile/beacons?deviceId=${DEVICE_ID}`);

    expect(beacon.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: false }),
      })
    );
    expect(inactiveBeacon.active).toBe(false);
    expect(beaconForOtherPatient.patientId).toBe(PATIENT_B_ID);
    expect(DEVICE_B_ID).toBe("android-demo-002");
  });
});

describe("GET /api/patients/:patientId/reports/beacons", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get(
      `/api/patients/${PATIENT_A_ID}/reports/beacons`
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_TOKEN");
  });

  it("returns a beacon report for caregiver's own patient", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.latestContext.accuracyNote).toBe(
      "Approximate BLE proximity context"
    );
    expect(res.body.data.notes.distanceAccuracy).toContain("approximate");
    expect(pat.findFirst).toHaveBeenCalledWith({
      where: { id: PATIENT_A_ID, caregiverId: CAREGIVER_A_ID },
    });
  });

  it("returns 404 when caregiver A requests caregiver B's patient report", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_B_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent patient", async () => {
    pat.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/patients/does-not-exist/reports/beacons")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns zero totals and empty arrays for empty event history", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({
      totalEvents: 0,
      uniqueRoomsVisited: 0,
      totalDwellSeconds: 0,
      averageDwellSeconds: 0,
      latestDetectedAt: null,
      latestKnownRoom: null,
      mostVisitedRoom: null,
      longestDwellRoom: null,
      approximateDistanceAverageM: null,
    });
    expect(res.body.data.latestContext).toBeNull();
    expect(res.body.data.rooms).toEqual([]);
    expect(res.body.data.events).toEqual([]);
    expect(res.body.data.countsBySourceDevice).toEqual({ phone: 0, system: 0 });
  });

  it("calculates totalEvents", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.totalEvents).toBe(4);
  });

  it("calculates uniqueRoomsVisited", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.uniqueRoomsVisited).toBe(2);
  });

  it("calculates totalDwellSeconds and averageDwellSeconds", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.totalDwellSeconds).toBe(160);
    expect(res.body.data.summary.averageDwellSeconds).toBe(40);
  });

  it("identifies latestKnownRoom and latestContext", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.latestKnownRoom).toBe("Kitchen");
    expect(res.body.data.summary.latestDetectedAt).toBe(
      "2026-05-22T16:30:00.000Z"
    );
    expect(res.body.data.latestContext.roomName).toBe("Kitchen");
    expect(res.body.data.latestContext.contextLabel).toBe("near Kitchen beacon");
  });

  it("identifies mostVisitedRoom", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.mostVisitedRoom).toBe("Kitchen");
  });

  it("identifies longestDwellRoom", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.longestDwellRoom).toBe("Living Room");
  });

  it("computes approximateDistanceAverageM from available estimates", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.summary.approximateDistanceAverageM).toBe(2.4);
  });

  it("groups room summaries correctly", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    const kitchen = res.body.data.rooms.find(
      (room: { roomName: string }) => room.roomName === "Kitchen"
    );
    const livingRoom = res.body.data.rooms.find(
      (room: { roomName: string }) => room.roomName === "Living Room"
    );

    expect(kitchen).toEqual({
      roomName: "Kitchen",
      eventCount: 3,
      totalDwellSeconds: 40,
      averageDwellSeconds: 13.33,
      lastDetectedAt: "2026-05-22T16:30:00.000Z",
    });
    expect(livingRoom).toEqual({
      roomName: "Living Room",
      eventCount: 1,
      totalDwellSeconds: 120,
      averageDwellSeconds: 120,
      lastDetectedAt: "2026-05-22T16:10:00.000Z",
    });
  });

  it("groups countsBySourceDevice correctly", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.countsBySourceDevice).toEqual({ phone: 3, system: 1 });
  });

  it("returns event rows with beacon UUID and approximate context labels", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.body.data.events[0]).toEqual(
      expect.objectContaining({
        id: "beacon-event-report-001",
        beaconId: BEACON_ID,
        beaconUuid: BEACON_UUID,
        roomName: "Kitchen",
        contextLabel: "near Kitchen beacon",
      })
    );
  });

  it("filters by roomName", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue([reportEvents[0]]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons?roomName=Kitchen`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(beaconEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          roomName: "Kitchen",
        }),
      })
    );
  });

  it("filters by beaconId", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue([reportEvents[0]]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons?beaconId=${BEACON_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(beaconEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          beaconId: BEACON_ID,
        }),
      })
    );
  });

  it("filters by sourceDevice", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue([reportEvents[2]]);

    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons?sourceDevice=system`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(beaconEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          sourceDevice: "system",
        }),
      })
    );
  });

  it("filters by from/to date range", async () => {
    pat.findFirst.mockResolvedValue(samplePatientA);
    beaconEvent.findMany.mockResolvedValue(reportEvents);

    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reports/beacons?from=2026-05-22T00:00:00.000Z&to=2026-05-22T23:59:59.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(beaconEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_A_ID,
          detectedAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("returns 400 for invalid from/to date", async () => {
    const res = await request(app)
      .get(`/api/patients/${PATIENT_A_ID}/reports/beacons?from=not-a-date`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when from is after to", async () => {
    const res = await request(app)
      .get(
        `/api/patients/${PATIENT_A_ID}/reports/beacons?from=2026-05-23T00:00:00.000Z&to=2026-05-22T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pat.findFirst).not.toHaveBeenCalled();
    expect(beaconEvent.findMany).not.toHaveBeenCalled();
  });
});
