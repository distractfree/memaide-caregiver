import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  createVitalEventPatientSchema,
  mobileRemindersQuerySchema,
  patientBeaconEventSchema,
  patientBeaconsQuerySchema,
  patientHelpContactQuerySchema,
  patientHelpEventSchema,
  patientLoginSchema,
  patientReminderEventSchema,
  patientRemindersQuerySchema,
  patientStartStreamSchema,
  patientStopStreamSchema,
  patientUpdateStreamStatusSchema,
} from "./mobile.schemas";
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
import { mobileActorFor, schemaForActor } from "./mobile-request";

/**
 * Patient phone-number login.
 *
 * Unauthenticated by design — this is how a patient-operated app obtains its
 * token. Declared before the mobile auth middleware in mobile.routes.ts.
 *
 * The response carries only the token and the patient's own id: no patient
 * list, no other patient's data, no caregiver information, and no secrets.
 */
export const patientLogin = asyncHandler(async (req: Request, res: Response) => {
  const input = patientLoginSchema.parse(req.body);
  const { token, patient } = await mobileService.loginPatientByPhoneNumber(input);

  res.status(200).json({ success: true, token, patient });
});

export const getPatients = asyncHandler(async (req: Request, res: Response) => {
  // Caregiver-only. `requireCaregiverActor` on the route guarantees the actor
  // type, so `req.caregiverId` is always populated here.
  const data = await patientService.listMobilePatients(req.caregiverId!);
  res.status(200).json({ success: true, data });
});

export const getReminders = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const query = schemaForActor(
    actor,
    mobileRemindersQuerySchema,
    patientRemindersQuerySchema
  ).parse(req.query);
  const data = await mobileService.getMobileReminders(actor, query);
  res.status(200).json({ success: true, data });
});

export const createReminderEvent = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    createReminderEventSchema,
    patientReminderEventSchema
  ).parse(req.body);
  const event = await mobileService.createMobileReminderEvent(actor, input);
  res.status(201).json({ success: true, data: event });
});

export const getMobileHelpContact = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const query = schemaForActor(
    actor,
    mobileHelpContactQuerySchema,
    patientHelpContactQuerySchema
  ).parse(req.query);
  const data = await helpService.getMobileHelpContact(actor, query);
  res.status(200).json({ success: true, data });
});

export const createMobileHelpEvent = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    createHelpEventMobileSchema,
    patientHelpEventSchema
  ).parse(req.body);
  const event = await helpService.createMobileHelpEvent(actor, input);
  res.status(201).json({ success: true, data: event });
});

export const getMobileBeacons = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const query = schemaForActor(
    actor,
    mobileBeaconsQuerySchema,
    patientBeaconsQuerySchema
  ).parse(req.query);
  const data = await beaconService.getMobileBeacons(actor, query);
  res.status(200).json({ success: true, data });
});

export const createMobileBeaconEvent = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    createBeaconEventMobileSchema,
    patientBeaconEventSchema
  ).parse(req.body);
  const event = await beaconService.createMobileBeaconEvent(actor, input);
  res.status(201).json({ success: true, data: event });
});

export const createMobileVitalEvent = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    createVitalEventMobileSchema,
    createVitalEventPatientSchema
  ).parse(req.body);
  const event = await vitalService.createMobileVitalEvent(actor, input);
  res.status(201).json({ success: true, data: event });
});

export const startMobileStreamSession = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    startStreamSessionSchema,
    patientStartStreamSchema
  ).parse(req.body);
  const session = await streamService.startMobileStreamSession(actor, input);
  res.status(201).json({ success: true, data: session });
});

export const stopMobileStreamSession = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    stopStreamSessionSchema,
    patientStopStreamSchema
  ).parse(req.body);
  const session = await streamService.stopMobileStreamSession(actor, input);
  res.status(200).json({ success: true, data: session });
});

export const updateMobileStreamStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = mobileActorFor(req);
  const input = schemaForActor(
    actor,
    updateStreamStatusSchema,
    patientUpdateStreamStatusSchema
  ).parse(req.body);
  const session = await streamService.updateMobileStreamStatus(actor, input);
  res.status(200).json({ success: true, data: session });
});
