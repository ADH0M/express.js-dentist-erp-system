import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/rbac";
import { asyncHandler } from "../../common/utils/async-handler";
import { patientController } from "./controller";
import {
  createHistoryEntrySchema,
  createPatientSchema,
  historyEntryIdParamsSchema,
  listHistoryQuerySchema,
  listPatientsQuerySchema,
  patientIdParamsSchema,
  updateHistoryEntrySchema,
  updatePatientSchema,
} from "./dto";
import type { UserRole } from "@prisma/client";

/**
 * /api/v1/patients (docs/execution-plan/03 §7)
 *
 *  GET    /                          all roles — list
 *  POST   /                          all roles — create          → 201
 *  GET    /:id                       all roles — detail
 *  PATCH  /:id                       all roles — update
 *  DELETE /:id                       ADMIN + RECEPTIONIST        → 204
 *  GET    /:id/history               all roles — list (all roles)
 *  POST   /:id/history               ADMIN + DENTIST             → 201
 *  PATCH  /:id/history/:entryId      ADMIN + DENTIST             → 200
 *  DELETE /:id/history/:entryId      ADMIN + DENTIST             → 204
 */
const router = Router();

const ADMIN_DENTIST: UserRole[] = ["SUPER_ADMIN", "DENTIST"];
const ADMIN_RECEPTIONIST: UserRole[] = ["SUPER_ADMIN", "RECEPTIONIST"];

router.get(
  "/",
  requireAuth,
  validate({ query: listPatientsQuerySchema }),
  asyncHandler(patientController.list),
);

router.post(
  "/",
  requireAuth,
  validate({ body: createPatientSchema }),
  asyncHandler(patientController.create),
);

router.get(
  "/:id",
  requireAuth,
  validate({ params: patientIdParamsSchema }),
  asyncHandler(patientController.getById),
);

router.patch(
  "/:id",
  requireAuth,
  validate({ params: patientIdParamsSchema, body: updatePatientSchema }),
  asyncHandler(patientController.update),
);

router.delete(
  "/:id",
  requireAuth,
  requireRole(...ADMIN_RECEPTIONIST),
  validate({ params: patientIdParamsSchema }),
  asyncHandler(patientController.softDelete),
);

router.get(
  "/:id/history",
  requireAuth,
  validate({ params: patientIdParamsSchema, query: listHistoryQuerySchema }),
  asyncHandler(patientController.listHistory),
);

router.post(
  "/:id/history",
  requireAuth,
  requireRole(...ADMIN_DENTIST),
  validate({ params: patientIdParamsSchema, body: createHistoryEntrySchema }),
  asyncHandler(patientController.addHistoryEntry),
);

router.patch(
  "/:id/history/:entryId",
  requireAuth,
  requireRole(...ADMIN_DENTIST),
  validate({ params: historyEntryIdParamsSchema, body: updateHistoryEntrySchema }),
  asyncHandler(patientController.updateHistoryEntry),
);

router.delete(
  "/:id/history/:entryId",
  requireAuth,
  requireRole(...ADMIN_DENTIST),
  validate({ params: historyEntryIdParamsSchema }),
  asyncHandler(patientController.deleteHistoryEntry),
);

export { router as patientRoutes };
