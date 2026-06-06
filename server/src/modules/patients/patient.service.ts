import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/error.middleware";
import type { CreatePatientInput, UpdatePatientInput, ListPatientsQuery } from "./patient.schemas";

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
