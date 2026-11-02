import type { NextFunction, Request, RequestHandler, Response } from "express";
import { type ZodTypeAny } from "zod";

/**
 * Validates `req.body` / `req.query` / `req.params` against the given Zod
 * schemas. Successfully parsed values replace the originals on the request,
 * so downstream code reads typed `req.body`/`req.query`. Modules pass only
 * the subsets they care about ("{}" body schemas are not allowed to
 * surprise anyone — bodies are declared .strict() at the DTO level).
 *
 * ZodErrors bubble to the global error handler, which renders them as
 * 400 VALIDATION_ERROR with field-level details.
 */
export const validate =
  <B extends ZodTypeAny, Q extends ZodTypeAny, P extends ZodTypeAny>(schemas: {
    body?: B;
    query?: Q;
    params?: P;
  }): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (error) {
      next(error); // ZodError → error-handler.ts
    }
  };

export default validate;
