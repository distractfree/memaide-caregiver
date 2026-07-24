import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { resolveMobilePatient } from "../patients/patient.service";
import { signPatientToken, type MobileActor } from "./mobile-auth.service";
import type {
  MobileRemindersInput,
  MobileReminderEventInput,
  PatientLoginInput,
} from "./mobile.schemas";

/**
 * One generic public failure for every unusable login outcome.
 *
 * The same response is returned whether the number matched no patient, matched
 * more than one, or matched an unusable record, so a caller can never probe
 * which phone numbers are registered.
 */
function patientLoginUnavailable() {
  return new AppError(
    404,
    "Unable to sign in with the provided information.",
    "PATIENT_LOGIN_NOT_AVAILABLE"
  );
}

/**
 * Resolves a patient from their own phone number and issues a patient-scoped
 * session token.
 *
 * `Patient.phoneNumber` is nullable and not unique, so this deliberately reads
 * up to two rows and refuses to proceed unless exactly one matched. `findFirst`
 * must never be used here: duplicate numbers would otherwise silently sign a
 * token for whichever patient happened to sort first.
 *
 * Nothing about the caller — phone number, patient name, caregiver, or token —
 * is logged.
 */
export async function loginPatientByPhoneNumber(input: PatientLoginInput) {
  const matches = await prisma.patient.findMany({
    where: { phoneNumber: input.phoneNumber },
    take: 2,
    select: { id: true },
  });

  if (matches.length !== 1) {
    throw patientLoginUnavailable();
  }

  const patient = matches[0];
  if (!patient?.id) {
    throw patientLoginUnavailable();
  }

  return {
    token: signPatientToken(patient.id),
    patient: { id: patient.id },
  };
}

export async function getMobileReminders(
  actor: MobileActor,
  query: MobileRemindersInput
) {
  const patient = await resolveMobilePatient(actor, query.deviceId);

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
  actor: MobileActor,
  input: MobileReminderEventInput
) {
  const patient = await resolveMobilePatient(actor, input.deviceId);

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
