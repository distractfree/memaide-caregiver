import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import { findPatientForCaregiverDevice } from "../patients/patient.service";
import type {
  CreateHelpContactInput,
  CreateHelpEventMobileInput,
  ListHelpEventsQuery,
  MobileHelpContactQuery,
} from "./help.schemas";

async function verifyPatientOwnership(patientId: string, caregiverId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return patient;
}

export async function getHelpContact(patientId: string, caregiverId: string) {
  await verifyPatientOwnership(patientId, caregiverId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).helpContact.findFirst({
    where: { patientId, active: true },
    select: {
      id: true,
      patientId: true,
      whatsappNumber: true,
      label: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function upsertHelpContact(
  patientId: string,
  caregiverId: string,
  input: CreateHelpContactInput
) {
  await verifyPatientOwnership(patientId, caregiverId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hc = (prisma as any).helpContact;

  const existing = await hc.findFirst({
    where: { patientId },
    select: { id: true },
  });

  const data = {
    whatsappNumber: input.whatsappNumber,
    label: input.label ?? "Primary caregiver",
    active: input.active ?? true,
  };

  if (existing) {
    return hc.update({ where: { id: existing.id }, data });
  }

  return hc.create({ data: { patientId, ...data } });
}

export async function listHelpEvents(
  patientId: string,
  caregiverId: string,
  query: ListHelpEventsQuery
) {
  await verifyPatientOwnership(patientId, caregiverId);

  const triggeredAtFilter: { gte?: Date; lte?: Date } = {};
  if (query.from) triggeredAtFilter.gte = query.from;
  if (query.to) triggeredAtFilter.lte = query.to;

  const where: {
    patientId: string;
    sourceDevice?: string;
    status?: string;
    triggeredAt?: { gte?: Date; lte?: Date };
  } = { patientId };

  if (query.sourceDevice) where.sourceDevice = query.sourceDevice;
  if (query.status) where.status = query.status;
  if (Object.keys(triggeredAtFilter).length > 0) {
    where.triggeredAt = triggeredAtFilter;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).helpEvent.findMany({
    where,
    select: {
      id: true,
      patientId: true,
      triggeredAt: true,
      sourceDevice: true,
      whatsappNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      aiSessions: {
        select: {
          id: true,
          status: true,
        }
      }
    },
    orderBy: { triggeredAt: "desc" },
  });
}

export async function getMobileHelpContact(
  caregiverId: string,
  query: MobileHelpContactQuery
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    query.deviceId
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const helpContact = await (prisma as any).helpContact.findFirst({
    where: { patientId: patient.id, active: true },
    select: {
      id: true,
      whatsappNumber: true,
      label: true,
      active: true,
    },
  });

  if (!helpContact) {
    throw new AppError(
      404,
      "No active help contact configured for this patient",
      "NOT_FOUND"
    );
  }

  return { patient, helpContact };
}

export async function createMobileHelpEvent(
  caregiverId: string,
  input: CreateHelpEventMobileInput
) {
  const patient = await findPatientForCaregiverDevice(
    caregiverId,
    input.deviceId
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hc = (prisma as any).helpContact;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const he = (prisma as any).helpEvent;

  let whatsappNumber = input.whatsappNumber;
  if (!whatsappNumber) {
    const contact = await hc.findFirst({
      where: { patientId: patient.id, active: true },
      select: { whatsappNumber: true },
    });
    if (!contact) {
      throw new AppError(
        400,
        "No whatsappNumber provided and no active help contact configured",
        "NO_HELP_CONTACT"
      );
    }
    whatsappNumber = contact.whatsappNumber;
  }

  const newEvent = await he.create({
    data: {
      patientId: patient.id,
      triggeredAt: input.triggeredAt ?? new Date(),
      sourceDevice: input.sourceDevice,
      whatsappNumber,
      status: input.status,
    },
  });



  return newEvent;
}
