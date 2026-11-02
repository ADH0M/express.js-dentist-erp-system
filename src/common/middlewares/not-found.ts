import type { NextFunction, Request, Response } from "express";

/**
 * 404 catcher for unmatched routes — rendered through the canonical error
 * envelope so clients get one consistent failure shape.
 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found.`,
    },
  });
}
