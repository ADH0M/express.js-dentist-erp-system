import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { UnauthorizedError } from "../errors/auth-error";

/**
 * Verifies the `Authorization: Bearer <accessToken>` header and attaches
 * the decoded identity to `req.user`. Throws 401 envelope on missing /
 * invalid / expired tokens.
 */
export const requireAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token.");
    }

    const payload = verifyAccessToken(header.slice("Bearer ".length).trim());
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
};
