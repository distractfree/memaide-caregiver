import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import {
  listStreamSessionsQuerySchema,
  startStreamSessionSchema,
  stopStreamSessionSchema,
  updateStreamStatusSchema,
} from "./stream.schemas";
import * as streamService from "./stream.service";

export const startMobileStreamSession = asyncHandler(
  async (req: Request, res: Response) => {
    const input = startStreamSessionSchema.parse(req.body);
    const session = await streamService.startMobileStreamSession(
      req.caregiverId!,
      input
    );
    res.status(201).json({ success: true, data: session });
  }
);

export const stopMobileStreamSession = asyncHandler(
  async (req: Request, res: Response) => {
    const input = stopStreamSessionSchema.parse(req.body);
    const session = await streamService.stopMobileStreamSession(
      req.caregiverId!,
      input
    );
    res.status(200).json({ success: true, data: session });
  }
);

export const updateMobileStreamStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const input = updateStreamStatusSchema.parse(req.body);
    const session = await streamService.updateMobileStreamStatus(
      req.caregiverId!,
      input
    );
    res.status(200).json({ success: true, data: session });
  }
);

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listStreamSessionsQuerySchema.parse(req.query);
  const sessions = await streamService.listStreamSessions(
    req.caregiverId!,
    req.params.patientId,
    query
  );
  res.status(200).json({ success: true, data: sessions });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const session = await streamService.getStreamSessionById(
    req.caregiverId!,
    req.params.id
  );
  res.status(200).json({ success: true, data: session });
});

export const getLatestFrame = asyncHandler(async (req: Request, res: Response) => {
  const frame = await streamService.getLatestFrameForCaregiver(
    req.caregiverId!,
    req.params.id
  );
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  });
  res.status(200).json({ success: true, data: frame });
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = await streamService.getPatientStreamStatus(
    req.caregiverId!,
    req.params.patientId
  );
  res.status(200).json({ success: true, data: status });
});
