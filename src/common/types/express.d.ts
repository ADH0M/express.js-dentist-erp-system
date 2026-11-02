import type { Application, Request, Response, NextFunction, RequestHandler } from "express";
import type { AuthUser } from "./common";
import type { ApiMeta } from "./common";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type { Application, Request, Response, NextFunction, RequestHandler, ApiMeta };
