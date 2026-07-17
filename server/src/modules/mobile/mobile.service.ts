import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { findPatientForCaregiverDevice } from "../patients/patient.service";
import type { MobileRemindersQuery } from "./mobile.schemas";
import type { CreateReminderEventInput } from "../reminder-events/reminder-event.schemas";

export async function getMobileReminders(
  caregiverId: string,
  query: MobileRemindersQuery
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    query.deviceId
  );

  const reminders = await prisma.reminder.findMany({
    where: { patientId: patient.id, active: true },
    select: {
      id: true,
      type: true,
      description: true,
      timeOfDay: true,
      frequency: true,
      active: true,
    },
    orderBy: { timeOfDay: "asc" },
  });

  return { patient, reminders };
}

export async function createMobileReminderEvent(
  caregiverId: string,
  input: CreateReminderEventInput
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    input.deviceId
  );

  const reminder = await prisma.reminder.findFirst({
    where: { id: input.reminderId, patientId: patient.id },
    select: { id: true },
  });
  if (!reminder) {
    throw new AppError(404, "Reminder not found for this patient", "NOT_FOUND");
  }

  const now = new Date();
  let { deliveredAt, acknowledgedAt } = input;

  if (input.status === "delivered" && !deliveredAt) {
    deliveredAt = now;
  }
  if (input.status === "acknowledged") {
    if (!deliveredAt) deliveredAt = now;
    if (!acknowledgedAt) acknowledgedAt = now;
  }

  return prisma.reminderEvent.create({
    data: {
      reminderId: reminder.id,
      patientId: patient.id,
      scheduledAt: input.scheduledAt,
      deliveredAt: deliveredAt ?? null,
      acknowledgedAt: acknowledgedAt ?? null,
      status: input.status,
      sourceDevice: input.sourceDevice,
    },
  });
}
