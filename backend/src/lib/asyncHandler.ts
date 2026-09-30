import { Request, Response, RequestHandler } from "express";

// Forwards rejected promises to Express's error handler
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };