import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  beaconReportQuerySchema,
  createBeaconSchema,
  listBeaconEventsQuerySchema,
  listBeaconsQuerySchema,
  updateBeaconSchema,
} from "./beacon.schemas";
import * as beaconService from "./beacon.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listBeaconsQuerySchema.parse(req.query);
  const beacons = await beaconService.listBeacons(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: beacons });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = createBeaconSchema.parse(req.body);
  const beacon = await beaconService.createBeacon(
    req.caregiverId!,
    req.params.patientId,
    input
  );
  res.status(201).json({ success: true, data: beacon });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = updateBeaconSchema.parse(req.body);
  const beacon = await beaconService.updateBeacon(
    req.caregiverId!,
    req.params.id,
    input
  );
  res.status(200).json({ success: true, data: beacon });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await beaconService.deleteBeacon(req.caregiverId!, req.params.id);
  res.status(200).json({ success: true, data: null });
});

export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  const query = listBeaconEventsQuerySchema.parse(req.query);
  const events = await beaconService.listBeaconEvents(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: events });
});

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const query = beaconReportQuerySchema.parse(req.query);
  const report = await beaconService.getBeaconReport(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: report });
});
