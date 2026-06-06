import { z } from "zod";

export const createReminderSchema = z.object({
  type: z.string().trim().min(1, "Type is required").max(50),
  description: z.string().trim().min(1, "Description is required").max(500),
  timeOfDay: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, "timeOfDay must be HH:mm format"),
  frequency: z.string().trim().min(1, "Frequency is required").max(50),
  active: z.boolean().optional(),
});

export const updateReminderSchema = createReminderSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const listRemindersQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  type: z.string().trim().optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
