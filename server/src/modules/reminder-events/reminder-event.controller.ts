import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  listReminderEventsQuerySchema,
  reminderReportQuerySchema,
} from "./reminder-event.schemas";
import * as reminderEventService from "./reminder-event.service";
import * as reminderReportService from "./reminder-report.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listReminderEventsQuerySchema.parse(req.query);
  const events = await reminderEventService.listReminderEvents(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: events });
});

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const query = reminderReportQuerySchema.parse(req.query);
  const report = await reminderReportService.getReminderReport(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: report });
});
