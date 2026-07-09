import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { SCRIPTED_MESSAGES, determineNextAiMessage } from "./ai-session.messages";
import { validateTransition, AiSessionStatus } from "./ai-session.state-machine";
import type {
  AiSessionConcludeCallbackInput,
  AiSessionEscalationCallbackInput,
  StartAiSessionInput,
} from "./ai-session.schemas";

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
    medications: Array<{
      id: string;
      type: string;
      description: string;
      time_of_day: string;
      frequency: string;
    }>;
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

export class AiAgentSessionStartError extends Error {
  constructor(
    public readonly statusCode: 502 | 504,
    public readonly upstreamStatus?: number,
    public readonly upstreamBody?: string
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

function isTerminalStatus(status: string) {
  return (
    status === "resolved" ||
    status === "cancelled" ||
    status === "error" ||
    status === "start_failed"
  );
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
      medications: (patient.reminders ?? []).map((reminder) => ({
        id: reminder.id,
        type: reminder.type,
        description: reminder.description,
        time_of_day: reminder.timeOfDay,
        frequency: reminder.frequency,
      })),
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

    // Read the body once so it can be used for both parsing and diagnostics.
    let responseBody: unknown;
    let upstreamBody = "";
    try {
      responseBody = await response.json();
      upstreamBody = JSON.stringify(responseBody);
    } catch {
      responseBody = undefined;
      upstreamBody = "<non-JSON or empty response body>";
    }

    if (response.status !== 200) {
      console.error("[ai-session] AI agent returned a non-200 response", {
        url: requestUrl,
        upstreamStatus: response.status,
        upstreamBody,
      });
      throw new AiAgentSessionStartError(502, response.status, upstreamBody);
    }

    if (!isRegisteredResponse(responseBody)) {
      console.error("[ai-session] AI agent did not confirm registration", {
        url: requestUrl,
        upstreamStatus: response.status,
        upstreamBody,
      });
      throw new AiAgentSessionStartError(502, response.status, upstreamBody);
    }
  } catch (error) {
    if (error instanceof AiAgentSessionStartError) {
      throw error;
    }

    if (isAbortError(error) || controller.signal.aborted) {
      console.error("[ai-session] AI agent session start timed out", {
        url: requestUrl,
        timeoutMs: getAiAgentTimeoutMs(),
      });
      throw new AiAgentSessionStartError(504);
    }

    console.error("[ai-session] AI agent session start network error", {
      url: requestUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AiAgentSessionStartError(502);
  } finally {
    clearTimeout(timeout);
  }
}

async function markAiSessionStartFailed(sessionId: string, statusCode: 502 | 504) {
  try {
    await prisma.aiSession.update({
      where: { id: sessionId },
      data: {
        status: "start_failed",
        endedAt: new Date(),
        metadata: {
          aiAgentStartFailedAt: new Date().toISOString(),
          upstreamStatusCode: statusCode,
        },
      },
    });
  } catch {
    // Best effort: the API response should still reflect the upstream start failure.
  }
}

export async function startAiSession(input: StartAiSessionInput) {
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

  if (!patient) {
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
      emergencySuggestedAt: true,
      metadata: true,
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found", "NOT_FOUND");
  }

  const receivedAt = new Date();
  const escalationMetadata = {
    reason: input.reason,
    triggered_by: input.triggered_by,
    received_at: receivedAt.toISOString(),
  };

  await prisma.aiSession.update({
    where: { id: sessionId },
    data: {
      status: isTerminalStatus(session.status) ? session.status : "emergency_suggested",
      emergencySuggestedAt: session.emergencySuggestedAt ?? receivedAt,
      metadata: {
        ...asJsonRecord(session.metadata),
        aiEscalation: escalationMetadata,
      },
    },
  });

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
      status: true,
      metadata: true,
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found", "NOT_FOUND");
  }

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

  await prisma.aiSession.update({
    where: { id: sessionId },
    data: {
      status: nextStatus,
      endedAt,
      summary: `AI session concluded with outcome ${input.outcome}. Final scene: ${input.final_scene_label ?? "unknown"}.`,
      metadata: {
        ...asJsonRecord(session.metadata),
        aiConclusion: conclusionMetadata,
      },
    },
  });

  for (const transcriptMessage of input.transcript) {
    await prisma.aiSessionMessage.create({
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

  return { success: true };
}

export async function getMobileSession(sessionId: string, deviceId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true, messages: { orderBy: { createdAt: 'asc' } } }
  });

  if (!session || session.patient.deviceId !== deviceId) {
    throw new AppError(404, "Session not found");
  }

  return {
    id: session.id,
    patientId: session.patientId,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    messages: session.messages
  };
}

export async function handlePatientMessage(sessionId: string, deviceId: string, messageText: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true, messages: true }
  });

  if (!session || session.patient.deviceId !== deviceId) {
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

export async function resolveSession(sessionId: string, deviceId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true }
  });

  if (!session || session.patient.deviceId !== deviceId) {
    throw new AppError(404, "Session not found");
  }

  validateTransition(session.status as AiSessionStatus, "resolved");

  const resolvedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.aiSession.update({
      where: { id: sessionId },
      data: {
        status: "resolved",
        endedAt: new Date(),
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

    return updated;
  });

  return resolvedSession;
}

export async function acknowledgeEmergency(sessionId: string, deviceId: string, action: "call_initiated" | "dismissed") {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true }
  });

  if (!session || session.patient.deviceId !== deviceId) {
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

export async function listCaregiverSessions(patientId: string, caregiverId: string, query: { status?: string, from?: string, to?: string }) {
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
    include: { _count: { select: { messages: true } } }
  });

  return sessions.map(s => ({
    id: s.id,
    patientId: s.patientId,
    helpEventId: s.helpEventId,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    summary: s.summary,
    messageCount: s._count.messages
  }));
}

export async function getCaregiverSession(sessionId: string, caregiverId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true, messages: { orderBy: { createdAt: 'asc' } } }
  });

  if (!session || session.patient.caregiverId !== caregiverId) {
    throw new AppError(404, "Session not found");
  }

  return session;
}

export async function caregiverJoinSession(sessionId: string, caregiverId: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { patient: true }
  });

  if (!session || session.patient.caregiverId !== caregiverId) {
    throw new AppError(404, "Session not found");
  }

  validateTransition(session.status as AiSessionStatus, "caregiver_joined");

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

  validateTransition(session.status as AiSessionStatus, "resolved");

  const updatedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.aiSession.update({
      where: { id: sessionId },
      data: {
        status: "resolved",
        endedAt: new Date(),
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

    return updated;
  });

  return updatedSession;
}
