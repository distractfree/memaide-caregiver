import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { findPatientForCaregiverDevice } from "../patients/patient.service";
import { SCRIPTED_MESSAGES, determineNextAiMessage } from "./ai-session.messages";
import { validateTransition, AiSessionStatus } from "./ai-session.state-machine";
import {
  NON_TERMINAL_STATUSES,
  computeJoinability,
  isTerminalStatus,
} from "./ai-session.lifecycle";
import { deriveRegistrationStatus, toApiMessages } from "./ai-session.dto";
import type {
  AiSessionConcludeCallbackInput,
  AiSessionEscalationCallbackInput,
  AiSessionFrameCallbackInput,
  StartAiSessionInput,
} from "./ai-session.schemas";
import {
  acceptLatestFrame,
  deleteLatestFrame,
  restoreLatestFrameAfterFailedAcceptance,
} from "./latest-ai-frame.store";
import {
  endStreamsForAiSession,
  findStreamSessionByAiSessionId,
  isTerminalStreamStatus,
  upsertAiSessionFrameStream,
} from "../streams/stream.service";

type PatientContext = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  deviceId?: string | null;
  caregiver?: {
    id: string;
    name: string;
  } | null;
  reminders?: Array<{
    id: string;
    type: string;
    description: string;
    timeOfDay: string;
    frequency: string;
  }>;
  helpContacts?: Array<{
    whatsappNumber: string;
    label: string;
  }>;
  vitalEvents?: Array<{
    timestamp: Date | string;
    heartRate: number | null;
    motionState: string | null;
    stepCount: number | null;
  }>;
  beaconEvents?: Array<{
    roomName: string;
    detectedAt: Date | string;
    exitedAt: Date | string | null;
    dwellSeconds: number | null;
    estimatedDistanceM: number | null;
  }>;
  helpEvents?: Array<{
    id: string;
    triggeredAt: Date | string;
    sourceDevice: string;
    status: string;
  }>;
  aiSessions?: Array<{
    id: string;
    status: string;
    startedAt: Date | string;
    endedAt: Date | string | null;
    summary: string | null;
  }>;
};

type PatientVitalEvent = NonNullable<PatientContext["vitalEvents"]>[number];
type PatientBeaconEvent = NonNullable<PatientContext["beaconEvents"]>[number];

type AiAgentVitalPayload = {
  heart_rate?: number | null;
  motion_state?: string | null;
  step_count?: number | null;
  timestamp?: string | null;
};

type AiAgentMedicationPayload = {
  name: string;
  dose?: string | null;
  schedule: string;
  active: boolean;
};

type AiAgentBeaconPayload = {
  room: string;
  detected_at: string;
  dwell_seconds: number | null;
  estimated_distance_m: number | null;
  exited_at: string | null;
};

type AiAgentStartPayload = {
  session_id: string;
  patient: {
    patient_id: string;
    name: string;
    preferred_name: string;
    known_conditions: string[];
    medications: AiAgentMedicationPayload[];
    caregiver: {
      id: string;
      name: string;
      phone: string;
    };
    notes?: string;
  };
  vitals: AiAgentVitalPayload | null;
  beacons: AiAgentBeaconPayload[];
};

type JsonRecord = Record<string, unknown>;

function normalizeFrameVision(input: AiSessionFrameCallbackInput) {
  return {
    description: input.vision?.description ?? null,
    label: input.vision?.label ?? null,
    flags: input.vision?.flags ?? [],
    advisoryFlags: input.vision?.advisory_flags ?? [],
  };
}

export class AiAgentSessionStartError extends Error {
  constructor(
    public readonly statusCode: 502 | 504,
    public readonly upstreamStatus?: number
  ) {
    super("AI backend session start failed");
    this.name = "AiAgentSessionStartError";
  }
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function asJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function clearLatestFrameAfterDatabaseCommit(aiSessionId: string) {
  try {
    deleteLatestFrame(aiSessionId);
  } catch {
    // The database status remains the privacy boundary if process-local cache
    // cleanup ever fails. Never log frame content or callback data here.
    console.error("[ai-session] unable to clear latest frame", { aiSessionId });
  }
}

function mapTranscriptSenderType(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  if (normalizedRole === "agent" || normalizedRole === "assistant" || normalizedRole === "ai") {
    return "ai";
  }

  if (normalizedRole === "patient" || normalizedRole === "user") {
    return "patient";
  }

  if (normalizedRole === "caregiver" || normalizedRole === "caretaker") {
    return "caregiver";
  }

  if (normalizedRole === "system") {
    return "system";
  }

  return "event";
}

function normalizeRequestVitals(
  vitals: StartAiSessionInput["vitals"]
): AiAgentVitalPayload | null {
  if (!vitals) return null;

  return {
    heart_rate: vitals.heart_rate ?? null,
    motion_state: vitals.motion_state ?? null,
    step_count: vitals.step_count ?? null,
    timestamp: vitals.timestamp,
  };
}

function normalizeDbVitals(vitalEvent: PatientVitalEvent): AiAgentVitalPayload {
  return {
    heart_rate: vitalEvent.heartRate,
    motion_state: vitalEvent.motionState,
    step_count: vitalEvent.stepCount,
    timestamp: toIsoString(vitalEvent.timestamp),
  };
}

function normalizeRequestBeacons(
  beacons: StartAiSessionInput["beacons"] | undefined
): AiAgentBeaconPayload[] {
  return (beacons ?? []).map((beacon) => ({
    room: beacon.room,
    detected_at: beacon.detected_at,
    dwell_seconds: beacon.dwell_seconds ?? null,
    estimated_distance_m: beacon.estimated_distance_m ?? null,
    exited_at: beacon.exited_at ?? null,
  }));
}

function normalizeDbBeacons(
  beaconEvents: PatientBeaconEvent[]
): AiAgentBeaconPayload[] {
  return beaconEvents.map((event) => ({
    room: event.roomName,
    detected_at: toIsoString(event.detectedAt) ?? "",
    dwell_seconds: event.dwellSeconds,
    estimated_distance_m: event.estimatedDistanceM,
    exited_at: toIsoString(event.exitedAt),
  }));
}

function normalizeReminderMedications(
  reminders: PatientContext["reminders"]
): AiAgentMedicationPayload[] {
  return (reminders ?? [])
    .map((reminder): AiAgentMedicationPayload | null => {
      const name =
        reminder.description?.trim() ||
        reminder.type?.trim() ||
        "Medication reminder";

      // Anthony rejects medication items without a name; the fallback above
      // guarantees one, but guard defensively so we never send a nameless item.
      if (!name) return null;

      const schedule = [reminder.timeOfDay, reminder.frequency]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(" ");

      return {
        name,
        schedule,
        active: true,
      };
    })
    .filter((medication): medication is AiAgentMedicationPayload =>
      medication !== null
    );
}

function buildPatientNotes(patient: PatientContext) {
  const helpHistory = (patient.helpEvents ?? [])
    .map(
      (event) =>
        `${event.status} via ${event.sourceDevice} at ${toIsoString(event.triggeredAt)}`
    )
    .join("; ");

  const sessionHistory = (patient.aiSessions ?? [])
    .map(
      (session) =>
        `${session.status} session ${session.id} started ${toIsoString(session.startedAt)}`
    )
    .join("; ");

  const notes = [
    helpHistory ? `Recent help history: ${helpHistory}` : null,
    sessionHistory ? `Recent AI session history: ${sessionHistory}` : null,
  ].filter((note): note is string => Boolean(note));

  return notes.length > 0 ? notes.join(" ") : undefined;
}

function buildAiAgentStartPayload(
  sessionId: string,
  patient: PatientContext,
  input: StartAiSessionInput
): AiAgentStartPayload {
  const activeHelpContact = patient.helpContacts?.[0];
  const latestDbVitals = patient.vitalEvents?.[0];
  const notes = buildPatientNotes(patient);

  return {
    session_id: sessionId,
    patient: {
      patient_id: patient.id,
      name: patient.name,
      preferred_name: patient.name,
      known_conditions: [],
      medications: normalizeReminderMedications(patient.reminders),
      caregiver: {
        id: patient.caregiver?.id ?? "",
        name: patient.caregiver?.name ?? "",
        phone: activeHelpContact?.whatsappNumber ?? "",
      },
      ...(notes ? { notes } : {}),
    },
    // Send a valid vitals object when we have one, otherwise send null.
    // Never send an empty object ({}), which the AI agent rejects as invalid.
    vitals:
      normalizeRequestVitals(input.vitals) ??
      (latestDbVitals ? normalizeDbVitals(latestDbVitals) : null),
    beacons: [
      ...normalizeRequestBeacons(input.beacons),
      ...normalizeDbBeacons(patient.beaconEvents ?? []),
    ],
  };
}

function getAiAgentTimeoutMs() {
  const parsed = Number(process.env.AI_AGENT_TIMEOUT_MS ?? "5000");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isRegisteredResponse(value: unknown): value is { status: "registered" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status?: unknown }).status === "registered"
  );
}

async function callAiAgentSessionStart(payload: AiAgentStartPayload) {
  const baseUrl = process.env.AI_AGENT_URL?.trim();
  // Anthony's backend originally named the shared secret AI_AGENT_API; we
  // standardize on AI_AGENT_API_KEY but keep a safe fallback so a stale env
  // name does not silently break the integration.
  const apiKey = (process.env.AI_AGENT_API_KEY || process.env.AI_AGENT_API)?.trim();
  const websocketUrl = process.env.AI_AGENT_WS_URL?.trim();

  if (!baseUrl || !apiKey || !websocketUrl) {
    console.error("[ai-session] AI agent is not fully configured", {
      hasBaseUrl: Boolean(baseUrl),
      hasApiKey: Boolean(apiKey),
      hasWebsocketUrl: Boolean(websocketUrl),
    });
    throw new AiAgentSessionStartError(502);
  }

  const requestUrl = `${baseUrl.replace(/\/+$/, "")}/session/start`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getAiAgentTimeoutMs());

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // Read only enough to validate the acknowledgement. Upstream response
    // bodies can contain patient context and must not be logged or relayed.
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }

    if (response.status !== 200) {
      console.error("[ai-session] AI agent returned a non-200 response", {
        upstreamStatus: response.status,
      });
      throw new AiAgentSessionStartError(502, response.status);
    }

    if (!isRegisteredResponse(responseBody)) {
      console.error("[ai-session] AI agent did not confirm registration", {
        upstreamStatus: response.status,
      });
      throw new AiAgentSessionStartError(502, response.status);
    }
  } catch (error) {
    if (error instanceof AiAgentSessionStartError) {
      throw error;
    }

    if (isAbortError(error) || controller.signal.aborted) {
      console.error("[ai-session] AI agent session start timed out", {
        timeoutMs: getAiAgentTimeoutMs(),
      });
      throw new AiAgentSessionStartError(504);
    }

    console.error("[ai-session] AI agent session start network error");
    throw new AiAgentSessionStartError(502);
  } finally {
    clearTimeout(timeout);
  }
}

async function markAiSessionStartFailed(sessionId: string, statusCode: 502 | 504) {
  try {
    const existing = await prisma.aiSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    const failedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.aiSession.update({
        where: { id: sessionId },
        data: {
          // start_failed is terminal, carries endedAt, and is never joinable.
          status: "start_failed",
          endedAt: failedAt,
          metadata: {
            ...asJsonRecord(existing?.metadata),
            registrationFailed: true,
            aiAgentStartFailedAt: failedAt.toISOString(),
            upstreamStatusCode: statusCode,
          },
        },
      });
      await endStreamsForAiSession(sessionId, {
        client: tx,
        endedAt: failedAt,
        endReason: "ai_session_start_failed",
        endedBy: "ai_session_start",
      });
    });
    clearLatestFrameAfterDatabaseCommit(sessionId);
  } catch {
    // Best effort: the API response should still reflect the upstream start failure.
  }
}

// Enforce one active session per patient: any previous non-terminal session is
// safely closed (endedAt set, history preserved) and tagged as superseded so it
// can never remain Active or joinable after a new session starts.
async function supersedePreviousSessions(patientId: string, newSessionId: string) {
  const previous =
    (await prisma.aiSession.findMany({
      where: {
        patientId,
        id: { not: newSessionId },
        status: { in: NON_TERMINAL_STATUSES },
      },
      select: { id: true, metadata: true },
    })) ?? [];

  const supersededAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const session of previous) {
      await tx.aiSession.update({
        where: { id: session.id },
        data: {
          status: "cancelled",
          endedAt: supersededAt,
          metadata: {
            ...asJsonRecord(session.metadata),
            supersededBy: newSessionId,
            supersededAt: supersededAt.toISOString(),
            supersededReason: "superseded_by_new_session",
          },
        },
      });
      await endStreamsForAiSession(session.id, {
        client: tx,
        endedAt: supersededAt,
        endReason: "superseded_by_new_ai_session",
        endedBy: "ai_session_supersession",
        supersededByAiSessionId: newSessionId,
      });
    }
  });

  for (const session of previous) {
    clearLatestFrameAfterDatabaseCommit(session.id);
  }

  return previous.length;
}

export async function startAiSession(
  input: StartAiSessionInput,
  caregiverId: string
) {
  const ownedPatient = await findPatientForCaregiverDevice(
    caregiverId,
    input.deviceId
  );

  const patient = (await prisma.patient.findUnique({
    where: { deviceId: input.deviceId },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      deviceId: true,
      caregiver: {
        select: {
          id: true,
          name: true,
        },
      },
      reminders: {
        where: { active: true },
        select: {
          id: true,
          type: true,
          description: true,
          timeOfDay: true,
          frequency: true,
        },
        orderBy: { timeOfDay: "asc" },
      },
      helpContacts: {
        where: { active: true },
        select: {
          whatsappNumber: true,
          label: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      vitalEvents: {
        select: {
          timestamp: true,
          heartRate: true,
          motionState: true,
          stepCount: true,
        },
        orderBy: { timestamp: "desc" },
        take: 1,
      },
      beaconEvents: {
        select: {
          roomName: true,
          detectedAt: true,
          exitedAt: true,
          dwellSeconds: true,
          estimatedDistanceM: true,
        },
        orderBy: [{ detectedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
      },
      helpEvents: {
        select: {
          id: true,
          triggeredAt: true,
          sourceDevice: true,
          status: true,
        },
        orderBy: { triggeredAt: "desc" },
        take: 5,
      },
      aiSessions: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          endedAt: true,
          summary: true,
        },
        orderBy: { startedAt: "desc" },
        take: 5,
      },
    },
  })) as PatientContext | null;

  if (!patient || patient.id !== ownedPatient.id) {
    throw new AppError(404, "No patient found for this device", "NOT_FOUND");
  }

  if (input.helpEventId) {
    const helpEvent = await prisma.helpEvent.findUnique({
      where: { id: input.helpEventId },
    });
    if (!helpEvent || helpEvent.patientId !== patient.id) {
      throw new AppError(404, "Help event not found or does not belong to this patient");
    }
  }

  const session = await prisma.aiSession.create({
    data: {
      patientId: patient.id,
      helpEventId: input.helpEventId || null,
      status: "starting",
      metadata: {
        sourceDevice: input.sourceDevice,
        aiAgentStartRequestedAt: new Date().toISOString(),
      },
    },
    select: {
      id: true,
    },
  });

  const payload = buildAiAgentStartPayload(session.id, patient, input);

  try {
    await callAiAgentSessionStart(payload);
  } catch (error) {
    const startError =
      error instanceof AiAgentSessionStartError
        ? error
        : new AiAgentSessionStartError(502);
    await markAiSessionStartFailed(session.id, startError.statusCode);
    throw startError;
  }

  await prisma.aiSession.update({
    where: { id: session.id },
    data: {
      status: "active",
      metadata: {
        sourceDevice: input.sourceDevice,
        aiAgentStartRequestedAt: new Date().toISOString(),
        aiAgentRegisteredAt: new Date().toISOString(),
      },
    },
  });

  // Only after the new session is genuinely registered do we close previous
  // sessions, so a failed start never orphans the patient's existing session.
  await supersedePreviousSessions(patient.id, session.id);

  return {
    success: true,
    sessionId: session.id,
    websocketUrl: process.env.AI_AGENT_WS_URL,
    helloMessage: {
      type: "hello" as const,
      session_id: session.id,
    },
  };
}

export async function recordEscalationCallback(
  sessionId: string,
  input: AiSessionEscalationCallbackInput
) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      endedAt: true,
      emergencySuggestedAt: true,
      metadata: true,
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found", "NOT_FOUND");
  }
  if (isTerminalStatus(session.status) || session.endedAt) {
    throw new AppError(409, "AI session is not active", "AI_SESSION_NOT_ACTIVE");
  }
  if (session.status === "emergency_suggested") {
    return { success: true, alreadyEscalated: true };
  }

  validateTransition(session.status as AiSessionStatus, "emergency_suggested");

  const receivedAt = new Date();
  const escalationMetadata = {
    reason: input.reason,
    triggered_by: input.triggered_by,
    received_at: receivedAt.toISOString(),
  };

  const transition = await prisma.aiSession.updateMany({
    where: { id: sessionId, status: session.status, endedAt: null },
    data: {
      status: "emergency_suggested",
      emergencySuggestedAt: session.emergencySuggestedAt ?? receivedAt,
      metadata: {
        ...asJsonRecord(session.metadata),
        aiEscalation: escalationMetadata,
      },
    },
  });

  if (transition.count === 0) {
    const current = await prisma.aiSession.findUnique({
      where: { id: sessionId },
      select: { status: true, endedAt: true },
    });
    if (current?.status === "emergency_suggested" && !current.endedAt) {
      return { success: true, alreadyEscalated: true };
    }
    throw new AppError(409, "AI session is not active", "AI_SESSION_NOT_ACTIVE");
  }

  await prisma.aiSessionMessage.create({
    data: {
      aiSessionId: sessionId,
      senderType: "event",
      message: `AI escalation requested: ${input.reason}`,
      metadata: {
        type: "ai_escalation",
        ...escalationMetadata,
      },
    },
  });

  return { success: true };
}

export async function recordConcludeCallback(
  sessionId: string,
  input: AiSessionConcludeCallbackInput
) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      patientId: true,
      status: true,
      endedAt: true,
      metadata: true,
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found", "NOT_FOUND");
  }
  if (input.patient_id !== session.patientId) {
    throw new AppError(
      400,
      "Callback patient does not match the AI session",
      "CALLBACK_PATIENT_MISMATCH"
    );
  }

  const existingMetadata = asJsonRecord(session.metadata);
  const concludedAt = new Date();
  const endedAt = new Date(input.ended_at);
  const nextStatus =
    input.status.toLowerCase() === "error" || input.status.toLowerCase() === "failed"
      ? "error"
      : "resolved";
  const conclusionMetadata = {
    anthony_session_id: input.id,
    patient_id: input.patient_id,
    related_caretaker_id: input.related_caretaker_id ?? null,
    started_at: input.started_at,
    ended_at: input.ended_at,
    handoff_at: input.handoff_at ?? null,
    handoff_type: input.handoff_type ?? null,
    final_scene_label: input.final_scene_label ?? null,
    escalated: input.escalated,
    status: input.status,
    outcome: input.outcome,
    transcript_message_count: input.transcript.length,
    received_at: concludedAt.toISOString(),
  };

  const alreadyConcluded = Boolean(existingMetadata.aiConclusion);
  if (alreadyConcluded) {
    await prisma.$transaction((tx) =>
      endStreamsForAiSession(sessionId, {
        client: tx,
        endedAt: session.endedAt ?? endedAt,
        endReason: nextStatus === "error" ? "ai_session_error" : "ai_session_concluded",
        endedBy: "anthony_conclude_callback",
      })
    );
    clearLatestFrameAfterDatabaseCommit(sessionId);
    return { success: true, alreadyConcluded: true };
  }

  if (isTerminalStatus(session.status) || session.endedAt) {
    throw new AppError(409, "AI session is not active", "AI_SESSION_NOT_ACTIVE");
  }
  validateTransition(session.status as AiSessionStatus, nextStatus as AiSessionStatus);

  let recordedConclusion = false;
  await prisma.$transaction(async (tx) => {
    const transition = await tx.aiSession.updateMany({
      where: { id: sessionId, status: session.status, endedAt: null },
      data: {
        status: nextStatus,
        endedAt,
        summary: `AI session concluded with outcome ${input.outcome}. Final scene: ${input.final_scene_label ?? "unknown"}.`,
        metadata: {
          ...existingMetadata,
          aiConclusion: conclusionMetadata,
        },
      },
    });

    if (transition.count > 0) {
      recordedConclusion = true;
      for (const transcriptMessage of input.transcript) {
        await tx.aiSessionMessage.create({
          data: {
            aiSessionId: sessionId,
            senderType: mapTranscriptSenderType(transcriptMessage.role),
            message: transcriptMessage.text,
            createdAt: new Date(transcriptMessage.ts),
            metadata: {
              type: "ai_transcript",
              role: transcriptMessage.role,
              ts: transcriptMessage.ts,
              scene_label: transcriptMessage.scene_label ?? null,
              source: "anthony_ai_backend",
            },
          },
        });
      }
    }

    if (recordedConclusion) {
      await endStreamsForAiSession(sessionId, {
        client: tx,
        endedAt,
        endReason: nextStatus === "error" ? "ai_session_error" : "ai_session_concluded",
        endedBy: "anthony_conclude_callback",
      });
    }
  });

  if (!recordedConclusion) {
    const current = await prisma.aiSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!asJsonRecord(current?.metadata).aiConclusion) {
      throw new AppError(409, "AI session is not active", "AI_SESSION_NOT_ACTIVE");
    }
  }

  clearLatestFrameAfterDatabaseCommit(sessionId);
  return { success: true, ...(recordedConclusion ? {} : { alreadyConcluded: true }) };
}

/**
 * Receives one lightweight egocentric frame event. Image bytes are never
 * decoded, transformed, logged, or persisted; the latest base64 value remains
 * exclusively in the bounded in-memory cache.
 */
export async function recordFrameCallback(
  sessionId: string,
  input: AiSessionFrameCallbackInput
): Promise<
  | { accepted: true; receivedAt: string }
  | { accepted: false; reason: "duplicate" | "out_of_order" }
> {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      patientId: true,
      helpEventId: true,
      status: true,
      endedAt: true,
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found", "NOT_FOUND");
  }
  if (isTerminalStatus(session.status) || session.endedAt) {
    throw new AppError(409, "AI session is not active", "AI_SESSION_NOT_ACTIVE");
  }

  const existingStream = await findStreamSessionByAiSessionId(
    session.patientId,
    session.id
  );
  if (existingStream && (isTerminalStreamStatus(existingStream.status) || existingStream.endedAt)) {
    throw new AppError(
      409,
      "Associated stream session is no longer active",
      "STREAM_SESSION_NOT_ACTIVE"
    );
  }

  const receivedAt = new Date().toISOString();
  const accepted = acceptLatestFrame({
    aiSessionId: session.id,
    patientId: session.patientId,
    seq: input.seq,
    capturedAt: input.ts,
    receivedAt,
    image: input.image ?? null,
    vision: normalizeFrameVision(input),
  });

  if (!accepted.accepted) {
    return { accepted: false, reason: accepted.reason };
  }

  try {
    await upsertAiSessionFrameStream({
      aiSessionId: session.id,
      patientId: session.patientId,
      helpEventId: session.helpEventId,
      frame: accepted.frame,
    });
  } catch (error) {
    // A retry must be able to perform the bridge if the database operation
    // fails. Do not roll back a newer callback that arrived concurrently.
    restoreLatestFrameAfterFailedAcceptance(
      session.id,
      input.seq,
      accepted.previous
    );
    throw error;
  }

  return { accepted: true, receivedAt };
}

export async function getMobileSession(
  sessionId: string,
  deviceId: string,
  caregiverId: string
) {
  const patient = await findPatientForCaregiverDevice(caregiverId, deviceId);
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true, messages: { orderBy: { createdAt: 'asc' } } }
  });

  if (!session || session.patientId !== patient.id) {
    throw new AppError(404, "Session not found");
  }

  return {
    id: session.id,
    patientId: session.patientId,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    messages: toApiMessages(session.messages),
  };
}

export async function handlePatientMessage(
  sessionId: string,
  deviceId: string,
  messageText: string,
  caregiverId: string
) {
  const patient = await findPatientForCaregiverDevice(caregiverId, deviceId);
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true, messages: true }
  });

  if (!session || session.patientId !== patient.id) {
    throw new AppError(404, "Session not found");
  }

  if (
    session.status === "starting" ||
    session.status === "resolved" ||
    session.status === "cancelled" ||
    session.status === "error" ||
    session.status === "start_failed"
  ) {
    throw new AppError(400, `Cannot send message to a ${session.status} session`);
  }

  // Count earlier patient messages to pick the next reply.
  const patientMessageCount = session.messages.filter(m => m.senderType === "patient").length;

  // Pick the scripted reply.
  const { message: aiMessageText, triggersEmergency } = determineNextAiMessage(messageText, patientMessageCount);

  // Save the patient message and AI reply together.
  const result = await prisma.$transaction(async (tx) => {
    const patientMsg = await tx.aiSessionMessage.create({
      data: { aiSessionId: sessionId, senderType: "patient", message: messageText }
    });

    const aiMsg = await tx.aiSessionMessage.create({
      data: { aiSessionId: sessionId, senderType: "ai", message: aiMessageText }
    });

    let newStatus = session.status as AiSessionStatus;
    if (triggersEmergency && newStatus === "active") {
      validateTransition(newStatus, "emergency_suggested");
      newStatus = "emergency_suggested";
      
      await tx.aiSession.update({
        where: { id: sessionId },
        data: { 
          status: newStatus,
          emergencySuggestedAt: new Date()
        }
      });
    }

    return { patientMessage: patientMsg, aiResponse: aiMsg, sessionStatus: newStatus };
  });

  return result;
}

export async function resolveSession(
  sessionId: string,
  deviceId: string,
  caregiverId: string
) {
  const patient = await findPatientForCaregiverDevice(caregiverId, deviceId);
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true }
  });

  if (!session || session.patientId !== patient.id) {
    throw new AppError(404, "Session not found");
  }

  if (session.status === "resolved") {
    await prisma.$transaction((tx) =>
      endStreamsForAiSession(sessionId, {
        client: tx,
        endedAt: session.endedAt ?? new Date(),
        endReason: "mobile_resolved",
        endedBy: "mobile_resolve",
      })
    );
    clearLatestFrameAfterDatabaseCommit(sessionId);
    return session;
  }

  validateTransition(session.status as AiSessionStatus, "resolved");
  const resolvedAt = new Date();

  const resolvedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.aiSession.update({
      where: { id: sessionId },
      data: {
        status: "resolved",
        endedAt: resolvedAt,
        summary: "Support session concluded. Patient requested assistance and caregiver coordination was recorded."
      }
    });

    await tx.aiSessionMessage.create({
      data: {
        aiSessionId: sessionId,
        senderType: "event",
        message: SCRIPTED_MESSAGES.system.resolved
      }
    });

    await endStreamsForAiSession(sessionId, {
      client: tx,
      endedAt: resolvedAt,
      endReason: "mobile_resolved",
      endedBy: "mobile_resolve",
    });

    return updated;
  });

  clearLatestFrameAfterDatabaseCommit(sessionId);
  return resolvedSession;
}

export async function acknowledgeEmergency(
  sessionId: string,
  deviceId: string,
  action: "call_initiated" | "dismissed",
  caregiverId: string
) {
  const patient = await findPatientForCaregiverDevice(caregiverId, deviceId);
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true }
  });

  if (!session || session.patientId !== patient.id) {
    throw new AppError(404, "Session not found");
  }

  // This records the emergency suggestion choice without changing the status.
  if (session.status !== "emergency_suggested") {
    throw new AppError(400, `Emergency acknowledgment only allowed in emergency_suggested state, not ${session.status}`);
  }

  await prisma.aiSessionMessage.create({
    data: {
      aiSessionId: sessionId,
      senderType: "event",
      message: SCRIPTED_MESSAGES.system.emergencyAckLog(action)
    }
  });

  return {
    id: session.id,
    status: session.status,
    acknowledgment: action
  };
}

// Caregiver endpoints

export async function listCaregiverSessions(patientId: string, caregiverId: string, query: { status?: string, from?: string, to?: string, limit?: number }) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient || patient.caregiverId !== caregiverId) {
    throw new AppError(404, "Patient not found");
  }

  const where: any = { patientId };
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const sessions = await prisma.aiSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    // Bounded history: newest-first, capped by the caller's limit when provided.
    // No records are deleted; older sessions remain reachable via a wider filter.
    ...(query.limit ? { take: query.limit } : {}),
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  return sessions.map(s => {
    const joinability = computeJoinability({
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      updatedAt: s.updatedAt,
      caregiverJoinedAt: s.caregiverJoinedAt,
      emergencySuggestedAt: s.emergencySuggestedAt,
      metadata: s.metadata,
      lastMessageAt: s.messages?.[0]?.createdAt ?? null,
    });

    return {
      id: s.id,
      patientId: s.patientId,
      helpEventId: s.helpEventId,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      caregiverJoinedAt: s.caregiverJoinedAt,
      emergencySuggestedAt: s.emergencySuggestedAt,
      summary: s.summary,
      messageCount: s._count.messages,
      isJoinable: joinability.isJoinable,
      joinabilityReason: joinability.joinabilityReason,
      displayStatus: joinability.displayStatus,
      lastActivityAt: joinability.lastActivityAt,
    };
  });
}

export async function getCaregiverSession(sessionId: string, caregiverId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true, messages: { orderBy: { createdAt: 'asc' } } }
  });

  if (!session || session.patient.caregiverId !== caregiverId) {
    throw new AppError(404, "Session not found");
  }

  const lastMessage = session.messages?.[session.messages.length - 1];
  const joinability = computeJoinability({
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    updatedAt: session.updatedAt,
    caregiverJoinedAt: session.caregiverJoinedAt,
    emergencySuggestedAt: session.emergencySuggestedAt,
    metadata: session.metadata,
    lastMessageAt: lastMessage?.createdAt ?? null,
  });

  return {
    ...session,
    // Canonical message DTO (role/content), never raw Prisma rows.
    messages: toApiMessages(session.messages),
    isJoinable: joinability.isJoinable,
    joinabilityReason: joinability.joinabilityReason,
    displayStatus: joinability.displayStatus,
    lastActivityAt: joinability.lastActivityAt,
    registrationStatus: deriveRegistrationStatus(session.status, session.metadata),
  };
}

export async function caregiverJoinSession(sessionId: string, caregiverId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: {
      patient: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (!session || session.patient.caregiverId !== caregiverId) {
    throw new AppError(404, "Session not found");
  }

  validateTransition(session.status as AiSessionStatus, "caregiver_joined");

  // Backend-authoritative guard: even a direct API call must not join a session
  // that is ended, terminal, stale, superseded, or otherwise non-joinable.
  const joinability = computeJoinability({
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    updatedAt: session.updatedAt,
    caregiverJoinedAt: session.caregiverJoinedAt,
    emergencySuggestedAt: session.emergencySuggestedAt,
    metadata: session.metadata,
    lastMessageAt: session.messages?.[0]?.createdAt ?? null,
  });

  if (!joinability.isJoinable) {
    throw new AppError(
      409,
      `This session is no longer joinable (${joinability.joinabilityReason}).`,
      "SESSION_NOT_JOINABLE"
    );
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.aiSession.update({
      where: { id: sessionId },
      data: {
        status: "caregiver_joined",
        caregiverJoinedAt: new Date()
      }
    });

    await tx.aiSessionMessage.create({
      data: {
        aiSessionId: sessionId,
        senderType: "event",
        message: SCRIPTED_MESSAGES.system.caregiverJoined
      }
    });

    return updated;
  });

  return updatedSession;
}

export async function caregiverResolveSession(sessionId: string, caregiverId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true }
  });

  if (!session || session.patient.caregiverId !== caregiverId) {
    throw new AppError(404, "Session not found");
  }

  if (session.status === "resolved") {
    await prisma.$transaction((tx) =>
      endStreamsForAiSession(sessionId, {
        client: tx,
        endedAt: session.endedAt ?? new Date(),
        endReason: "caregiver_resolved",
        endedBy: "caregiver_resolve",
      })
    );
    clearLatestFrameAfterDatabaseCommit(sessionId);
    return session;
  }

  validateTransition(session.status as AiSessionStatus, "resolved");
  const resolvedAt = new Date();

  const updatedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.aiSession.update({
      where: { id: sessionId },
      data: {
        status: "resolved",
        endedAt: resolvedAt,
        summary: "Support session concluded. Patient requested assistance and caregiver coordination was recorded."
      }
    });

    await tx.aiSessionMessage.create({
      data: {
        aiSessionId: sessionId,
        senderType: "event",
        message: SCRIPTED_MESSAGES.system.resolved
      }
    });

    await endStreamsForAiSession(sessionId, {
      client: tx,
      endedAt: resolvedAt,
      endReason: "caregiver_resolved",
      endedBy: "caregiver_resolve",
    });

    return updated;
  });

  clearLatestFrameAfterDatabaseCommit(sessionId);
  return updatedSession;
}
