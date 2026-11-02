/**
 * Base application error carrying an HTTP status, a stable machine-readable
 * code, and optional structured details. The global error handler turns any
 * AppError (or subclass) directly into its response envelope.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Restore prototype chain when targeting ES5 output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
