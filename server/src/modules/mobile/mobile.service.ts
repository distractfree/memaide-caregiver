import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type { MobileRemindersQuery } from "./mobile.schemas";
import type { CreateReminderEventInput } from "../reminder-events/reminder-event.schemas";

export async function getMobileReminders(query: MobileRemindersQuery) {
  const patient = await prisma.patient.findUnique({
    where: { deviceId: query.deviceId },
    select: { id: true, name: true, deviceId: true },
  });
  if (!patient) {
    throw new AppError(404, "No patient found for this device", "NOT_FOUND");
  }

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

export async function createMobileReminderEvent(input: CreateReminderEventInput) {
  const patient = await prisma.patient.findUnique({
    where: { deviceId: input.deviceId },
    select: { id: true },
  });
  if (!patient) {
    throw new AppError(404, "No patient found for this device", "NOT_FOUND");
  }

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
