import express, { type Application } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";

/**
 * Assembles the Express application.
 * Routers are registered per module in later implementation steps
 * (docs/execution-plan/*.md). Error/404 middleware are added last.
 */
export function createApp(): Application {
  const app = express();

  /* ---------- Global middleware ---------- */
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));

  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  }

  /* ---------- Health check ---------- */
  app.get("/health", (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: "up",
        env: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  });

  /* ---------- Modules (added incrementally) ---------- */
  // app.use(`${env.API_PREFIX}/auth`, authRoutes)      → step 02
  // app.use(`${env.API_PREFIX}/patients`, ...)         → step 03
  // app.use(`${env.API_PREFIX}/appointments`, ...)     → step 04
  // app.use(`${env.API_PREFIX}/billing`, ...)          → step 05
  // app.use(`${env.API_PREFIX}/staff`, ...)            → step 06

  /* ---------- Errors (last) ---------- */
  // app.use(notFoundHandler)                           → step 02
  // app.use(errorHandler)                              → step 02

  return app;
}
