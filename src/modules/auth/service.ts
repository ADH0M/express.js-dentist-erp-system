import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { comparePassword, hashPassword } from "../../common/utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../common/utils/jwt";
import { AppError } from "../../common/errors/app-error";
import { NotFoundError } from "../../common/errors/http-error";
import { UnauthorizedError, ForbiddenError } from "../../common/errors/auth-error";
import type { RegisterDto, LoginDto, ChangePasswordDto } from "./dto";
import {
  SAFE_USER_SELECT,
  type AuthUserDto,
  type LoginResult,
  type RegisterResult,
  type RefreshResult,
} from "./types";

/**
 * Auth business logic. Route-level role enforcement (register = SUPER_ADMIN
 * only) happens in routes.ts — the service trusts that guards already ran.
 *
 * Every read path uses SAFE_USER_SELECT so passwordHash can never leak.
 */

// bcrypt hash of a random throwaway string. Compared against when the email
// is unknown so login timing does not reveal whether an account exists.
// eslint-disable-next-line -- constant, never logged or returned
const DUMMY_HASH = "$2a$12$HkW0Z8dQhP0znnKwF2CJhO/TZ1LPmAuSj86Bv03oQ4xWLDjOEv0KK";

const omitPassword = <T extends { passwordHash: string }>(user: T): Omit<T, "passwordHash"> => {
  const { passwordHash: _ph, ...safe } = user;
  void _ph;
  return safe;
};

export const authService = {
  /** Create a staff user (register). Duplicate email → 409 EMAIL_IN_USE. */
  async registerUser(dto: RegisterDto): Promise<RegisterResult> {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
          position: dto.position,
          phone: dto.phone ?? null,
          licenseNumber: dto.licenseNumber ?? null,
        },
        select: SAFE_USER_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Doc-specified domain code; global handler still covers generic P2002.
        throw new AppError(409, "EMAIL_IN_USE", "Email is already in use.");
      }
      throw error;
    }
  },

  /**
   * Login. Generic 401 INVALID_CREDENTIALS for both unknown email and wrong
   * password (timing-equal-ish: a bcrypt compare always runs). Inactive
   * accounts get a distinct 403 ACCOUNT_DISABLED after the password check.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await prisma.user.findUnique({ where: { email: dto.email } });
    const passwordOk = await comparePassword(dto.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      throw new UnauthorizedError("Invalid email or password.");
    }
    if (!user.isActive) {
      throw new ForbiddenError("Account is disabled.");
    }

    return {
      user: omitPassword(user),
      accessToken: signAccessToken({ sub: user.id, role: user.role, email: user.email }),
      refreshToken: signRefreshToken(user.id),
    };
  },

  /**
   * Rotate the token pair: verify the refresh token with the refresh secret,
   * re-check the user still exists and is active, then issue a fresh pair.
   * Refresh tokens are stateless — nothing is stored server-side.
   */
  async refresh(refreshToken: string): Promise<RefreshResult> {
    const { sub } = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user) throw new UnauthorizedError("User no longer exists.");
    if (!user.isActive) throw new ForbiddenError("Account is disabled.");

    return {
      user: omitPassword(user),
      accessToken: signAccessToken({ sub: user.id, role: user.role, email: user.email }),
      refreshToken: signRefreshToken(user.id),
    };
  },

  /** Profile of an authenticated user — safe fields only. */
  async me(actorId: string): Promise<AuthUserDto> {
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      // Token valid but record gone (e.g. deactivated/hard-removed account).
      throw new NotFoundError("User not found.");
    }
    return user;
  },

  /**
   * Change own password: verify current, ensure new ≠ current, update hash.
   * Existing tokens stay valid for their remaining TTL (accepted for v1).
   */
  async changePassword(actorId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { passwordHash: true },
    });
    if (!user) {
      // Auth middleware validity implies the account existed at token issue.
      throw new UnauthorizedError("Authentication required.");
    }

    const matches = await comparePassword(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedError("Current password is incorrect.");
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await prisma.user.update({ where: { id: actorId }, data: { passwordHash } });
  },
};
