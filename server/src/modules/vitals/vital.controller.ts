import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  createVitalEventMobileSchema,
  listVitalsQuerySchema,
  vitalsReportQuerySchema,
} from "./vital.schemas";
import * as vitalService from "./vital.service";

const VITALS_POSITIONING_NOTE =
  "Wellness data is best-effort and intended for care coordination only.";

export const createMobileVitalEvent = asyncHandler(
  async (req: Request, res: Response) => {
    const input = createVitalEventMobileSchema.parse(req.body);
    const event = await vitalService.createMobileVitalEvent(
      { actorType: "caregiver", caregiverId: req.caregiverId! },
      input
    );
    res.status(201).json({ success: true, data: event });
  }
);

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listVitalsQuerySchema.parse(req.query);
  const events = await vitalService.listVitals(
    req.caregiverId!,
    req.params.patientId,
    query
  );

  res.status(200).json({
    success: true,
    data: events,
    notes: {
      positioning: VITALS_POSITIONING_NOTE,
    },
  });
});

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const query = vitalsReportQuerySchema.parse(req.query);
  const report = await vitalService.getVitalsReport(
    req.caregiverId!,
    req.params.patientId,
    query
  );

  res.status(200).json({ success: true, data: report });
});
