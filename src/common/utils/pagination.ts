import type { ApiMeta } from "../types/common";

/**
 * Builds the canonical pagination meta block shared by all paginated list
 * endpoints (docs/execution-plan/00 §7: ?page=&limit= with meta.total).
 */
export function buildPageMeta(page: number, limit: number, total: number): ApiMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
