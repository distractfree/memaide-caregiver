import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { resolveMobilePatient } from "../patients/patient.service";
import type { MobileActor } from "../mobile/mobile-auth.service";
import type { MobileVitalEventInput } from "../mobile/mobile.schemas";
import type { ListVitalsQuery, VitalsReportQuery } from "./vital.schemas";

const VITAL_SOURCE_DEVICES = ["watch", "phone", "system"] as const;
const VITAL_MOTION_STATES = ["idle", "walking", "active", "unknown"] as const;

type VitalEventQueryFilters = {
  from?: Date;
  to?: Date;
  sourceDevice?: string;
  motionState?: string;
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

function buildVitalEventWhere(
  patientId: string,
  query: VitalEventQueryFilters
): Prisma.VitalEventWhereInput {
  const where: Prisma.VitalEventWhereInput = { patientId };

  if (query.sourceDevice) where.sourceDevice = query.sourceDevice;
  if (query.motionState) where.motionState = query.motionState;
  if (query.from || query.to) {
    where.timestamp = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  return where;
}

function createSourceCounts() {
  return { watch: 0, phone: 0, system: 0 };
}

function createMotionCounts() {
  return { idle: 0, walking: 0, active: 0, unknown: 0 };
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return roundToTwo(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function mostCommonMotionState(counts: Record<string, number>) {
  let bestState: string | null = null;
  let bestCount = 0;

  for (const state of VITAL_MOTION_STATES) {
    if (counts[state] > bestCount) {
      bestState = state;
      bestCount = counts[state];
    }
  }

  return bestState;
}

export async function createMobileVitalEvent(
  actor: MobileActor,
  input: MobileVitalEventInput
) {
  const patient = await resolveMobilePatient(actor, input.deviceId);

  return prisma.vitalEvent.create({
    data: {
      patientId: patient.id,
      timestamp: input.timestamp,
      heartRate: input.heartRate ?? null,
      motionState: input.motionState ?? null,
      stepCount: input.stepCount ?? null,
      sourceDevice: input.sourceDevice,
    },
  });
}

export async function listVitals(
  caregiverId: string,
  patientId: string,
  query: ListVitalsQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  const where = buildVitalEventWhere(patientId, query);

  const page = query.page ?? 1;
  const limit = query.limit ?? 50;

  return prisma.vitalEvent.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { timestamp: "desc" },
  });
}

export async function getVitalsReport(
  caregiverId: string,
  patientId: string,
  query: VitalsReportQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  const events = await prisma.vitalEvent.findMany({
    where: buildVitalEventWhere(patientId, query),
    orderBy: { timestamp: "desc" },
  });

  const chronologicalEvents = [...events].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const heartRateValues = events
    .map((event) => event.heartRate)
    .filter((value): value is number => value !== null);
  const stepEvents = chronologicalEvents.filter(
    (event) => event.stepCount !== null
  );
  const latestEvent = events[0] ?? null;
  const firstEvent = chronologicalEvents[0] ?? null;
  const latestHeartRateEvent = events.find((event) => event.heartRate !== null);
  const latestMotionEvent = events.find((event) => event.motionState !== null);
  const latestStepEvent = events.find((event) => event.stepCount !== null);
  const firstStepCount = stepEvents[0]?.stepCount ?? null;
  const latestStepCount = latestStepEvent?.stepCount ?? null;

  const countsBySourceDevice = createSourceCounts();
  const countsByMotionState = createMotionCounts();

  for (const event of events) {
    if (VITAL_SOURCE_DEVICES.includes(event.sourceDevice as typeof VITAL_SOURCE_DEVICES[number])) {
      countsBySourceDevice[
        event.sourceDevice as keyof ReturnType<typeof createSourceCounts>
      ] += 1;
    }
    if (
      event.motionState &&
      VITAL_MOTION_STATES.includes(event.motionState as typeof VITAL_MOTION_STATES[number])
    ) {
      countsByMotionState[
        event.motionState as keyof ReturnType<typeof createMotionCounts>
      ] += 1;
    }
  }

  const dailySummariesByDate = new Map<
    string,
    {
      date: string;
      sampleCount: number;
      heartRates: number[];
      latestStepCount: number | null;
      latestStepTimestamp: Date | null;
      countsByMotionState: ReturnType<typeof createMotionCounts>;
    }
  >();

  for (const event of chronologicalEvents) {
    const date = event.timestamp.toISOString().slice(0, 10);
    const current =
      dailySummariesByDate.get(date) ?? {
        date,
        sampleCount: 0,
        heartRates: [],
        latestStepCount: null,
        latestStepTimestamp: null,
        countsByMotionState: createMotionCounts(),
      };

    current.sampleCount += 1;
    if (event.heartRate !== null) current.heartRates.push(event.heartRate);
    if (
      event.stepCount !== null &&
      (!current.latestStepTimestamp || event.timestamp >= current.latestStepTimestamp)
    ) {
      current.latestStepCount = event.stepCount;
      current.latestStepTimestamp = event.timestamp;
    }
    if (
      event.motionState &&
      VITAL_MOTION_STATES.includes(event.motionState as typeof VITAL_MOTION_STATES[number])
    ) {
      current.countsByMotionState[
        event.motionState as keyof ReturnType<typeof createMotionCounts>
      ] += 1;
    }
    dailySummariesByDate.set(date, current);
  }

  const heartRateTrend = chronologicalEvents
    .filter((event) => event.heartRate !== null)
    .map((event) => ({
      timestamp: event.timestamp,
      heartRate: event.heartRate,
      sourceDevice: event.sourceDevice,
    }));

  const stepTrend = stepEvents.map((event) => ({
    timestamp: event.timestamp,
    stepCount: event.stepCount,
    sourceDevice: event.sourceDevice,
  }));

  const motionTimeline = chronologicalEvents
    .filter((event) => event.motionState !== null)
    .map((event) => ({
      timestamp: event.timestamp,
      motionState: event.motionState,
      sourceDevice: event.sourceDevice,
    }));

  const dailySummaries = Array.from(dailySummariesByDate.values()).map((day) => ({
    date: day.date,
    sampleCount: day.sampleCount,
    averageHeartRate: average(day.heartRates),
    minHeartRate: day.heartRates.length > 0 ? Math.min(...day.heartRates) : null,
    maxHeartRate: day.heartRates.length > 0 ? Math.max(...day.heartRates) : null,
    latestStepCount: day.latestStepCount,
    mostCommonMotionState: mostCommonMotionState(day.countsByMotionState),
    countsByMotionState: day.countsByMotionState,
  }));

  return {
    summary: {
      totalSamples: events.length,
      samplesWithHeartRate: heartRateValues.length,
      samplesWithMotionState: events.filter((event) => event.motionState !== null)
        .length,
      samplesWithStepCount: events.filter((event) => event.stepCount !== null)
        .length,
      firstSampleAt: firstEvent?.timestamp ?? null,
      latestSampleAt: latestEvent?.timestamp ?? null,
      latestHeartRate: latestHeartRateEvent?.heartRate ?? null,
      latestMotionState: latestMotionEvent?.motionState ?? null,
      latestStepCount,
      totalStepsLatestValue: latestStepCount,
      averageHeartRate: average(heartRateValues),
      minHeartRate: heartRateValues.length > 0 ? Math.min(...heartRateValues) : null,
      maxHeartRate: heartRateValues.length > 0 ? Math.max(...heartRateValues) : null,
      stepCountDelta:
        firstStepCount !== null &&
        latestStepCount !== null &&
        latestStepCount >= firstStepCount
          ? latestStepCount - firstStepCount
          : null,
      mostCommonMotionState: mostCommonMotionState(countsByMotionState),
      countsBySourceDevice,
      countsByMotionState,
    },
    heartRateTrend,
    stepTrend,
    motionTimeline,
    dailySummaries,
    events,
    notes: {
      positioning:
        "Wellness data is best-effort and intended for care coordination, not diagnosis.",
      availability:
        "Wearable samples may vary by device, permissions, and collection availability.",
    },
  };
}
