# 00 — Architecture Overview

> Dentist ERP System — monolithic REST API. Express 4 + TypeScript (strict) + Prisma + PostgreSQL + Zod + JWT.

---

## 1. High-Level Design

- **Monolith, modular by feature (DDD-lite).** Each business domain is a self-contained module under `src/modules/`, owning its routes, controller, service, DTOs (Zod), and types.
- **Layering rule (strict):**
  `Route → (auth guard → rbac guard → zod validate) → Controller → Service → Prisma`
  - **Controller**: HTTP only. Thin. Calls services, sets status codes, returns envelopes. No business logic, no Prisma calls.
  - **Service**: All business logic + data access. Only layer allowed to call Prisma. Throws `AppError` subclasses.
  - **Middleware**: cross-cutting concerns (auth, RBAC, validation, error handling).
- **REST API versioned under `/api/v1`.** All responses are JSON envelopes.

## 2. Folder Structure (final state)

```
dentist-erp-system/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── .env / .env.example
├── prisma/
│   └── schema.prisma
├── docs/
│   └── execution-plan/          # this folder
└── src/
    ├── server.ts                # entry: starts HTTP server
    ├── app.ts                   # express app assembly, module registration
    ├── config/
    │   ├── env.ts               # Zod-validated env vars (throws at boot)
    │   └── prisma.ts            # singleton PrismaClient instance
    ├── common/
    │   ├── errors/
    │   │   ├── app-error.ts          # base AppError(status, code, details)
    │   │   ├── http-error.ts         # NotFoundError, BadRequestError, ...
    │   │   └── auth-error.ts         # UnauthorizedError, ForbiddenError
    │   ├── middlewares/
    │   │   ├── error-handler.ts      # global error handler (last)
    │   │   ├── not-found.ts          # 404 catcher
    │   │   ├── auth.ts               # requireAuth (JWT verify)
    │   │   ├── rbac.ts               # requireRole(...roles), requireSelfOrRole
    │   │   └── validate.ts           # validates body/query/params via Zod schemas
    │   ├── utils/
    │   │   ├── jwt.ts                # sign/verify access+refresh tokens
    │   │   ├── password.ts           # hash/compare (bcrypt)
    │   │   ├── pagination.ts         # shared page/limit types + helpers
    │   │   ├── envelope.ts           # ok(), created(), paginated() helpers
    │   │   └── async-handler.ts      # wraps async route handlers
    │   └── types/
    │       ├── express.d.ts          # augment Request: user?: AuthUser
    │       └── common.ts             # ApiMeta, Cursor/Pagination types
    └── modules/
        ├── auth/
        │   ├── routes.ts  controller.ts  service.ts  dto.ts  types.ts
        ├── patients/
        │   ├── routes.ts  controller.ts  service.ts  dto.ts  types.ts
        ├── appointments/
        │   ├── routes.ts  controller.ts  service.ts  dto.ts  types.ts
        ├── billing/
        │   ├── routes.ts  controller.ts  service.ts  dto.ts  types.ts
        │   └── receipt-month.handlebars (template or HTML builder)
        └── staff/
            ├── routes.ts  controller.ts  service.ts  dto.ts  types.ts
```

## 3. Express App Assembly (`app.ts`)

Mount order (security middleware first, error handler last):

1. `helmet()`, `cors({ origin: env.CORS_ORIGIN, credentials: true })`, `express.json({ limit: '10kb' })`, `express.urlencoded`, `morgan('dev' | 'combined')`
2. `app.use(`${env.API_PREFIX}/auth`, authRoutes)`
3. `app.use(`${env.API_PREFIX}/patients`, requireAuth, patientRoutes)` — module route files internally apply per-route RBAC + validation.
4. Same for `/appointments`, `/billing` (invoices, payments), `/staff`
5. `app.use(notFoundHandler)`
6. `app.use(errorHandler)` — **must be last**

## 4. Database Schema Design (ER summary)

Entities & relations:

```
User            (staff accounts; RBAC subject)
 1─n StaffSchedule        (weekly working hours per user)
 1─n TimeOffEntry         (vacation/sick days)
 1─n Appointment (as dentist)
 1─n MedicalRecordEntry (as recorder)

Patient         (no login account; clinic-side profile)
 1─n MedicalRecordEntry   (medical & dental history)
 1─n Appointment
 1─n Invoice

Treatment       (service catalog: cleaning, filling, extraction...)
 1─n Appointment
 1─n InvoiceItem

Appointment     (patient × dentist × optional treatment, slot in time)
 1─0..1 Invoice      ← invoice may be generated from an appointment

Invoice         (billing document; denormalized money snapshot)
 1─n InvoiceItem
 1─n Payment
```

Prisma enums:

| Enum | Values |
|---|---|
| `UserRole` | `SUPER_ADMIN`, `DENTIST`, `RECEPTIONIST` |
| `StaffPosition` | `DENTIST`, `HYGIENIST`, `RECEPTIONIST` |
| `AppointmentStatus` | `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| `InvoiceStatus` | `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID` |
| `PaymentMethod` | `CASH`, `CARD`, `BANK_TRANSFER`, `INSURANCE` |
| `RecordCategory` | `MEDICAL`, `DENTAL` |

Money policy: **store monetary amounts as `Decimal(12,2)`** (Prisma `Decimal`, exposed as string in DTOs). Invoice totals are **snapshots** computed at issue time — payments never mutate item prices; `amountPaid` on Invoice is maintained transactionally.

Idempotency & integrity: unique constraints on `User.email`, `Patient.email` (nullable, unique), `Invoice.invoiceNumber` (generated per year: `INV-2026-000001`), composite unique `@@unique([dentistId, scheduledAt])` on Appointment guarded by an application-level overlap check (see plan 04).

## 5. Response Envelope (canonical)

```ts
// success
{ "success": true, "data": <payload>, "meta"?: { "page": 1, "limit": 20, "total": 84, "totalPages": 5 } }
// error
{ "success": false, "error": { "code": "APPOINTMENT_CONFLICT", "message": "The selected slot is no longer available.", "details": { "fieldErrors": [...] } } }
```

Error codes are stable machine strings (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, plus domain codes like `APPOINTMENT_CONFLICT`, `INVOICE_FULLY_PAID`).

## 6. RBAC Matrix

Roles: `SUPER_ADMIN`, `DENTIST`, `RECEPTIONIST`. JWT payload: `{ sub, role, email, iat, exp, iss }`.
`SUPER_ADMIN` is a superset of everything; matrix lists it only where behavior differs ("write on staff" etc.).

| Resource / Action | SUPER_ADMIN | DENTIST | RECEPTIONIST |
|---|---|---|---|
| **Auth**: login, refresh, me, change own password | ✅ | ✅ | ✅ |
| **Auth**: register new user | ✅ (only role allowed) | ❌ | ❌ |
| **Patients**: list/read | ✅ | ✅ | ✅ |
| **Patients**: create/update | ✅ | ✅ | ✅ |
| **Patients**: delete (soft) | ✅ | ❌ | ✅ |
| **Patients**: medical history read | ✅ | ✅ | ✅ |
| **Patients**: medical history write | ✅ | ✅ | ❌ |
| **Appointments**: list/read (all, own for dentist via filter default) | ✅ | ✅ (scoped: own unless `dentistId` query) | ✅ |
| **Appointments**: book | ✅ | ✅ | ✅ |
| **Appointments**: update slot | ✅ | ✅ (own only) | ✅ |
| **Appointments**: change status (complete/cancel/no-show) | ✅ | ✅ (own only; complete/cancel) | ✅ (cancel only) |
| **Billing**: invoices create/update/void | ✅ | ❌ | ✅ |
| **Billing**: invoices read, receipts, revenue report | ✅ | ✅ (read-only) | ✅ |
| **Billing**: payments record | ✅ | ❌ | ✅ |
| **Staff**: list/read schedules | ✅ | ✅ (read-only) | ✅ (read-only) |
| **Staff**: create user, update role/position, deactivate | ✅ | ❌ | ❌ |
| **Staff**: edit own profile / schedules | self only | self only | self only |

Enforcement: two middleware factories —
- `requireAuth` — verifies JWT, attaches `req.user`.
- `requireRole(...allowed: UserRole[])` — 403 if `req.user.role` missing from list.
- `requireResourceAccess` — module-level ownership scoping (e.g., dentist editing someone else's appointment → 403).

## 7. Cross-Cutting Conventions

- **Dates**: store UTC timestamps; input slots use ISO-8601 `datetime` in request bodies. Working-hours rules evaluated server-side using clinic timezone from env (`TZ`, default `UTC`).
- **Pagination**: `?page=1&limit=20` (max 100) + optional `?sortBy&order`. `meta.total` via `prisma.$transaction([count, findMany])`.
- **Transactions**: appointment booking, invoice+items creation, and payment posting wrapped in `prisma.$transaction` with `Serializable`/optimistic conflict handling where money or slot state changes.
- **No raw DB errors to client**: `errorHandler` maps known Prisma errors (`P2002` → `CONFLICT`, `P2025` → `NOT_FOUND`) to safe envelopes; everything unmatched → generic 500 `INTERNAL_ERROR` (stack logged server-side only).
- **Zod everywhere**: body, query, and path params validated by module `dto.ts` schemas via `validate()` middleware; parsed values replace originals on `req` (typed as `req.body`, `req.query`).

## 8. API Surface Summary (v1)

| Prefix | Module | Key endpoints |
|---|---|---|
| `/api/v1/auth` | plan 02 | `POST /register`, `POST /login`, `POST /refresh`, `GET /me`, `PATCH /me/password` |
| `/api/v1/patients` | plan 03 | CRUD `/`, `GET/:id`, soft-delete, `/:id/history` (GET/POST), `/:id/history/:entryId` (PATCH/DELETE) |
| `/api/v1/appointments` | plan 04 | CRUD `/`, `GET/:id`, `POST /:id/status`, `GET /availability` |
| `/api/v1/billing` | plan 05 | `/invoices` CRUD, `POST /invoices/:id/void`, `POST /invoices/:id/payments`, `GET /invoices/:id/receipt`, `GET /revenue-report` |
| `/api/v1/staff` | plan 06 | CRUD `/`, `GET/:id`, `PATCH /:id`, `POST /:id/deactivate`, `/:id/schedules` (PUT to upsert week), `/:id/time-off` |
