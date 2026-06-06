import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { registerSchema, loginSchema } from "./auth.schemas";
import * as authService from "./auth.service";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.registerCaregiver(input);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.loginCaregiver(input);
  res.status(200).json({ success: true, data: result });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const caregiver = await authService.getCaregiverById(req.caregiverId!);
  res.status(200).json({ success: true, data: { caregiver } });
});
