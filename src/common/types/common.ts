import type { UserRole } from "@prisma/client";

/**
 * Identity attached to `req.user` by the auth middleware after a
 * verified access token. Deliberately minimal — no PII beyond email.
 */
export type AuthUser = {
  id: string;
  role: UserRole;
  email: string;
};

/** Safe user shape exposed to clients (never includes passwordHash). */
export type SafeUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  position: string;
  phone: string | null;
  licenseNumber: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Response envelope meta for paginated lists. */
export type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/** Page/limit query contract shared across modules (step 03+). */
export type PaginationQuery = {
  page: number;
  limit: number;
};

/** Error envelope body (mirrors docs/execution-plan/00 §5). */
export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

/** Success envelope body. */
export type ApiSuccess<T> = {
  success: boolean;
  data: T;
  meta?: ApiMeta;
};

/** Error envelope body. */
export type ApiFailure = {
  success: boolean;
  error: ApiError;
};
