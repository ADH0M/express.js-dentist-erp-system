# 02 — Auth & RBAC Setup

> Goal: JWT authentication module + global error/validate middleware + route-level RBAC guards. Every later module depends on this.

---

## 1. Files to create

```
src/common/errors/app-error.ts
src/common/errors/http-error.ts
src/common/errors/auth-error.ts
src/common/utils/jwt.ts
src/common/utils/password.ts
src/common/utils/async-handler.ts
src/common/utils/envelope.ts
src/common/middlewares/error-handler.ts
src/common/middlewares/not-found.ts
src/common/middlewares/validate.ts
src/common/middlewares/auth.ts
src/common/middlewares/rbac.ts
src/common/types/express.d.ts
src/common/types/common.ts
src/modules/auth/dto.ts
src/modules/auth/types.ts
src/modules/auth/service.ts
src/modules/auth/controller.ts
src/modules/auth/routes.ts
src/app.ts                        # assemble middleware order
src/server.ts                     # boot entry (listen on env.PORT)
```

## 2. Error architecture

```ts
// app-error.ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;               // machine-readable, e.g. "CONFLICT"
  readonly details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown)
}

// http-error.ts (exports are pure sugar)
export class NotFoundError extends AppError      // 404 / "NOT_FOUND"
export class ConflictError extends AppError      // 409 / "CONFLICT"
export class BadRequestError extends AppError    // 400 / "BAD_REQUEST"
export class UnprocessableEntityError extends AppError // 422 / "UNPROCESSABLE"

// auth-error.ts
export class UnauthorizedError extends AppError  // 401 / "UNAUTHORIZED"
export class ForbiddenError extends AppError     // 403 / "FORBIDDEN"
```

`error-handler.ts` behavior:
1. **ZodError** → 400 `{ code: "VALIDATION_ERROR", details: flatten() }`
2. **AppError** (any subclass) → its own statusCode/code/details
3. **Prisma errors**: `P2002` → 409 CONFLICT (hide field names), `P2025` → 404 NOT_FOUND, `P2034` deadlock → 409 `CONFLICT`, fallback → 500
4. Anything else → 500 `{ code: "INTERNAL_ERROR", message: "An unexpected error occurred." }`; full error logged server-side. Stack never leaves the server.
5. In `NODE_ENV=production` no Prisma table/column names, no stack traces.

## 3. Zod validation middleware

```ts
export const validate = <B extends ZodTypeAny, Q extends ZodTypeAny, P extends ZodTypeAny>(schemas: {
  body?: B; query?: Q; params?: P;
}) => (req, _res, next) => { /* .parse() originals, assign back, call next() */ errors → next(ZodError) }
```

Modules pass subsets; all schemas have `.strict()` bodies to reject unknown keys.

## 4. JWT utils (`jwt.ts`)

- Sign/access: `HS256`, payload `{ sub, role, email }`, `expiresIn: env.JWT_ACCESS_EXPIRES_IN`, `issuer/audience = env.JWT_ISSUER`.
- Sign/refresh: separate secret (`JWT_REFRESH_SECRET`), longer TTL, nothing stored server-side (stateless). Rotation: client posts refresh token; if valid → new access + new refresh pair.
- `verifyAccessToken(token) → { sub: string; role: UserRole; email: string }` typed; throws mapped `UnauthorizedError("token expired"|"invalid")`.
- Secrets enforced min 32 chars by `env.ts`.

## 5. Password utils

`bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS)`, `bcrypt.compare`. Never log or return `passwordHash`. The user shape sent to clients is defined by `AuthUser` + `StaffBaseDTO` (see module 06).

## 6. Auth DTOs (Zod, `dto.ts`)

```ts
registerSchema       // SUPER_ADMIN only: { email, password (min 10, 1 letter + 1 digit), fullName, role, position, phone?, licenseNumber? }
loginSchema          // { email: string().email(), password: string().min(1) }
refreshSchema        // { refreshToken: string() }
changePasswordSchema // { currentPassword, newPassword (same rules as password) }
```

## 7. Auth service (`service.ts`)

| Method | Logic | Errors |
|---|---|---|
| `registerUser(dto)` | Role-write already enforced by route guard. Hash password, create user. Duplicate email → `ConflictError("EMAIL_IN_USE")`. | 409 |
| `login(dto)` | Find active user by email; `bcrypt.compare`; **timing-equal generic 401** `INVALID_CREDENTIALS` for both unknown email and wrong password; returns `{ user, accessToken, refreshToken }`. Inactive user → `403 "ACCOUNT_DISABLED"`. | 401, 403 |
| `refresh(refreshToken)` | Verify with refresh secret; ensure user still active; return new pair. | 401 |
| `me(actorId)` | `prisma.user.findUnique` selecting safe fields only. | 404 |
| `changePassword(actorId, dto)` | Verify current password; ensure new ≠ current; update hash. Existing tokens stay valid for remaining TTL (acceptable for v1). | 401 |

## 8. Controllers (`controller.ts`) → routes (`routes.ts`)

Thin: `res.status(201).json(ok(user))`, etc.

```
POST  /api/v1/auth/register   → requireAuth + requireRole(SUPER_ADMIN) + validate({ body })
POST  /api/v1/auth/login      → public
POST  /api/v1/auth/refresh    → public
GET   /api/v1/auth/me         → requireAuth
PATCH /api/v1/auth/me/password → requireAuth + validate({ body: changePasswordSchema })
```

All async handlers pre-wrapped in `asyncHandler`.

## 9. RBAC middleware (`rbac.ts`)

```ts
export const requireRole = (...roles: UserRole[]) => (
  req, _res, next
) => { /* 401 if no req.user; 403 if role not in list */ };

// per-module ownership helper:
export const requireSelfOrRoles = (paramName: string, ...roles: UserRole[]) => (
  req, _res, next
) => { /* pass if req.user.id === req.params[paramName] or req.user.role ∈ roles */ };
```

## 10. `app.ts` middleware order (final)

```
helmet → cors → express.json/urlencoded (10kb limit) → morgan
→ mount routers
→ notFoundHandler (404 envelope)
→ errorHandler
```

## 11. Definition of done

- [ ] `POST /login` with seeded admin creds returns `{ user, accessToken, refreshToken }`.
- [ ] `GET /me` with a valid access token returns the profile; without a token → 401 envelope.
- [ ] `POST /register` as receptionist → 403; as super admin → 201 with the safe user shape.
- [ ] Invalid body (bad email/short password) → 400 `VALIDATION_ERROR` with field-level errors.
- [ ] Unmatched route → 404 envelope; a thrown `NotFoundError` → 404 envelope; raw Prisma errors never leak.
