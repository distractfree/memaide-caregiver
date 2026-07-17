import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { findPatientForCaregiverDevice } from "../patients/patient.service";
import { isTerminalStatus } from "../ai-sessions/ai-session.lifecycle";
import type { LatestAiFrame } from "../ai-sessions/latest-ai-frame.store";
import {
  deleteLatestFrame,
  getLatestFrame,
} from "../ai-sessions/latest-ai-frame.store";
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

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function isTerminalStreamStatus(status: string) {
  return status === "ended" || status === "failed" || status === "unavailable";
}

function isCurrentStreamStatus(status: string) {
  return status === "starting" || status === "active";
}

type StreamSessionClient = Pick<Prisma.TransactionClient, "streamSession">;

function streamSessionsFor(client?: StreamSessionClient) {
  return (client ?? prisma).streamSession;
}

function aiSessionStreamWhere(aiSessionId: string): Prisma.StreamSessionWhereInput {
  return {
    metadata: { path: ["aiSessionId"], equals: aiSessionId },
  };
}

function aiSessionIdFromMetadata(metadata: unknown): string | null {
  const aiSessionId = asJsonRecord(metadata).aiSessionId;
  return typeof aiSessionId === "string" ? aiSessionId : null;
}

function unavailableFrameResponse(
  streamSessionId: string,
  aiSessionId: string | null,
  frameStatus: "waiting" | "ended" | "failed" | "unavailable"
) {
  return {
    available: false as const,
    streamSessionId,
    aiSessionId,
    frameStatus,
  };
}

function toFrameMetadata(frame: LatestAiFrame): JsonRecord {
  return {
    aiSessionId: frame.aiSessionId,
    lastFrameSeq: frame.seq,
    lastFrameCapturedAt: frame.capturedAt,
    lastFrameReceivedAt: frame.receivedAt,
    frameAvailable: true,
    visionDescription: frame.vision.description,
    visionLabel: frame.vision.label,
    visionFlags: [...frame.vision.flags],
    advisoryFlags: [...frame.vision.advisoryFlags],
  };
}

function safeFrameStartedAt(capturedAt: string, receivedAt: string): Date {
  const captured = new Date(capturedAt);
  const received = new Date(receivedAt);
  const now = received.getTime();
  const isReasonable =
    Number.isFinite(captured.getTime()) &&
    captured.getTime() >= now - 24 * 60 * 60 * 1000 &&
    captured.getTime() <= now + 5 * 60 * 1000;
  return isReasonable ? captured : received;
}

/** Reusable AI-session to StreamSession association lookups for lifecycle work. */
export async function findStreamSessionByAiSessionId(
  patientId: string,
  aiSessionId: string,
  client?: StreamSessionClient
) {
  return streamSessionsFor(client).findFirst({
    where: {
      patientId,
      ...aiSessionStreamWhere(aiSessionId),
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function findStreamSessionsForAiSession(
  aiSessionId: string,
  client?: StreamSessionClient
) {
  return streamSessionsFor(client).findMany({
    where: aiSessionStreamWhere(aiSessionId),
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function findCurrentStreamForAiSession(
  aiSessionId: string,
  client?: StreamSessionClient
) {
  return streamSessionsFor(client).findFirst({
    where: {
      ...aiSessionStreamWhere(aiSessionId),
      status: { in: ["starting", "active"] },
      endedAt: null,
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function endStreamsForAiSession(
  aiSessionId: string,
  options: {
    endReason: string;
    endedBy: string;
    endedAt?: Date;
    supersededByAiSessionId?: string;
    client?: StreamSessionClient;
  }
) {
  const streamSessions = streamSessionsFor(options.client);
  const currentStreams = (await findStreamSessionsForAiSession(
    aiSessionId,
    options.client
  )).filter((stream) => isCurrentStreamStatus(stream.status) && !stream.endedAt);

  if (currentStreams.length === 0) return [];

  const endedAt = options.endedAt ?? new Date();
  return Promise.all(
    currentStreams.map((stream) =>
      streamSessions.update({
        where: { id: stream.id },
        data: {
          status: "ended",
          endedAt,
          metadata: {
            ...asJsonRecord(stream.metadata),
            aiSessionId,
            frameAvailable: false,
            endReason: options.endReason,
            endedBy: options.endedBy,
            ...(options.supersededByAiSessionId
              ? {
                  supersededByAiSessionId: options.supersededByAiSessionId,
                  supersededReason: "superseded_by_new_ai_session",
                }
              : {}),
          } as Prisma.InputJsonValue,
        },
      })
    )
  );
}

async function endOtherActiveGlassesStreams(
  patientId: string,
  aiSessionId: string,
  endedAt: Date
) {
  const activeStreams = await prisma.streamSession.findMany({
    where: {
      patientId,
      source: "glasses",
      status: { in: ["starting", "active"] },
      endedAt: null,
    },
  });
  const otherAiSessionIds = new Set(
    activeStreams
      .map((stream) => aiSessionIdFromMetadata(stream.metadata))
      .filter((id): id is string => Boolean(id && id !== aiSessionId))
  );

  for (const otherAiSessionId of otherAiSessionIds) {
    await endStreamsForAiSession(otherAiSessionId, {
      endedAt,
      endReason: "superseded_by_new_ai_session",
      endedBy: "frame_stream_reconciliation",
      supersededByAiSessionId: aiSessionId,
    });
    deleteLatestFrame(otherAiSessionId);
  }
}

export async function upsertAiSessionFrameStream(input: {
  aiSessionId: string;
  patientId: string;
  helpEventId: string | null;
  frame: LatestAiFrame;
}) {
  const existing = await findStreamSessionByAiSessionId(
    input.patientId,
    input.aiSessionId
  );
  const metadata = toFrameMetadata(input.frame);

  if (existing) {
    if (isTerminalStreamStatus(existing.status) || existing.endedAt) {
      throw new AppError(
        409,
        "Associated stream session is no longer active",
        "STREAM_SESSION_NOT_ACTIVE"
      );
    }

    return prisma.streamSession.update({
      where: { id: existing.id },
      data: {
        status: "active",
        metadata: {
          ...asJsonRecord(existing.metadata),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  // Registration-time supersession is authoritative. This only preserves the
  // prior frame callback behavior as a safe reconciliation fallback for an
  // already-active new AI session whose older glasses row was left behind.
  await endOtherActiveGlassesStreams(
    input.patientId,
    input.aiSessionId,
    new Date(input.frame.receivedAt)
  );

  return prisma.streamSession.create({
    data: {
      patientId: input.patientId,
      helpEventId: input.helpEventId,
      source: "glasses",
      status: "active",
      startedAt: safeFrameStartedAt(input.frame.capturedAt, input.frame.receivedAt),
      viewerUrl: null,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

export async function startMobileStreamSession(
  caregiverId: string,
  input: StartStreamSessionInput
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    input.deviceId
  );

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

export async function stopMobileStreamSession(
  caregiverId: string,
  input: StopStreamSessionInput
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    input.deviceId
  );
  const session = await assertStreamSessionForPatient(
    input.streamSessionId,
    patient.id
  );

  const aiSessionId = aiSessionIdFromMetadata(session.metadata);
  if (isTerminalStreamStatus(session.status) && session.endedAt) {
    if (aiSessionId) deleteLatestFrame(aiSessionId);
    return session;
  }

  const updated = await prisma.streamSession.update({
    where: { id: session.id },
    data: {
      status: input.status,
      endedAt: session.endedAt ?? input.endedAt ?? new Date(),
      metadata: {
        ...asJsonRecord(session.metadata),
        ...(aiSessionId ? { aiSessionId } : {}),
        frameAvailable: false,
        endReason: "mobile_stream_stopped",
        endedBy: "mobile_stream_stop",
      } as Prisma.InputJsonValue,
    },
  });

  if (aiSessionId) deleteLatestFrame(aiSessionId);
  return updated;
}

export async function updateMobileStreamStatus(
  caregiverId: string,
  input: UpdateStreamStatusInput
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    input.deviceId
  );
  const session = await assertStreamSessionForPatient(
    input.streamSessionId,
    patient.id
  );

  const terminal = isTerminalStreamStatus(input.status);
  const aiSessionId = aiSessionIdFromMetadata(session.metadata);
  if (
    (session.status === "ended" ||
      session.status === "failed" ||
      session.endedAt !== null) &&
    !terminal
  ) {
    throw new AppError(
      409,
      "Stream session is no longer active",
      "STREAM_SESSION_NOT_ACTIVE"
    );
  }
  if (terminal && isTerminalStreamStatus(session.status) && session.endedAt) {
    if (aiSessionId) deleteLatestFrame(aiSessionId);
    return session;
  }

  const data: Prisma.StreamSessionUpdateInput = {
    status: input.status,
    ...(input.viewerUrl !== undefined ? { viewerUrl: input.viewerUrl } : {}),
    ...(input.metadata !== undefined
      ? {
          metadata: {
            ...asJsonRecord(session.metadata),
            ...asJsonRecord(input.metadata),
          } as Prisma.InputJsonValue,
        }
      : {}),
  };

  if (terminal) {
    data.endedAt = new Date();
    data.metadata = {
      ...asJsonRecord(session.metadata),
      ...asJsonRecord(input.metadata),
      ...(aiSessionId ? { aiSessionId } : {}),
      frameAvailable: false,
      endReason: "mobile_stream_status_updated",
      endedBy: "mobile_stream_status",
    } as Prisma.InputJsonValue;
  }

  const updated = await prisma.streamSession.update({
    where: { id: session.id },
    data,
  });

  if (terminal && aiSessionId) deleteLatestFrame(aiSessionId);
  return updated;
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

export async function getLatestFrameForCaregiver(
  caregiverId: string,
  streamSessionId: string
) {
  const streamSession = await prisma.streamSession.findFirst({
    where: { id: streamSessionId, patient: { caregiverId } },
    select: { id: true, patientId: true, status: true, endedAt: true, metadata: true },
  });
  if (!streamSession) {
    throw new AppError(404, "Stream session not found", "NOT_FOUND");
  }

  const aiSessionId = aiSessionIdFromMetadata(streamSession.metadata);
  if (!aiSessionId) {
    return unavailableFrameResponse(streamSession.id, null, "unavailable");
  }

  if (!isCurrentStreamStatus(streamSession.status) || streamSession.endedAt) {
    return unavailableFrameResponse(
      streamSession.id,
      aiSessionId,
      streamSession.status === "failed"
        ? "failed"
        : streamSession.status === "unavailable"
          ? "unavailable"
          : "ended"
    );
  }

  const aiSession = await prisma.aiSession.findUnique({
    where: { id: aiSessionId },
    select: { patientId: true, status: true, endedAt: true },
  });
  if (!aiSession || aiSession.patientId !== streamSession.patientId) {
    return unavailableFrameResponse(streamSession.id, aiSessionId, "unavailable");
  }
  if (isTerminalStatus(aiSession.status) || aiSession.endedAt) {
    return unavailableFrameResponse(
      streamSession.id,
      aiSessionId,
      aiSession.status === "error" || aiSession.status === "start_failed"
        ? "failed"
        : "ended"
    );
  }

  const frame = aiSessionId ? getLatestFrame(aiSessionId) : null;

  if (!frame || frame.patientId !== streamSession.patientId) {
    return unavailableFrameResponse(streamSession.id, aiSessionId, "waiting");
  }

  return {
    available: true,
    streamSessionId: streamSession.id,
    aiSessionId,
    seq: frame.seq,
    capturedAt: frame.capturedAt,
    receivedAt: frame.receivedAt,
    image: frame.image,
    vision: frame.vision,
  };
}

function toActiveSessionSummary(
  session: Awaited<ReturnType<typeof prisma.streamSession.findFirst>>
) {
  if (!session) return null;
  const metadata = asJsonRecord(session.metadata);
  return {
    id: session.id,
    status: session.status,
    source: session.source,
    viewerUrl: session.viewerUrl,
    startedAt: session.startedAt,
    aiSessionId:
      typeof metadata.aiSessionId === "string" ? metadata.aiSessionId : null,
    frameAvailable: metadata.frameAvailable === true,
    lastFrameSeq:
      typeof metadata.lastFrameSeq === "number" ? metadata.lastFrameSeq : null,
    lastFrameAt:
      typeof metadata.lastFrameCapturedAt === "string"
        ? metadata.lastFrameCapturedAt
        : typeof metadata.lastFrameReceivedAt === "string"
          ? metadata.lastFrameReceivedAt
          : null,
    visionLabel:
      typeof metadata.visionLabel === "string" ? metadata.visionLabel : null,
    visionDescription:
      typeof metadata.visionDescription === "string"
        ? metadata.visionDescription
        : null,
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
