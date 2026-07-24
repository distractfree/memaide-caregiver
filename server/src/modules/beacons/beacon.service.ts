import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { resolveMobilePatient } from "../patients/patient.service";
import type { MobileActor } from "../mobile/mobile-auth.service";
import type {
  MobileBeaconEventInput,
  MobileBeaconsInput,
} from "../mobile/mobile.schemas";
import type {
  BeaconReportQuery,
  CreateBeaconInput,
  ListBeaconEventsQuery,
  ListBeaconsQuery,
  UpdateBeaconInput,
} from "./beacon.schemas";

type BeaconEventQueryFilters = {
  beaconId?: string;
  roomName?: string;
  sourceDevice?: string;
  from?: Date;
  to?: Date;
};

async function assertPatientOwnership(caregiverId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return patient;
}

async function assertBeaconOwnership(caregiverId: string, beaconId: string) {
  const beacon = await prisma.beacon.findFirst({
    where: { id: beaconId, patient: { caregiverId } },
  });
  if (!beacon) {
    throw new AppError(404, "Beacon not found", "NOT_FOUND");
  }
  return beacon;
}

function buildBeaconEventWhere(
  patientId: string,
  query: BeaconEventQueryFilters
): Prisma.BeaconEventWhereInput {
  const where: Prisma.BeaconEventWhereInput = { patientId };

  if (query.beaconId) where.beaconId = query.beaconId;
  if (query.roomName) where.roomName = query.roomName;
  if (query.sourceDevice) where.sourceDevice = query.sourceDevice;
  if (query.from || query.to) {
    where.detectedAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  return where;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export async function listBeacons(
  caregiverId: string,
  patientId: string,
  query: ListBeaconsQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  return prisma.beacon.findMany({
    where: {
      patientId,
      ...(query.active !== undefined ? { active: query.active } : {}),
    },
    orderBy: [{ roomName: "asc" }, { createdAt: "asc" }],
  });
}

export async function createBeacon(
  caregiverId: string,
  patientId: string,
  input: CreateBeaconInput
) {
  await assertPatientOwnership(caregiverId, patientId);

  return prisma.beacon.create({
    data: { ...input, patientId },
  });
}

export async function updateBeacon(
  caregiverId: string,
  beaconId: string,
  input: UpdateBeaconInput
) {
  await assertBeaconOwnership(caregiverId, beaconId);

  return prisma.beacon.update({
    where: { id: beaconId },
    data: input,
  });
}

export async function deleteBeacon(caregiverId: string, beaconId: string) {
  await assertBeaconOwnership(caregiverId, beaconId);
  await prisma.beacon.delete({ where: { id: beaconId } });
}

export async function listBeaconEvents(
  caregiverId: string,
  patientId: string,
  query: ListBeaconEventsQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  const where = buildBeaconEventWhere(patientId, query);

  return prisma.beaconEvent.findMany({
    where,
    include: {
      beacon: {
        select: {
          id: true,
          beaconUuid: true,
          roomName: true,
          thresholdDistanceM: true,
          dwellSeconds: true,
        },
      },
    },
    orderBy: [{ detectedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getBeaconReport(
  caregiverId: string,
  patientId: string,
  query: BeaconReportQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  const events = await prisma.beaconEvent.findMany({
    where: buildBeaconEventWhere(patientId, query),
    include: {
      beacon: {
        select: {
          id: true,
          beaconUuid: true,
          roomName: true,
          thresholdDistanceM: true,
          dwellSeconds: true,
        },
      },
    },
    orderBy: [{ detectedAt: "desc" }, { createdAt: "desc" }],
  });

  const rooms = new Map<
    string,
    {
      roomName: string;
      eventCount: number;
      totalDwellSeconds: number;
      dwellValueCount: number;
      lastDetectedAt: Date | null;
    }
  >();
  const countsBySourceDevice = { phone: 0, system: 0 };
  const distanceValues: number[] = [];
  let totalDwellSeconds = 0;
  let dwellValueCount = 0;

  for (const event of events) {
    const current = rooms.get(event.roomName) ?? {
      roomName: event.roomName,
      eventCount: 0,
      totalDwellSeconds: 0,
      dwellValueCount: 0,
      lastDetectedAt: null,
    };

    current.eventCount += 1;
    if (!current.lastDetectedAt || event.detectedAt > current.lastDetectedAt) {
      current.lastDetectedAt = event.detectedAt;
    }
    if (event.dwellSeconds !== null) {
      current.totalDwellSeconds += event.dwellSeconds;
      current.dwellValueCount += 1;
      totalDwellSeconds += event.dwellSeconds;
      dwellValueCount += 1;
    }
    rooms.set(event.roomName, current);

    if (event.sourceDevice === "phone" || event.sourceDevice === "system") {
      countsBySourceDevice[event.sourceDevice] += 1;
    }
    if (event.estimatedDistanceM !== null) {
      distanceValues.push(event.estimatedDistanceM);
    }
  }

  const roomSummaries = Array.from(rooms.values()).map((room) => ({
    roomName: room.roomName,
    eventCount: room.eventCount,
    totalDwellSeconds: room.totalDwellSeconds,
    averageDwellSeconds:
      room.dwellValueCount > 0
        ? roundToTwo(room.totalDwellSeconds / room.dwellValueCount)
        : 0,
    lastDetectedAt: room.lastDetectedAt,
  }));

  const mostVisitedRoom =
    roomSummaries.reduce<(typeof roomSummaries)[number] | null>(
      (best, room) =>
        !best || room.eventCount > best.eventCount ? room : best,
      null
    )?.roomName ?? null;

  const longestDwellRoom =
    roomSummaries.reduce<(typeof roomSummaries)[number] | null>(
      (best, room) =>
        !best || room.totalDwellSeconds > best.totalDwellSeconds ? room : best,
      null
    )?.roomName ?? null;

  const latestEvent = events[0] ?? null;
  const eventRows = events.map((event) => ({
    id: event.id,
    beaconId: event.beaconId,
    beaconUuid: event.beacon.beaconUuid,
    roomName: event.roomName,
    detectedAt: event.detectedAt,
    exitedAt: event.exitedAt,
    dwellSeconds: event.dwellSeconds,
    estimatedDistanceM: event.estimatedDistanceM,
    sourceDevice: event.sourceDevice,
    contextLabel: `near ${event.roomName} beacon`,
    approximateContextLabel: `near ${event.roomName} beacon`,
  }));

  return {
    summary: {
      totalEvents: events.length,
      uniqueRoomsVisited: rooms.size,
      totalDwellSeconds,
      averageDwellSeconds:
        dwellValueCount > 0 ? roundToTwo(totalDwellSeconds / dwellValueCount) : 0,
      latestDetectedAt: latestEvent?.detectedAt ?? null,
      latestKnownRoom: latestEvent?.roomName ?? null,
      mostVisitedRoom,
      longestDwellRoom,
      approximateDistanceAverageM:
        distanceValues.length > 0
          ? roundToTwo(
              distanceValues.reduce((sum, value) => sum + value, 0) /
                distanceValues.length
            )
          : null,
    },
    latestContext: latestEvent
      ? {
          roomName: latestEvent.roomName,
          beaconId: latestEvent.beaconId,
          detectedAt: latestEvent.detectedAt,
          exitedAt: latestEvent.exitedAt,
          dwellSeconds: latestEvent.dwellSeconds,
          estimatedDistanceM: latestEvent.estimatedDistanceM,
          sourceDevice: latestEvent.sourceDevice,
          contextLabel: `near ${latestEvent.roomName} beacon`,
          accuracyNote: "Approximate BLE proximity context",
        }
      : null,
    rooms: roomSummaries,
    countsBySourceDevice,
    events: eventRows,
    notes: {
      distanceAccuracy:
        "BLE distance is approximate and should be used for caregiver context only.",
    },
  };
}

export async function getMobileBeacons(
  actor: MobileActor,
  query: MobileBeaconsInput
) {
  const patient = await resolveMobilePatient(actor, query.deviceId);

  const beacons = await prisma.beacon.findMany({
    where: { patientId: patient.id, active: true },
    select: {
      id: true,
      roomName: true,
      beaconUuid: true,
      major: true,
      minor: true,
      thresholdDistanceM: true,
      dwellSeconds: true,
      active: true,
    },
    orderBy: [{ roomName: "asc" }, { createdAt: "asc" }],
  });

  return { patient, beacons };
}

export async function createMobileBeaconEvent(
  actor: MobileActor,
  input: MobileBeaconEventInput
) {
  const patient = await resolveMobilePatient(actor, input.deviceId);

  const beacon = await prisma.beacon.findFirst({
    where: { id: input.beaconId, patientId: patient.id },
    select: { id: true, roomName: true },
  });
  if (!beacon) {
    throw new AppError(404, "Beacon not found for this patient", "NOT_FOUND");
  }

  return prisma.beaconEvent.create({
    data: {
      patientId: patient.id,
      beaconId: beacon.id,
      roomName: input.roomName ?? beacon.roomName,
      detectedAt: input.detectedAt,
      exitedAt: input.exitedAt ?? null,
      dwellSeconds: input.dwellSeconds ?? null,
      estimatedDistanceM: input.estimatedDistanceM ?? null,
      sourceDevice: input.sourceDevice,
    },
  });
}
