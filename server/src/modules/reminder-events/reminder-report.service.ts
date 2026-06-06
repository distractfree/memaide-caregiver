import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type { ReminderReportQuery } from "./reminder-event.schemas";

export async function getReminderReport(
  caregiverId: string,
  patientId: string,
  query: ReminderReportQuery
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }

  const events = await prisma.reminderEvent.findMany({
    where: {
      patientId,
      ...((query.from || query.to)
        ? {
            scheduledAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    },
    include: {
      reminder: {
        select: { id: true, type: true, description: true },
      },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const totalScheduled = events.length;
  const totalDelivered = events.filter((e) => e.deliveredAt !== null).length;
  const totalAcknowledged = events.filter((e) => e.status === "acknowledged").length;
  const totalMissed = events.filter((e) => e.status === "missed").length;

  const acknowledgedWithTimes = events.filter(
    (e) => e.status === "acknowledged" && e.deliveredAt && e.acknowledgedAt
  );
  const totalTimeToAckSeconds = acknowledgedWithTimes.reduce((sum, e) => {
    const diffMs = e.acknowledgedAt!.getTime() - e.deliveredAt!.getTime();
    return sum + Math.max(0, diffMs / 1000);
  }, 0);
  const averageTimeToAcknowledgeSeconds =
    acknowledgedWithTimes.length > 0
      ? Math.round(totalTimeToAckSeconds / acknowledgedWithTimes.length)
      : null;

  const acknowledgmentRate = totalScheduled > 0 ? totalAcknowledged / totalScheduled : 0;
  const missedRate = totalScheduled > 0 ? totalMissed / totalScheduled : 0;

  const countsBySourceDevice: Record<string, number> = {};
  const countsByStatus: Record<string, number> = {};
  for (const e of events) {
    countsBySourceDevice[e.sourceDevice] =
      (countsBySourceDevice[e.sourceDevice] ?? 0) + 1;
    countsByStatus[e.status] = (countsByStatus[e.status] ?? 0) + 1;
  }

  const eventRows = events.map((e) => ({
    id: e.id,
    reminderId: e.reminderId,
    reminderDescription: e.reminder.description,
    reminderType: e.reminder.type,
    scheduledAt: e.scheduledAt,
    deliveredAt: e.deliveredAt,
    acknowledgedAt: e.acknowledgedAt,
    status: e.status,
    sourceDevice: e.sourceDevice,
    timeToAcknowledgeSeconds:
      e.deliveredAt && e.acknowledgedAt
        ? Math.max(
            0,
            Math.round(
              (e.acknowledgedAt.getTime() - e.deliveredAt.getTime()) / 1000
            )
          )
        : null,
  }));

  return {
    summary: {
      totalScheduled,
      totalDelivered,
      totalAcknowledged,
      totalMissed,
      averageTimeToAcknowledgeSeconds,
      acknowledgmentRate,
      missedRate,
      countsBySourceDevice,
      countsByStatus,
    },
    events: eventRows,
  };
}
