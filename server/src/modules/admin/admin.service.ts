import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { AppError } from "../../middleware/error.middleware";
import { computeJoinability } from "../ai-sessions/ai-session.lifecycle";
import type { AdminLoginInput } from "./admin.schemas";

function signAdminToken(): string {
  // jsonwebtoken accepts values like "8h", but its TypeScript type is stricter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ type: "admin", role: "admin" }, env.ADMIN_JWT_SECRET, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN as any,
  });
}

export async function loginAdmin(
  input: AdminLoginInput
): Promise<{ token: string; admin: { role: string } }> {
  if (!env.ADMIN_PASSWORD) {
    throw new AppError(500, "Admin login is not configured", "SERVER_CONFIG_ERROR");
  }

  if (input.password !== env.ADMIN_PASSWORD) {
    throw new AppError(401, "Invalid admin password", "INVALID_CREDENTIALS");
  }

  return { token: signAdminToken(), admin: { role: "admin" } };
}

export async function getCaregivers() {
  const caregivers = await prisma.caregiver.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      _count: {
        select: { patients: true }
      }
    }
  });

  return caregivers.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    status: "Enabled",
    lastLoginAt: null,
    patientCount: c._count.patients,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));
}

export async function getCaregiverById(id: string) {
  const caregiver = await prisma.caregiver.findUnique({
    where: { id },
    include: {
      patients: true
    }
  });

  if (!caregiver) {
    throw new AppError(404, "Caregiver not found", "NOT_FOUND");
  }

  return {
    id: caregiver.id,
    name: caregiver.name,
    email: caregiver.email,
    status: "Enabled",
    lastLoginAt: null,
    createdAt: caregiver.createdAt,
    updatedAt: caregiver.updatedAt,
    patients: caregiver.patients.map(p => ({
      id: p.id,
      name: p.name,
      deviceId: p.deviceId,
      phoneNumber: p.phoneNumber,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }))
  };
}

export async function getAiSessions(query: any) {
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const sessions = await prisma.aiSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      patient: {
        include: { caregiver: true }
      },
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    }
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
      patientName: s.patient.name,
      caregiverName: s.patient.caregiver.name,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      messageCount: s._count.messages,
      isJoinable: joinability.isJoinable,
      joinabilityReason: joinability.joinabilityReason,
      displayStatus: joinability.displayStatus,
      lastActivityAt: joinability.lastActivityAt,
    };
  });
}

export async function getAiSessionById(id: string) {
  const session = await prisma.aiSession.findUnique({
    where: { id },
    include: {
      patient: {
        include: { caregiver: true }
      },
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!session) {
    throw new AppError(404, "Session not found", "NOT_FOUND");
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
    id: session.id,
    patientId: session.patientId,
    patientName: session.patient.name,
    caregiverName: session.patient.caregiver.name,
    helpEventId: session.helpEventId,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    caregiverJoinedAt: session.caregiverJoinedAt,
    emergencySuggestedAt: session.emergencySuggestedAt,
    summary: session.summary,
    messages: session.messages,
    isJoinable: joinability.isJoinable,
    joinabilityReason: joinability.joinabilityReason,
    displayStatus: joinability.displayStatus,
    lastActivityAt: joinability.lastActivityAt,
  };
}
