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

    // Validate and persist the caregiver-entered summary verbatim. This body was
    // previously ignored and replaced by a hardcoded string (silent data loss).
    const { summary } = schemas.caregiverResolveAiSessionSchema.parse(req.body);

    const data = await aiSessionService.caregiverResolveSession(id, caregiverId, summary);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// AI BACKEND CALLBACK CONTROLLERS
export const handleEscalationCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const input = schemas.aiSessionEscalationCallbackSchema.parse(req.body);

    await aiSessionService.recordEscalationCallback(sessionId, input);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const handleConcludeCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const input = schemas.aiSessionConcludeCallbackSchema.parse(req.body);

    await aiSessionService.recordConcludeCallback(sessionId, input);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const handleFrameCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const input = schemas.aiSessionFrameCallbackSchema.parse(req.body);
    const result = await aiSessionService.recordFrameCallback(sessionId, input);

    if (!result.accepted) {
      res.status(202).json({
        success: true,
        accepted: false,
        reason: result.reason,
        sessionId,
        seq: input.seq,
      });
      return;
    }

    res.status(202).json({
      success: true,
      accepted: true,
      sessionId,
      seq: input.seq,
      receivedAt: result.receivedAt,
    });
  } catch (error) {
    next(error);
  }
};

// MOBILE CONTROLLERS
export const startMobileSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = schemas.startAiSessionSchema.parse(req.body);
    const data = await aiSessionService.startAiSession(
      validatedData,
      req.caregiverId!
    );
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof aiSessionService.AiAgentSessionStartError) {
      const responseBody: Record<string, unknown> = {
        success: false,
        message: "AI backend session start failed",
      };

      // Outside production, expose the upstream status only. Response bodies
      // can contain patient context and are intentionally never relayed.
      if (
        process.env.NODE_ENV !== "production" &&
        error.upstreamStatus !== undefined
      ) {
        responseBody.details = {
          upstreamStatus: error.upstreamStatus,
        };
      }

      return res.status(error.statusCode).json(responseBody);
    }
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

    const data = await aiSessionService.getMobileSession(
      id,
      deviceId,
      req.caregiverId!
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const handleMobileMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = schemas.addAiSessionMessageSchema.parse(req.body);
    
    const data = await aiSessionService.handlePatientMessage(
      id,
      validatedData.deviceId,
      validatedData.message,
      req.caregiverId!
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const resolveMobileSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = schemas.resolveAiSessionSchema.parse(req.body);
    
    const data = await aiSessionService.resolveSession(
      id,
      validatedData.deviceId,
      req.caregiverId!
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const emergencySuggestionAck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = schemas.emergencySuggestionAckSchema.parse(req.body);
    
    const data = await aiSessionService.acknowledgeEmergency(
      id,
      validatedData.deviceId,
      validatedData.action,
      req.caregiverId!
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
