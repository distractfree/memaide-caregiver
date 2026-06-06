import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type {
  CreateReminderInput,
  UpdateReminderInput,
  ListRemindersQuery,
} from "./reminder.schemas";

async function assertPatientOwnership(caregiverId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return patient;
}

async function assertReminderOwnership(caregiverId: string, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, patient: { caregiverId } },
  });
  if (!reminder) {
    throw new AppError(404, "Reminder not found", "NOT_FOUND");
  }
  return reminder;
}

export async function listReminders(
  caregiverId: string,
  patientId: string,
  query: ListRemindersQuery
) {
  await assertPatientOwnership(caregiverId, patientId);

  return prisma.reminder.findMany({
    where: {
      patientId,
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
    orderBy: [{ timeOfDay: "asc" }, { createdAt: "asc" }],
  });
}

export async function createReminder(
  caregiverId: string,
  patientId: string,
  input: CreateReminderInput
) {
  await assertPatientOwnership(caregiverId, patientId);
  return prisma.reminder.create({
    data: { ...input, patientId },
  });
}

export async function updateReminder(
  caregiverId: string,
  reminderId: string,
  input: UpdateReminderInput
) {
  await assertReminderOwnership(caregiverId, reminderId);
  return prisma.reminder.update({
    where: { id: reminderId },
    data: input,
  });
}

export async function deleteReminder(caregiverId: string, reminderId: string) {
  await assertReminderOwnership(caregiverId, reminderId);
  await prisma.reminder.delete({ where: { id: reminderId } });
}
