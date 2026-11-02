import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../errors/auth-error";
import type { UserRole } from "@prisma/client";

/**
 * Stateless token pair:
 *  - access token  → short TTL, carries { sub, role, email }
 *  - refresh token → longer TTL, separate secret, nothing stored server-side.
 *
 * On refresh the client posts the refresh token and receives a brand-new
 * pair (token rotation) — see AuthController.refresh.
 */

const ACCESS_OPTIONS: SignOptions = {
  algorithm: "HS256",
  issuer: env.JWT_ISSUER,
  audience: env.JWT_ISSUER,
  // env values are plain strings; jsonwebtoken@9 types wants ms.StringValue
  expiresIn: env.JWT_ACCESS_EXPIRES_IN as unknown as SignOptions["expiresIn"],
};

const REFRESH_OPTIONS: SignOptions = {
  algorithm: "HS256",
  issuer: env.JWT_ISSUER,
  audience: env.JWT_ISSUER,
  expiresIn: env.JWT_REFRESH_EXPIRES_IN as unknown as SignOptions["expiresIn"],
};

export type AccessTokenPayload = {
  sub: string;
  role: UserRole;
  email: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, ACCESS_OPTIONS);
}

export function signRefreshToken(sub: string): string {
  return jwt.sign({ sub }, env.JWT_REFRESH_SECRET, REFRESH_OPTIONS);
}

export function verifyRefreshToken(token: string): { sub: string } {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_ISSUER,
    });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new UnauthorizedError("Invalid refresh token.");
    }
    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Refresh token expired.");
    }
    throw new UnauthorizedError("Invalid refresh token.");
  }
}

/** Typed verify for the access token — throws UnauthorizedError on any failure. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_ISSUER,
    });
    if (
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as AccessTokenPayload).sub === "string" &&
      typeof (payload as AccessTokenPayload).role === "string" &&
      typeof (payload as AccessTokenPayload).email === "string"
    ) {
      return payload as AccessTokenPayload;
    }
    throw new UnauthorizedError("Invalid access token payload.");
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token expired.");
    }
    throw new UnauthorizedError("Invalid access token.");
  }
}
