import type { Request, Response } from "express";
import { created, ok } from "../../common/utils/envelope";
import { authService } from "./service";
import type { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from "./dto";
import type { AuthUserDto, LoginResult, RefreshResult } from "./types";
import type { AuthUser } from "../../common/types/common";

/**
 * Thin HTTP-only controllers: call service, set status code, return envelope.
 * No business logic, no Prisma access (docs/execution-plan/00 §1).
 * Routes wrap these in asyncHandler so rejections reach the error handler.
 */

export const authController = {
  /** POST /register — route chain already enforced SUPER_ADMIN-only. */
  async register(req: Request, res: Response): Promise<void> {
    const user = await authService.registerUser(req.body as RegisterDto);
    res.status(201).json(created(user satisfies AuthUserDto));
  },

  /** POST /login — public. */
  async login(req: Request, res: Response): Promise<void> {
    const { user, accessToken, refreshToken } =
      (await authService.login(req.body as LoginDto)) satisfies LoginResult;
    res.status(200).json(ok({ user, accessToken, refreshToken }));
  },

  /** POST /refresh — public (token rotation, stateless). */
  async refresh(req: Request, res: Response): Promise<void> {
    const result = await authService.refresh((req.body as RefreshDto).refreshToken);
    res.status(200).json(ok(result satisfies RefreshResult));
  },

  /** GET /me — requireAuth has attached `req.user`. */
  async me(req: Request, res: Response): Promise<void> {
    const data = await authService.me((req.user as AuthUser).id);
    res.status(200).json(ok(data));
  },

  /** PATCH /me/password — 204 with no body on success. */
  async changePassword(req: Request, res: Response): Promise<void> {
    await authService.changePassword(
      (req.user as AuthUser).id,
      req.body as ChangePasswordDto,
    );
    res.status(204).send();
  },
};
