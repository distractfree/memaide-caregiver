import { Request, Response, NextFunction } from "express";
import * as adminService from "./admin.service";
import { adminLoginSchema } from "./admin.schemas";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = adminLoginSchema.parse({ body: req.body });
    const result = await adminService.loginAdmin(parsed.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const me = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Already authenticated by middleware
    res.json({ admin: { role: "admin" } });
  } catch (error) {
    next(error);
  }
};

export const getCaregivers = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const caregivers = await adminService.getCaregivers();
    res.json({ caregivers });
  } catch (error) {
    next(error);
  }
};

export const getCaregiverById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const caregiver = await adminService.getCaregiverById(req.params.id);
    res.json({ caregiver });
  } catch (error) {
    next(error);
  }
};

export const getAiSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessions = await adminService.getAiSessions(req.query);
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
};

export const getAiSessionById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = await adminService.getAiSessionById(req.params.id);
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};
