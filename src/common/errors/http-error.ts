import { AppError } from "./app-error";

/** 404 — resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found.", details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}

/** 409 — state conflict (duplicate email, slot taken, already paid...). */
export class ConflictError extends AppError {
  constructor(message = "Conflict with the current state.", details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

/** 400 — malformed request semantics. */
export class BadRequestError extends AppError {
  constructor(message = "Bad request.", details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

/** 422 — syntactically valid but semantically unacceptable. */
export class UnprocessableEntityError extends AppError {
  constructor(message = "Unprocessable entity.", details?: unknown) {
    super(422, "UNPROCESSABLE", message, details);
  }
}
