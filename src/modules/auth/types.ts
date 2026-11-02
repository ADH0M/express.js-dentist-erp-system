import type { StaffPosition, UserRole } from "@prisma/client";
import type { SafeUser } from "../../common/types/common";

/** Safe user shape returned by every auth endpoint — never includes passwordHash. */
export type AuthUserDto = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  position: StaffPosition;
  phone: string | null;
  licenseNumber: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LoginResult = {
  user: AuthUserDto;
  accessToken: string;
  refreshToken: string;
};

export type RegisterResult = AuthUserDto;
export type RefreshResult = LoginResult;
export type MeResult = AuthUserDto;

/** Prisma select projection for the safe user shape. */
export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  position: true,
  phone: true,
  licenseNumber: true,
  bio: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type { SafeUser };
