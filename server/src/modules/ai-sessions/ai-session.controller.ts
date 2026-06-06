import { Request, Response, NextFunction } from "express";
import * as aiSessionService from "./ai-session.service";
import * as schemas from "./ai-session.schemas";

// CAREGIVER CONTROLLERS
export const listCaregiverSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    // Assuming caregiverId comes from authMiddleware attaching to req.user.id
    const caregiverId = (req as any).caregiverId;
    
    const query = schemas.listCaregiverAiSessionsSchema.parse(req.query);
    
    const data = await aiSessionService.listCaregiverSessions(patientId, caregiverId, query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getCaregiverSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const caregiverId = (req as any).caregiverId;
    
    const data = await aiSessionService.getCaregiverSession(id, caregiverId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const caregiverJoinSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const caregiverId = (req as any).caregiverId;
    
    const data = await aiSessionService.caregiverJoinSession(id, caregiverId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const caregiverResolveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const caregiverId = (req as any).caregiverId;
    
    const data = await aiSessionService.caregiverResolveSession(id, caregiverId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// MOBILE CONTROLLERS
export const startMobileSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = schemas.startAiSessionSchema.parse(req.body);
    const data = await aiSessionService.startAiSession(validatedData);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getMobileSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { deviceId } = req.query;
    
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ status: "error", message: "deviceId query parameter is required", code: "VALIDATION_ERROR" });
    }

    const data = await aiSessionService.getMobileSession(id, deviceId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const handleMobileMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = schemas.addAiSessionMessageSchema.parse(req.body);
    
    const data = await aiSessionService.handlePatientMessage(id, validatedData.deviceId, validatedData.message);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const resolveMobileSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = schemas.resolveAiSessionSchema.parse(req.body);
    
    const data = await aiSessionService.resolveSession(id, validatedData.deviceId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const emergencySuggestionAck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = schemas.emergencySuggestionAckSchema.parse(req.body);
    
    const data = await aiSessionService.acknowledgeEmergency(id, validatedData.deviceId, validatedData.action);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
