import bcrypt from "bcryptjs";
import { env } from "../../config/env";

/**
 * Password hashing utilities. passwordHash is never returned or logged —
 * client-facing user shape is defined by SafeUser (see module 06).
 */

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
