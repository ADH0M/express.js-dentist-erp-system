/**
 * Response envelope helpers (docs/execution-plan/00 §5).
 * Controllers always respond through these so the shape stays canonical.
 */
export function ok<T>(data: T, meta?: unknown): { success: true; data: T; meta?: unknown } {
  return meta === undefined ? { success: true, data } : { success: true, data, meta };
}

export function created<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

export function paginated<T>(
  data: T[],
  meta: { page: number; limit: number; total: number; totalPages: number },
): { success: true; data: T[]; meta: typeof meta } {
  return { success: true, data, meta };
}
