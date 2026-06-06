import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  createReminderSchema,
  updateReminderSchema,
  listRemindersQuerySchema,
} from "./reminder.schemas";
import * as reminderService from "./reminder.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listRemindersQuerySchema.parse(req.query);
  const reminders = await reminderService.listReminders(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: reminders });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = createReminderSchema.parse(req.body);
  const reminder = await reminderService.createReminder(
    req.caregiverId!,
    req.params.patientId,
    input
  );
  res.status(201).json({ success: true, data: reminder });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = updateReminderSchema.parse(req.body);
  const reminder = await reminderService.updateReminder(
    req.caregiverId!,
    req.params.id,
    input
  );
  res.status(200).json({ success: true, data: reminder });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await reminderService.deleteReminder(req.caregiverId!, req.params.id);
  res.status(200).json({ success: true, data: null });
});
