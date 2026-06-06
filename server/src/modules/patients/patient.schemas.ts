import { z } from "zod";

export const createPatientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phoneNumber: z.string().trim().max(30).optional(),
  deviceId: z.string().trim().max(100).optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export const listPatientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
