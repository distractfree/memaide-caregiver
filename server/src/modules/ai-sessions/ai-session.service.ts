import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { SCRIPTED_MESSAGES, determineNextAiMessage } from "./ai-session.messages";
import { validateTransition, AiSessionStatus } from "./ai-session.state-machine";
export async function startAiSession(data: { deviceId: string, helpEventId?: string, sourceDevice?: string }) {
  // Find the patient by device id.
  const patient = await prisma.patient.findUnique({
    where: { deviceId: data.deviceId },
  });

  if (!patient) {
    throw new AppError(404, "Patient not found for this device");
  }

  // Check the help event if one was sent.
  if (data.helpEventId) {
    const helpEvent = await prisma.helpEvent.findUnique({
      where: { id: data.helpEventId },
    });
    if (!helpEvent || helpEvent.patientId !== patient.id) {
      throw new AppError(404, "Help event not found or does not belong to this patient");
    }
  }

  // Create the session with its first messages.
  const session = await prisma.aiSession.create({
    data: {
      patientId: patient.id,
      helpEventId: data.helpEventId || null,
      status: "active",
      messages: {
        create: [
          { senderType: "system", message: SCRIPTED_MESSAGES.system.started },
          { senderType: "ai", message: SCRIPTED_MESSAGES.ai.greeting },
          { senderType: "ai", message: SCRIPTED_MESSAGES.ai.promptWhatHappened },
        ]
      }
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });

  return {
    id: session.id,
    patientId: session.patientId,
    helpEventId: session.helpEventId,
    status: session.status,
    startedAt: session.startedAt,
    initialMessages: session.messages
  };
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

  if (session.status === "resolved" || session.status === "cancelled" || session.status === "error") {
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
