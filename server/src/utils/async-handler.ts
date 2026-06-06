import { Request, Response, NextFunction } from "express";
import { AsyncRequestHandler } from "../types/api";

export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
