import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  createHelpContactSchema,
  listHelpEventsQuerySchema,
} from "./help.schemas";
import * as helpService from "./help.service";

export const getHelpContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await helpService.getHelpContact(
    req.params.patientId,
    req.caregiverId!
  );
  res.status(200).json({ success: true, data: contact });
});

export const upsertHelpContact = asyncHandler(async (req: Request, res: Response) => {
  const input = createHelpContactSchema.parse(req.body);
  const contact = await helpService.upsertHelpContact(
    req.params.patientId,
    req.caregiverId!,
    input
  );
  res.status(200).json({ success: true, data: contact });
});

export const listHelpEvents = asyncHandler(async (req: Request, res: Response) => {
  const query = listHelpEventsQuerySchema.parse(req.query);
  const events = await helpService.listHelpEvents(
    req.params.patientId,
    req.caregiverId!,
    query
  );
  res.status(200).json({ success: true, data: events });
});
