import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error";
import type { ApiFailure, ApiError } from "../types/common";

/**
 * Global error handler — must be registered LAST in app.ts.
 *
 * Mapping rules (docs/execution-plan/02 §2):
 *  1. ZodError           → 400 VALIDATION_ERROR (flattened field errors)
 *  2. AppError/subclass  → its own statusCode/code/details
 *  3. Prisma known codes → P2002→409 CONFLICT, P2025→404, P2034→409
 *  4. anything else      → 500 INTERNAL_ERROR (generic message; details
 *                           suppressed outside development)
 *
 * Stack traces and raw Prisma messages never leave the server.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  // Express requires the 4-arity to recognise this as an error handler.
  _next: NextFunction,
): void {
  /* ---------- 1) Zod validation errors ---------- */
  if (error instanceof ZodError) {
    const issues = error.errors.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    respond(res, 400, {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: { fieldErrors: issues },
    });
    return;
  }

  /* ---------- 2) Application errors ---------- */
  if (error instanceof AppError) {
    respond(res, error.statusCode, {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  /* ---------- 3) Prisma errors ---------- */
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": // unique constraint — field names hidden
        respond(res, 409, {
          code: "CONFLICT",
          message: "A resource with the same unique value already exists.",
        });
        return;
      case "P2025": // record not found
        respond(res, 404, {
          code: "NOT_FOUND",
          message: "Resource not found.",
        });
        return;
      case "P2034": // transaction conflict / deadlock
        respond(res, 409, {
          code: "CONFLICT",
          message: "Concurrent modification detected, please retry.",
        });
        return;
      default:
        break; // fall through to generic 500
    }
  }

  /* ---------- 4) Unknown errors ---------- */
  // Log full server-side detail; never expose stack/Prisma internals.
  // eslint-disable-next-line no-console
  console.error("[unhandled]", error);

  respond(res, 500, {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

function respond(res: Response, statusCode: number, error: ApiError): void {
  if (res.headersSent) {
    // eslint-disable-next-line no-console
    console.error("[error-handler] headers already sent, dropping error:", error.code);
    return;
  }
  const body: ApiFailure = {
    success: false,
    error,
  };
  // Avoid sending `"details": undefined` in the JSON payload.
  if (error.details === undefined) delete body.error.details;
  res.status(statusCode).json(body);
}
