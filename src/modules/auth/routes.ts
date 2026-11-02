import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/rbac";
import { asyncHandler } from "../../common/utils/async-handler";
import { authController } from "./controller";
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from "./dto";
import type { UserRole } from "@prisma/client";

/**
 * /api/v1/auth
 *
 *  POST /register   → requireAuth + requireRole(SUPER_ADMIN) (docs: register is admin-only)
 *  POST /login      → public
 *  POST /refresh    → public
 *  GET  /me         → requireAuth
 *  PATCH /me/password → requireAuth
 */
const router = Router();
const SUPER_ADMIN: UserRole = "SUPER_ADMIN";

router.post("/register", requireAuth, requireRole(SUPER_ADMIN), validate({ body: registerSchema }), asyncHandler(authController.register));
router.post("/login", validate({ body: loginSchema }), asyncHandler(authController.login));
router.post("/refresh", validate({ body: refreshSchema }), asyncHandler(authController.refresh));
router.get("/me", requireAuth, asyncHandler(authController.me));
router.patch("/me/password", requireAuth, validate({ body: changePasswordSchema }), asyncHandler(authController.changePassword));

export { router as authRoutes };
