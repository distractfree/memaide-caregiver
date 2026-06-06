import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type { ListReminderEventsQuery } from "./reminder-event.schemas";

async function assertPatientOwnership(caregiverId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return patient;
}

export async function listReminderEvents(
  caregiverId: string,
  patientId: string,
  query: ListReminderEventsQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  return prisma.reminderEvent.findMany({
    where: {
      patientId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sourceDevice ? { sourceDevice: query.sourceDevice } : {}),
      ...(query.reminderId ? { reminderId: query.reminderId } : {}),
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
        select: {
          id: true,
          type: true,
          description: true,
          timeOfDay: true,
          frequency: true,
        },
      },
    },
    orderBy: { scheduledAt: "desc" },
  });
}
