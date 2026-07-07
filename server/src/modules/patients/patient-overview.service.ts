import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";

type CardStatus = "normal" | "attention" | "urgent" | "empty";
type AttentionSeverity = "info" | "warning" | "urgent";
type TimelineType = "reminder" | "location" | "wellness" | "help" | "stream";

interface SummaryCard {
  key: "reminders" | "location" | "wellness" | "help";
  label: string;
  value: string;
  status: CardStatus;
  detail: string;
}

interface AttentionItem {
  severity: AttentionSeverity;
  message: string;
}

interface TimelineItem {
  id: string;
  type: TimelineType;
  title: string;
  detail: string;
  timestamp: string;
}

const STALE_BEACON_MS = 3 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithin(date: Date | string | null | undefined, start: Date, end: Date): boolean {
  const parsed = toDate(date);
  return parsed !== null && parsed >= start && parsed < end;
}

function formatTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "unknown time";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatWords(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildReminderTimelineTitle(status: string, type?: string): string {
  const label = formatWords(type) || "Reminder";
  if (status === "acknowledged") return `${label} reminder acknowledged`;
  if (status === "missed") return `${label} reminder missed`;
  if (status === "delivered") return `${label} reminder delivered`;
  return `${label} reminder scheduled`;
}

function buildHelpTitle(status: string): string {
  if (status === "triggered" || status === "active") return "Help request logged";
  if (status === "whatsapp_opened") return "Help button opened WhatsApp";
  if (status === "failed") return "Help event needs attention";
  if (status === "cancelled") return "Help event cancelled";
  return "Help event recorded";
}

function buildStreamTimestamp(session: {
  updatedAt: Date;
  startedAt: Date | null;
  createdAt: Date;
}): string {
  return (session.updatedAt ?? session.startedAt ?? session.createdAt).toISOString();
}

export async function getPatientOverview(caregiverId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
    select: { id: true, name: true },
  });

  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  const [
    todayReminderEvents,
    recentReminderEvents,
    recentBeaconEvents,
    recentVitalEvents,
    todayHelpEvents,
    recentHelpEvents,
    recentStreamSessions,
  ] = await Promise.all([
    prisma.reminderEvent.findMany({
      where: {
        patientId,
        scheduledAt: { gte: todayStart, lt: tomorrowStart },
      },
      include: {
        reminder: {
          select: { id: true, type: true, description: true, timeOfDay: true, frequency: true },
        },
      },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.reminderEvent.findMany({
      where: { patientId },
      include: {
        reminder: {
          select: { id: true, type: true, description: true, timeOfDay: true, frequency: true },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 10,
    }),
    prisma.beaconEvent.findMany({
      where: { patientId },
      orderBy: { detectedAt: "desc" },
      take: 10,
    }),
    prisma.vitalEvent.findMany({
      where: { patientId },
      orderBy: { timestamp: "desc" },
      take: 10,
    }),
    prisma.helpEvent.findMany({
      where: {
        patientId,
        triggeredAt: { gte: todayStart, lt: tomorrowStart },
      },
      orderBy: { triggeredAt: "desc" },
    }),
    prisma.helpEvent.findMany({
      where: { patientId },
      orderBy: { triggeredAt: "desc" },
      take: 10,
    }),
    prisma.streamSession.findMany({
      where: { patientId },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const attentionItems: AttentionItem[] = [];
  const summaryCards: SummaryCard[] = [];

  const acknowledgedCount = todayReminderEvents.filter(
    (event) => event.status === "acknowledged" || event.acknowledgedAt !== null
  ).length;
  const missedCount = todayReminderEvents.filter((event) => event.status === "missed").length;

  if (missedCount > 0) {
    attentionItems.push({
      severity: "warning",
      message: `${pluralize(missedCount, "missed reminder")} today`,
    });
  }

  summaryCards.push({
    key: "reminders",
    label: "Reminders",
    value:
      todayReminderEvents.length > 0
        ? `${acknowledgedCount} acknowledged / ${missedCount} missed`
        : "No reminder events today",
    status: missedCount > 0 ? "attention" : todayReminderEvents.length > 0 ? "normal" : "empty",
    detail:
      missedCount > 0
        ? `${pluralize(missedCount, "reminder")} needs attention today`
        : todayReminderEvents.length > 0
          ? `${pluralize(todayReminderEvents.length, "reminder update")} today`
          : "No reminder update yet today",
  });

  const latestBeaconEvent = recentBeaconEvents[0];
  if (latestBeaconEvent) {
    const detectedAt = toDate(latestBeaconEvent.detectedAt);
    const isStale = detectedAt ? now.getTime() - detectedAt.getTime() > STALE_BEACON_MS : false;

    summaryCards.push({
      key: "location",
      label: "Last Known Room",
      value: `${latestBeaconEvent.roomName} / ${formatTime(latestBeaconEvent.detectedAt)}`,
      status: "normal",
      detail: isStale ? "Latest room update is older than 3 hours" : "Latest room update",
    });
  } else {
    summaryCards.push({
      key: "location",
      label: "Last Known Room",
      value: "No room update yet",
      status: "empty",
      detail: "No beacon activity recorded",
    });
  }

  const latestVitalEvent = recentVitalEvents[0];
  const hasWellnessToday =
    latestVitalEvent !== undefined && isWithin(latestVitalEvent.timestamp, todayStart, tomorrowStart);

  if (latestVitalEvent) {
    const vitalParts = [
      latestVitalEvent.heartRate !== null ? `${latestVitalEvent.heartRate} bpm` : null,
      latestVitalEvent.motionState ? formatWords(latestVitalEvent.motionState) : null,
    ].filter(Boolean);

    summaryCards.push({
      key: "wellness",
      label: "Wellness",
      value: vitalParts.length > 0 ? vitalParts.join(" / ") : "Wellness sample received",
      status: hasWellnessToday ? "normal" : "empty",
      detail: hasWellnessToday
        ? "Latest wellness/activity update"
        : `No wellness update today. Latest update was ${formatTime(latestVitalEvent.timestamp)}`,
    });
  } else {
    summaryCards.push({
      key: "wellness",
      label: "Wellness",
      value: "No wellness update today",
      status: "empty",
      detail: "No wellness/activity update recorded today",
    });
  }

  const urgentHelpEventToday = todayHelpEvents.find(
    (event) => event.status === "triggered" || event.status === "active"
  );
  const failedHelpEventToday = todayHelpEvents.find((event) => event.status === "failed");
  const displayHelpEventToday = urgentHelpEventToday ?? failedHelpEventToday ?? todayHelpEvents[0];
  if (displayHelpEventToday) {
    if (urgentHelpEventToday) {
      attentionItems.push({
        severity: "urgent",
        message: "A help event was triggered today.",
      });
    } else if (failedHelpEventToday) {
      attentionItems.push({
        severity: "warning",
        message: "A help event needs attention today.",
      });
    }

    summaryCards.push({
      key: "help",
      label: "Help Events",
      value: urgentHelpEventToday ? "Help event triggered" : buildHelpTitle(displayHelpEventToday.status),
      status: urgentHelpEventToday ? "urgent" : failedHelpEventToday ? "attention" : "normal",
      detail: `Latest update ${formatTime(displayHelpEventToday.triggeredAt)}`,
    });
  } else {
    summaryCards.push({
      key: "help",
      label: "Help Events",
      value: "No help request today",
      status: "normal",
      detail: "No urgent help event found",
    });
  }

  const activeStreamSession = recentStreamSessions.find(
    (session) => session.status === "active" || session.status === "starting"
  );
  if (activeStreamSession) {
    attentionItems.push({
      severity: "warning",
      message: "Active stream session available for caregiver review.",
    });
  }

  const timeline: TimelineItem[] = [
    ...recentReminderEvents.map((event) => ({
      id: event.id,
      type: "reminder" as const,
      title: buildReminderTimelineTitle(event.status, event.reminder?.type),
      detail: `Source: ${event.sourceDevice}`,
      timestamp: event.scheduledAt.toISOString(),
    })),
    ...recentBeaconEvents.map((event) => ({
      id: event.id,
      type: "location" as const,
      title: `Room update: ${event.roomName}`,
      detail: `Source: ${event.sourceDevice}`,
      timestamp: event.detectedAt.toISOString(),
    })),
    ...recentVitalEvents.map((event) => {
      const detailParts = [
        event.heartRate !== null ? `${event.heartRate} bpm` : null,
        event.motionState ? formatWords(event.motionState) : null,
        `Source: ${event.sourceDevice}`,
      ].filter(Boolean);

      return {
        id: event.id,
        type: "wellness" as const,
        title: "Wellness/activity update",
        detail: detailParts.join(" / "),
        timestamp: event.timestamp.toISOString(),
      };
    }),
    ...recentHelpEvents.map((event) => ({
      id: event.id,
      type: "help" as const,
      title: buildHelpTitle(event.status),
      detail: `Source: ${event.sourceDevice}`,
      timestamp: event.triggeredAt.toISOString(),
    })),
    ...recentStreamSessions.map((session) => ({
      id: session.id,
      type: "stream" as const,
      title: "Stream status updated",
      detail: `Status: ${formatWords(session.status)}`,
      timestamp: buildStreamTimestamp(session),
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return {
    patientId: patient.id,
    patientName: patient.name,
    generatedAt: now.toISOString(),
    summaryCards,
    attentionItems,
    timeline,
  };
}
