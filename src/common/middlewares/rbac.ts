import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@prisma/client";
import { UnauthorizedError } from "../errors/auth-error";
import { ForbiddenError } from "../errors/auth-error";

/** 401 if no authenticated user; 403 if role is not in the allowed list. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required.");
      if (!roles.includes(req.user.role)) {
        throw new ForbiddenError("You do not have permission to perform this action.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Per-module ownership helper: pass when the target route param matches the
 * caller, OR when the caller holds one of the privileged roles.
 * Used by later modules (e.g. dentist editing own appointment in step 04).
 */
export const requireSelfOrRoles =
  (paramName: string, ...roles: UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required.");
      const target = req.params[paramName];
      if (target && (target === req.user.id || roles.includes(req.user.role))) {
        next();
        return;
      }
      throw new ForbiddenError("You do not have permission to access this resource.");
    } catch (error) {
      next(error);
    }
  };
