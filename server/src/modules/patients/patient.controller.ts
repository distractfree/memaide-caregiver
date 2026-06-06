import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
} from "./patient.schemas";
import * as patientService from "./patient.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listPatientsQuerySchema.parse(req.query);
  const result = await patientService.listPatients(req.caregiverId!, query);
  res.status(200).json({
    success: true,
    data: result.patients,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = createPatientSchema.parse(req.body);
  const patient = await patientService.createPatient(req.caregiverId!, input);
  res.status(201).json({ success: true, data: patient });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const patient = await patientService.getPatientById(req.caregiverId!, req.params.id);
  res.status(200).json({ success: true, data: patient });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = updatePatientSchema.parse(req.body);
  const patient = await patientService.updatePatient(
    req.caregiverId!,
    req.params.id,
    input
  );
  res.status(200).json({ success: true, data: patient });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await patientService.deletePatient(req.caregiverId!, req.params.id);
  res.status(200).json({ success: true, data: null });
});
