# Step 02 — Auth & RBAC Setup (deliverables snapshot)

> Reference copy of everything created/modified to complete
> `docs/execution-plan/02-auth-and-rbac-setup.md`.
> The live code lives under `src/` — **source of truth**. Do not import from
> this folder; it exists only for review/delivery purposes.

## Contents

| Live file | Purpose |
|---|---|
| `src/common/errors/app-error.ts` | Base `AppError(statusCode, code, message, details)` |
| `src/common/errors/http-error.ts` | `NotFoundError` / `ConflictError` / `BadRequestError` / `UnprocessableEntityError` |
| `src/common/errors/auth-error.ts` | `UnauthorizedError` (401) / `ForbiddenError` (403) |
| `src/common/utils/jwt.ts` | Sign/verify access (`HS256`, `{ sub, role, email }`) + refresh tokens, rotation |
| `src/common/utils/password.ts` | bcrypt hash/compare via `env.BCRYPT_SALT_ROUNDS` |
| `src/common/utils/envelope.ts` | `ok()` / `created()` / `paginated()` response helpers |
| `src/common/utils/async-handler.ts` | Wraps async route handlers → global error handler |
| `src/common/middlewares/validate.ts` | Zod `body`/`query`/`params` validation |
| `src/common/middlewares/auth.ts` | `requireAuth` — Bearer token → `req.user` |
| `src/common/middlewares/rbac.ts` | `requireRole(...roles)` / `requireSelfOrRoles` |
| `src/common/middlewares/error-handler.ts` | ZodError→400, AppError→own code, Prisma P2002→409 / P2025→404 / P2034→409, else 500 |
| `src/common/middlewares/not-found.ts` | 404 envelope for unmatched routes |
| `src/common/types/common.ts` | `AuthUser`, `SafeUser`, `ApiMeta`, envelope body types |
| `src/common/types/express.d.ts` | `Request.user?: AuthUser` augmentation |
| `src/modules/auth/dto.ts` | register/login/refresh/changePassword Zod schemas (`.strict()`) |
| `src/modules/auth/types.ts` | Auth DTOs + `SAFE_USER_SELECT` (never exposes `passwordHash`) |
| `src/modules/auth/service.ts` | register / login / refresh / me / changePassword business logic |
| `src/modules/auth/controller.ts` | Thin HTTP-only controllers |
| `src/modules/auth/routes.ts` | Route table with guards + validation |
| `src/app.ts` | Mounted `/auth`, `notFoundHandler` + `errorHandler` last |

## Endpoints (`/api/v1/auth`)

```
POST /register   → requireAuth + requireRole(SUPER_ADMIN)
POST /login      → public
POST /refresh    → public
GET  /me         → requireAuth
PATCH /me/password → requireAuth
```

## Verified (definition of done)

- Login with seeded admin → `{ user, accessToken, refreshToken }` ✅
- `GET /me` with token → profile; without → 401 envelope ✅
- Register as receptionist → 403; as SUPER_ADMIN → 201 ✅
- Duplicate email → 409 `EMAIL_IN_USE` ✅
- Invalid body → 400 `VALIDATION_ERROR` with field errors ✅
- Unknown route → 404 envelope; Prisma errors mapped, never leaked ✅
