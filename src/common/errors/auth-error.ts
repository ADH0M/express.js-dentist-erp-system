import { AppError } from "./app-error";

/** 401 — missing, invalid, or expired credentials. */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized.", details?: unknown) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

/** 403 — authenticated but role/ownership does not permit the action. */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden.", details?: unknown) {
    super(403, "FORBIDDEN", message, details);
  }
}
