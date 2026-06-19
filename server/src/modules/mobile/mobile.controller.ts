import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { mobileRemindersQuerySchema } from "./mobile.schemas";
import { createReminderEventSchema } from "../reminder-events/reminder-event.schemas";
import {
  mobileHelpContactQuerySchema,
  createHelpEventMobileSchema,
} from "../help/help.schemas";
import {
  createBeaconEventMobileSchema,
  mobileBeaconsQuerySchema,
} from "../beacons/beacon.schemas";
import { createVitalEventMobileSchema } from "../vitals/vital.schemas";
import {
  startStreamSessionSchema,
  stopStreamSessionSchema,
  updateStreamStatusSchema,
} from "../streams/stream.schemas";
import * as mobileService from "./mobile.service";
import * as patientService from "../patients/patient.service";
import * as helpService from "../help/help.service";
import * as beaconService from "../beacons/beacon.service";
import * as vitalService from "../vitals/vital.service";
import * as streamService from "../streams/stream.service";

export const getPatients = asyncHandler(async (req: Request, res: Response) => {
  const data = await patientService.listMobilePatients(req.caregiverId!);
  res.status(200).json({ success: true, data });
});

export const getReminders = asyncHandler(async (req: Request, res: Response) => {
  const query = mobileRemindersQuerySchema.parse(req.query);
  const data = await mobileService.getMobileReminders(query);
  res.status(200).json({ success: true, data });
});

export const createReminderEvent = asyncHandler(async (req: Request, res: Response) => {
  const input = createReminderEventSchema.parse(req.body);
  const event = await mobileService.createMobileReminderEvent(input);
  res.status(201).json({ success: true, data: event });
});

export const getMobileHelpContact = asyncHandler(async (req: Request, res: Response) => {
  const query = mobileHelpContactQuerySchema.parse(req.query);
  const data = await helpService.getMobileHelpContact(query);
  res.status(200).json({ success: true, data });
});

export const createMobileHelpEvent = asyncHandler(async (req: Request, res: Response) => {
  const input = createHelpEventMobileSchema.parse(req.body);
  const event = await helpService.createMobileHelpEvent(input);
  res.status(201).json({ success: true, data: event });
});

export const getMobileBeacons = asyncHandler(async (req: Request, res: Response) => {
  const query = mobileBeaconsQuerySchema.parse(req.query);
  const data = await beaconService.getMobileBeacons(query);
  res.status(200).json({ success: true, data });
});

export const createMobileBeaconEvent = asyncHandler(async (req: Request, res: Response) => {
  const input = createBeaconEventMobileSchema.parse(req.body);
  const event = await beaconService.createMobileBeaconEvent(input);
  res.status(201).json({ success: true, data: event });
});

export const createMobileVitalEvent = asyncHandler(async (req: Request, res: Response) => {
  const input = createVitalEventMobileSchema.parse(req.body);
  const event = await vitalService.createMobileVitalEvent(input);
  res.status(201).json({ success: true, data: event });
});

export const startMobileStreamSession = asyncHandler(async (req: Request, res: Response) => {
  const input = startStreamSessionSchema.parse(req.body);
  const session = await streamService.startMobileStreamSession(input);
  res.status(201).json({ success: true, data: session });
});

export const stopMobileStreamSession = asyncHandler(async (req: Request, res: Response) => {
  const input = stopStreamSessionSchema.parse(req.body);
  const session = await streamService.stopMobileStreamSession(input);
  res.status(200).json({ success: true, data: session });
});

export const updateMobileStreamStatus = asyncHandler(async (req: Request, res: Response) => {
  const input = updateStreamStatusSchema.parse(req.body);
  const session = await streamService.updateMobileStreamStatus(input);
  res.status(200).json({ success: true, data: session });
});
