import { z } from "zod";

export const mobileRemindersQuerySchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
});

export type MobileRemindersQuery = z.infer<typeof mobileRemindersQuerySchema>;
