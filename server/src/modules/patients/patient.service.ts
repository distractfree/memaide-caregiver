import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type { CreatePatientInput, UpdatePatientInput, ListPatientsQuery } from "./patient.schemas";
import type { MobileActor } from "../mobile/mobile-auth.service";
export { getPatientOverview } from "./patient-overview.service";

export async function listPatients(caregiverId: string, query: ListPatientsQuery) {
  const { search, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PatientWhereInput = { caregiverId };
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.patient.count({ where }),
  ]);

  return {
    patients,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function listMobilePatients(caregiverId: string) {
  const patients = await prisma.patient.findMany({
    where: { caregiverId },
    select: { id: true, name: true, deviceId: true },
    orderBy: { createdAt: "desc" },
  });

  return patients.map(({ id, name, deviceId }) => ({ id, name, deviceId }));
}

/**
 * Resolves a device only inside the authenticated caregiver's patient set.
 * Keep this lookup scoped in the database so callers never learn whether a
 * device belongs to a different caregiver.
 */
export async function findPatientForCaregiverDevice(
  caregiverId: string,
  deviceId: string
) {
  const patient = await prisma.patient.findFirst({
    where: { caregiverId, deviceId },
    select: { id: true, name: true, deviceId: true },
  });

  if (!patient) {
    throw new AppError(404, "No patient found for this device", "NOT_FOUND");
  }

  return patient;
}

/**
 * Single resolution path for every authenticated mobile route.
 *
 * Caregiver actors keep the existing `caregiverId + deviceId` ownership check
 * unchanged. Patient actors resolve straight from the verified token subject —
 * a client-supplied `deviceId` is never consulted for a patient actor, so
 * "Patient A's token + Patient B's deviceId" can never reach Patient B.
 *
 * A missing patient is reported with the same generic message used by the
 * caregiver device lookup, so a caller never learns whether the id exists.
 */
export async function resolveMobilePatient(
  actor: MobileActor,
  deviceId?: string
) {
  if (actor.actorType === "patient") {
    const patient = await prisma.patient.findUnique({
      where: { id: actor.patientId },
      select: { id: true, name: true, deviceId: true },
    });

    if (!patient) {
      throw new AppError(404, "No patient found for this device", "NOT_FOUND");
    }

    return patient;
  }

  // Caregiver actors must still identify the patient by device. Mobile request
  // schemas already require `deviceId` for caregiver tokens, so this guard only
  // backstops a caller that bypasses validation.
  if (!deviceId) {
    throw new AppError(400, "deviceId is required", "VALIDATION_ERROR");
  }

  return findPatientForCaregiverDevice(actor.caregiverId, deviceId);
}

export async function createPatient(caregiverId: string, input: CreatePatientInput) {
  return prisma.patient.create({
    data: { ...input, caregiverId },
  });
}

export async function getPatientById(caregiverId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return patient;
}

export async function updatePatient(
  caregiverId: string,
  patientId: string,
  input: UpdatePatientInput
) {
  const existing = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!existing) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  return prisma.patient.update({
    where: { id: patientId },
    data: input,
  });
}

export async function deletePatient(caregiverId: string, patientId: string) {
  const existing = await prisma.patient.findFirst({
    where: { id: patientId, caregiverId },
  });
  if (!existing) {
    throw new AppError(404, "Patient not found", "NOT_FOUND");
  }
  await prisma.patient.delete({ where: { id: patientId } });
}
