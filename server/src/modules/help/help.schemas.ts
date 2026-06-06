import { z } from "zod";

export const HELP_SOURCE_DEVICES = ["phone", "watch", "system"] as const;
export const HELP_EVENT_STATUSES = [
  "triggered",
  "whatsapp_opened",
  "failed",
  "cancelled",
] as const;

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const whatsappNumberSchema = z
  .string()
  .trim()
  .regex(E164_REGEX, "whatsappNumber must be in E.164 format (e.g. +18185550123)");

export const createHelpContactSchema = z.object({
  whatsappNumber: whatsappNumberSchema,
  label: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

export const createHelpEventMobileSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  sourceDevice: z.enum(HELP_SOURCE_DEVICES),
  status: z.enum(HELP_EVENT_STATUSES),
  triggeredAt: z.coerce.date().optional(),
  whatsappNumber: whatsappNumberSchema.optional(),
});

export const listHelpEventsQuerySchema = z.object({
  sourceDevice: z.enum(HELP_SOURCE_DEVICES).optional(),
  status: z.enum(HELP_EVENT_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const mobileHelpContactQuerySchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
});

export type CreateHelpContactInput = z.infer<typeof createHelpContactSchema>;
export type CreateHelpEventMobileInput = z.infer<typeof createHelpEventMobileSchema>;
export type ListHelpEventsQuery = z.infer<typeof listHelpEventsQuerySchema>;
export type MobileHelpContactQuery = z.infer<typeof mobileHelpContactQuerySchema>;
