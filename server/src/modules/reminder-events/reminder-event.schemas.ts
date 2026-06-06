import { z } from "zod";

export const REMINDER_EVENT_STATUSES = [
  "scheduled",
  "delivered",
  "acknowledged",
  "missed",
] as const;

export const REMINDER_EVENT_SOURCE_DEVICES = [
  "phone",
  "watch",
  "system",
] as const;

export const createReminderEventSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  reminderId: z.string().trim().min(1, "reminderId is required"),
  scheduledAt: z.coerce.date(),
  deliveredAt: z.coerce.date().optional(),
  acknowledgedAt: z.coerce.date().optional(),
  status: z.enum(REMINDER_EVENT_STATUSES),
  sourceDevice: z.enum(REMINDER_EVENT_SOURCE_DEVICES),
});

export const listReminderEventsQuerySchema = z.object({
  status: z.enum(REMINDER_EVENT_STATUSES).optional(),
  sourceDevice: z.enum(REMINDER_EVENT_SOURCE_DEVICES).optional(),
  reminderId: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const reminderReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateReminderEventInput = z.infer<typeof createReminderEventSchema>;
export type ListReminderEventsQuery = z.infer<typeof listReminderEventsQuerySchema>;
export type ReminderReportQuery = z.infer<typeof reminderReportQuerySchema>;
