import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type {
  ListStreamSessionsQuery,
  StartStreamSessionInput,
  StopStreamSessionInput,
  UpdateStreamStatusInput,
} from "./stream.schemas";

async function assertPatientOwnership(caregiverId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return patient;
}

async function getPatientByDeviceId(deviceId: string) {
  const patient = await prisma.patient.findUnique({
    where: { deviceId },
    select: { id: true },
  });
  if (!patient) {
    throw new AppError(404, "No patient found for this device", "NOT_FOUND");
  }
  return patient;
}

async function assertHelpEventForPatient(helpEventId: string, patientId: string) {
  const helpEvent = await prisma.helpEvent.findFirst({
    where: { id: helpEventId, patientId },
    select: { id: true },
  });
  if (!helpEvent) {
    throw new AppError(404, "Help event not found for this patient", "NOT_FOUND");
  }
  return helpEvent;
}

async function assertStreamSessionForPatient(
  streamSessionId: string,
  patientId: string
) {
  const session = await prisma.streamSession.findFirst({
    where: { id: streamSessionId, patientId },
  });
  if (!session) {
    throw new AppError(404, "Stream session not found", "NOT_FOUND");
  }
  return session;
}

function buildStreamSessionWhere(
  patientId: string,
  query: ListStreamSessionsQuery
): Prisma.StreamSessionWhereInput {
  const where: Prisma.StreamSessionWhereInput = { patientId };

  if (query.status) where.status = query.status;
  if (query.source) where.source = query.source;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  return where;
}

function shouldDefaultStartedAt(status: string) {
  return status === "starting" || status === "active";
}

function shouldSetEndedAt(status: string) {
  return status === "ended" || status === "failed";
}

export async function startMobileStreamSession(input: StartStreamSessionInput) {
  const patient = await getPatientByDeviceId(input.deviceId);

  if (input.helpEventId) {
    await assertHelpEventForPatient(input.helpEventId, patient.id);
  }

  const startedAt =
    input.startedAt ??
    (shouldDefaultStartedAt(input.status) ? new Date() : null);

  return prisma.streamSession.create({
    data: {
      patientId: patient.id,
      helpEventId: input.helpEventId ?? null,
      startedAt,
      source: input.source,
      status: input.status,
      viewerUrl: input.viewerUrl ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function stopMobileStreamSession(input: StopStreamSessionInput) {
  const patient = await getPatientByDeviceId(input.deviceId);
  const session = await assertStreamSessionForPatient(
    input.streamSessionId,
    patient.id
  );

  return prisma.streamSession.update({
    where: { id: session.id },
    data: {
      status: input.status,
      endedAt: input.endedAt ?? new Date(),
    },
  });
}

export async function updateMobileStreamStatus(input: UpdateStreamStatusInput) {
  const patient = await getPatientByDeviceId(input.deviceId);
  const session = await assertStreamSessionForPatient(
    input.streamSessionId,
    patient.id
  );

  const data: Prisma.StreamSessionUpdateInput = {
    status: input.status,
    ...(input.viewerUrl !== undefined ? { viewerUrl: input.viewerUrl } : {}),
    ...(input.metadata !== undefined
      ? { metadata: input.metadata as Prisma.InputJsonValue }
      : {}),
  };

  if (shouldSetEndedAt(input.status) && !session.endedAt) {
    data.endedAt = new Date();
  }

  return prisma.streamSession.update({
    where: { id: session.id },
    data,
  });
}

export async function listStreamSessions(
  caregiverId: string,
  patientId: string,
  query: ListStreamSessionsQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  return prisma.streamSession.findMany({
    where: buildStreamSessionWhere(patientId, query),
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getStreamSessionById(
  caregiverId: string,
  streamSessionId: string
) {
  const session = await prisma.streamSession.findFirst({
    where: { id: streamSessionId, patient: { caregiverId } },
  });
  if (!session) {
    throw new AppError(404, "Stream session not found", "NOT_FOUND");
  }
  return session;
}

function toActiveSessionSummary(
  session: Awaited<ReturnType<typeof prisma.streamSession.findFirst>>
) {
  if (!session) return null;
  return {
    id: session.id,
    status: session.status,
    source: session.source,
    viewerUrl: session.viewerUrl,
    startedAt: session.startedAt,
  };
}

function toLatestSessionSummary(
  session: Awaited<ReturnType<typeof prisma.streamSession.findFirst>>
) {
  if (!session) return null;
  return {
    id: session.id,
    status: session.status,
    source: session.source,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  };
}

function caregiverMessageForStatus(
  status: string,
  hasViewerUrl: boolean
) {
  if (status === "active") {
    return hasViewerUrl
      ? "Patient perspective stream is active."
      : "Patient perspective stream is active, but no viewer URL is available yet.";
  }
  if (status === "starting") {
    return "Patient perspective stream is starting.";
  }
  if (status === "ended") {
    return "Patient perspective stream has ended.";
  }
  return "No patient perspective stream is available for this session.";
}

export async function getPatientStreamStatus(
  caregiverId: string,
  patientId: string
) {
  await assertPatientOwnership(caregiverId, patientId);

  const [activeSession, latestSession] = await Promise.all([
    prisma.streamSession.findFirst({
      where: { patientId, status: "active" },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.streamSession.findFirst({
      where: { patientId },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!latestSession) {
    return {
      hasActiveStream: false,
      displayStatus: "unavailable",
      viewerAvailable: false,
      caregiverMessage:
        "No patient perspective stream is available for this session.",
      activeSession: null,
      latestSession: null,
    };
  }

  const displayStatus = activeSession ? "active" : latestSession.status;
  const viewerAvailable = Boolean(activeSession?.viewerUrl);

  return {
    hasActiveStream: Boolean(activeSession),
    displayStatus,
    viewerAvailable,
    caregiverMessage: caregiverMessageForStatus(
      displayStatus,
      viewerAvailable
    ),
    activeSession: toActiveSessionSummary(activeSession),
    latestSession: toLatestSessionSummary(latestSession),
  };
}
