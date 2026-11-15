# Step 03 — Patient Management Module (deliverables snapshot)

> Reference copy of everything created/modified to complete
> `docs/execution-plan/03-patient-management-module.md`.
> The live code lives under `src/` — **source of truth**. Do not import from
> this folder; it exists only for review/delivery purposes.

## Contents

| Live file                                | Purpose                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `src/common/utils/pagination.ts`         | `buildPageMeta()` — canonical `{ page, limit, total, totalPages }` meta builder |
| `src/modules/patients/dto.ts`            | Zod schemas (create/update patient, history entries, params, list queries)     |
| `src/modules/patients/types.ts`          | `PatientDTO` / `HistoryEntryDTO`, `computeAge()`, mappers                       |
| `src/modules/patients/service.ts`        | CRUD + soft-delete invoice guard + history logic (only Prisma-calling layer)    |
| `src/modules/patients/controller.ts`     | Thin HTTP-only controllers                                                     |
| `src/modules/patients/routes.ts`         | Route table with guards + validation                                           |
| `src/app.ts`                             | Mounted `/patients` router                                                     |

## Endpoints (`/api/v1/patients`)

```
GET    /                          requireAuth (all roles)                       → 200 paginated
POST   /                          requireAuth (all roles)                       → 201
GET    /:id                       requireAuth (all roles)                       → 200 (+_count)
PATCH  /:id                       requireAuth (all roles)                       → 200
DELETE /:id                       requireRole(SUPER_ADMIN, RECEPTIONIST)        → 204 soft delete
GET    /:id/history               requireAuth (all roles), ?category=&page&limit→ 200 paginated
POST   /:id/history               requireRole(SUPER_ADMIN, DENTIST)             → 201
PATCH  /:id/history/:entryId      requireRole(SUPER_ADMIN, DENTIST)             → 200
DELETE /:id/history/:entryId      requireRole(SUPER_ADMIN, DENTIST)             → 204
```

## Domain rules implemented

- `includeDeleted=true` honored only for `SUPER_ADMIN`; soft-deleted patients are
  404 via GET/PATCH for everyone else (admin can still inspect).
- `""` email normalized to `null` so absent emails never collide on the unique index;
  duplicate email → 409 `EMAIL_IN_USE` (raw Prisma text never leaks).
- Soft delete blocked with 409 `PATIENT_HAS_UNPAID_INVOICES` while any invoice is
  `ISSUED` / `PARTIALLY_PAID`.
- Search `?search=` matches firstName/lastName/email/phone case-insensitively;
  `sortBy=name` orders by `lastName, firstName`; count+findMany in one `$transaction`.
- History entries embed recorder `{ id, fullName, role }`; ownership check guarantees
  entries are only read/written through their patient's path; `category` is immutable
  (omitted from the update schema, so sending it → 400 VALIDATION_ERROR).
- `age` computed server-side from `dateOfBirth` (UTC); `recordDate` defaults to now.

## Verified against Definition of Done

| Check | Result |
| --- | --- |
| CRUD works; list paginates with `meta.total` | ✅ 200/201 + meta |
| `?search=HADDAD` matches case-insensitively (sortBy=name) | ✅ |
| Duplicate patient email → 409 `EMAIL_IN_USE`, no raw Prisma text | ✅ |
| Receptionist `POST /:id/history` → 403 | ✅ |
| Invalid body (future dob / unknown field) → 400 `VALIDATION_ERROR` with field errors | ✅ |
| `GET /patients/:id/history?category=DENTAL` filters correctly | ✅ |
| History PATCH sends `category` → 400 (immutable); valid PATCH → 200 | ✅ |
| History DELETE → 204; second delete → 404 `HISTORY_ENTRY_NOT_FOUND` | ✅ |
| Cross-patient history access (PATCH other patient's entry) → 404 | ✅ |
| DELETE patient as dentist → 403; as receptionist → 204 | ✅ |
| Deleted patient: hidden from list, GET/PATCH → 404 (non-admin), admin can still read | ✅ |
| `npx tsc --noEmit` passes clean; disposable test patients removed afterwards | ✅ |

The codebase is ready for Step 04 (appointments module).

---

# Step 02 — Auth & RBAC Setup (deliverables snapshot)

> Reference copy of everything created/modified to complete
> `docs/execution-plan/02-auth-and-rbac-setup.md`.
> The live code lives under `src/` — **source of truth**. Do not import from
> this folder; it exists only for review/delivery purposes.

## Contents

| Live file                                 | Purpose                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/common/errors/app-error.ts`          | Base `AppError(statusCode, code, message, details)`                                 |
| `src/common/errors/http-error.ts`         | `NotFoundError` / `ConflictError` / `BadRequestError` / `UnprocessableEntityError`  |
| `src/common/errors/auth-error.ts`         | `UnauthorizedError` (401) / `ForbiddenError` (403)                                  |
| `src/common/utils/jwt.ts`                 | Sign/verify access (`HS256`, `{ sub, role, email }`) + refresh tokens, rotation     |
| `src/common/utils/password.ts`            | bcrypt hash/compare via `env.BCRYPT_SALT_ROUNDS`                                    |
| `src/common/utils/envelope.ts`            | `ok()` / `created()` / `paginated()` response helpers                               |
| `src/common/utils/async-handler.ts`       | Wraps async route handlers → global error handler                                   |
| `src/common/middlewares/validate.ts`      | Zod `body`/`query`/`params` validation                                              |
| `src/common/middlewares/auth.ts`          | `requireAuth` — Bearer token → `req.user`                                           |
| `src/common/middlewares/rbac.ts`          | `requireRole(...roles)` / `requireSelfOrRoles`                                      |
| `src/common/middlewares/error-handler.ts` | ZodError→400, AppError→own code, Prisma P2002→409 / P2025→404 / P2034→409, else 500 |
| `src/common/middlewares/not-found.ts`     | 404 envelope for unmatched routes                                                   |
| `src/common/types/common.ts`              | `AuthUser`, `SafeUser`, `ApiMeta`, envelope body types                              |
| `src/common/types/express.d.ts`           | `Request.user?: AuthUser` augmentation                                              |
| `src/modules/auth/dto.ts`                 | register/login/refresh/changePassword Zod schemas (`.strict()`)                     |
| `src/modules/auth/types.ts`               | Auth DTOs + `SAFE_USER_SELECT` (never exposes `passwordHash`)                       |
| `src/modules/auth/service.ts`             | register / login / refresh / me / changePassword business logic                     |
| `src/modules/auth/controller.ts`          | Thin HTTP-only controllers                                                          |
| `src/modules/auth/routes.ts`              | Route table with guards + validation                                                |
| `src/app.ts`                              | Mounted `/auth`, `notFoundHandler` + `errorHandler` last                            |

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

## What was created

### Errors (src/common/errors/)

- app-error.ts — AppError(statusCode, code, message, details) base class
- http-error.ts — NotFoundError 404, ConflictError 409, BadRequestError 400, UnprocessableEntityError 422
- auth-error.ts — UnauthorizedError 401, ForbiddenError 403

  ### Utils (src/common/utils/)

- jwt.ts — HS256 access tokens ({ sub, role, email }) + separate-secret stateless refresh tokens with rotation; typed verifyAccessToken throwing UnauthorizedError ("token expired"/"invalid")
- password.ts — bcrypt hash/compare via env.BCRYPT_SALT_ROUNDS
- envelope.ts — ok(), created(), paginated()
- async-handler.ts — wraps async handlers so rejections hit the error handler

### Middlewares (src/common/middlewares/)

- validate.ts — Zod body/query/params validation, parsed values replace originals
- auth.ts — requireAuth (Bearer → req.user)
- rbac.ts — requireRole(...roles) + requireSelfOrRoles(paramName, ...roles)
- error-handler.ts — ZodError → 400 VALIDATION_ERROR (field errors), AppError → own status/code, Prisma P2002→409 / P2025→404 / P2034→409, else generic 500 INTERNAL_ERROR (stack logged server-side only)
- not-found.ts — 404 envelope

  **Types**: common.ts (AuthUser, SafeUser, ApiMeta), express.d.ts (Request augmentation)

  **Auth module** (src/modules/auth/): dto.ts (.strict() schemas, password min 10 + letter + digit), types.ts (+ SAFE_USER_SELECT projection — passwordHash can't leak), service.ts, controller.ts (thin), routes.ts

  **Wiring**: app.ts now mounts /auth routes, notFoundHandler and errorHandler last.

### Verified against Definition of Done

Check Result

Login with seeded admin creds → { user, accessToken, refreshToken } ✅ 200
GET /me with token / without token ✅ 200 / 401 envelope
POST /refresh → rotated pair ✅ 200
Register as receptionist → 403; as SUPER_ADMIN → 201 safe shape ✅
Duplicate email → 409 EMAIL_IN_USE ✅
Invalid body → 400 VALIDATION_ERROR with field-level errors ✅
Unknown route → 404 envelope ✅
Wrong password → generic 401 (timing-equal, no account enumeration) ✅
Change password 204 → old password rejected → new password logs in ✅
npx tsc --noEmit passes clean; the disposable test user created during testing was removed and the dev server stopped. The codebase is ready for Step 03 (patients module), which can lean on requireRole, validate, paginated(), and the error hierarchy defined here.
