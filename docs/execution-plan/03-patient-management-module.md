# 03 — Patient Management Module

> Goal: patient profiles CRUD + medical/dental history. Roles: all can read/create/update; history write limited to dentist + admin; soft-delete limited to admin + receptionist.

---

## 1. Files to create

```
src/modules/patients/dto.ts       # Zod schemas
src/modules/patients/types.ts     # PatientDTO, HistoryEntryDTO, mappers
src/modules/patients/service.ts
src/modules/patients/controller.ts
src/modules/patients/routes.ts
```

## 2. DB tables involved

`Patient` (main profile), `MedicalRecordEntry` (category `MEDICAL` | `DENTAL`), `User` (audit reference `createdBy`).

## 3. Zod DTOs (`dto.ts`)

```ts
createPatientSchema (body, strict)
{
  firstName: string(1-80), lastName: string(1-80),
  dateOfBirth: iso date string → validates age ≥ 0 & not future (refine),
  gender: z.enum(["MALE","FEMALE","OTHER"]),
  email: z.string().email().optional().or(z.literal("")),   // nullable unique
  phone: string regex ^\+?[0-9().\-\s]{7,20}$/,
  address?: string(≤ 400),
  emergencyContact?: { name: string, phone: string, relation: string },
  insuranceProvider?: string, insurancePolicyNo?: string,
  allergies?: string(≤ 1000), chronicConditions?: string(≤ 1000), notes?: string(≤ 2000)
}

updatePatientSchema = createPatientSchema.partial()   // but keeps same string limits

createHistoryEntrySchema (body)
{ category: z.enum(["MEDICAL","DENTAL"]), title: string(1-160), description: string(1-4000), recordDate?: datetime (default now) }

updateHistoryEntrySchema = createHistoryEntrySchema.omit({ category: true }).partial() -- category immutable

patientIdParamsSchema (params)        { id: z.string().uuid() }
historyEntryIdParamsSchema (params)   { id: uuid, entryId: uuid }
listPatientsQuerySchema (query)
{
  page: coerce.number().int().min(1).default(1),
  limit: coerce.number().int().min(1).max(100).default(20),
  search?: string,                       // matches firstName/lastName/email/phone (case-insensitive)
  sortBy: z.enum(["name","createdAt"]).default("createdAt"),
  order: z.enum(["asc","desc"]).default("desc"),
  includeDeleted: z.enum(["true","false"]).default("false") // honored for SUPER_ADMIN only
}
```

## 4. Public shape (`types.ts`)

`PatientDTO` excludes nothing sensitive (patients have no auth data) but includes computed `age`. `HistoryEntryDTO` embeds recorder `{ id, fullName, role }`. Mapper helpers exported for controllers.

## 5. Service (`service.ts`)

| Method | Behavior / queries | Errors |
|---|---|---|
| `list(query, actor)` | `prisma.$transaction([count, findMany({ include: { createdBy: select id/fullName } })])` — single round trip pair, no N+1. `includeDeleted` honored only for SUPER_ADMIN; search uses `OR` with `contains/ignoreCase`. Deterministic ordering via sort map. | — |
| `getById(id)` | `findUnique` incl. counts (`_count` history/appointments) | 404 `PATIENT_NOT_FOUND` |
| `create(dto, actor)` | `create({ ...dto, emergencyContact: dto.emergencyContact ?? Prisma.DbNull, createdById: actor.id })`; Prisma `P2002` on unique email → 409 `EMAIL_IN_USE`. Times are resolved to `new Date(dto.dateOfBirth)`. | 409 |
| `update(id, dto, actor)` | `getById` first (strict), then `update`. Same unique-email conflict mapping. | 404, 409 |
| `softDelete(id, actor)` | Sets `isDeleted = true`; guard: block if patient has any invoice with status not in (PAID, VOID, DRAFT?) → `ConflictError("PATIENT_HAS_UNPAID_INVOICES")`. | 404, 409 |
| `listHistory(patientId, category?, page)` | `findMany orderBy recordDate desc`, include recorder minimal select; transaction with count. Ensure the patient exists (cheap existence check via the count fetch). | 404 |
| `addHistoryEntry(patientId, dto, actor)` | Verify patient exists & not deleted → `create` | 404 |
| `updateHistoryEntry(patientId, entryId, dto, actor)` | Verify entry belongs to patient (`findFirst` where both ids) → update | 404, 400 |
| `deleteHistoryEntry(patientId, entryId)` | same ownership check → delete | 404 |

## 6. Controller (`controller.ts`)

Thin wrappers: parse → service → envelope. Map `Validation` results onto `zod` errors via validate middleware only. Health check for module error codes uses `NotFoundError`/`ConflictError` from `common/errors`.

## 7. Routes (`routes.ts`)

```
GET    /api/v1/patients                        requireAuth, validate({ query })                                  → list
POST   /api/v1/patients                        requireAuth, validate({ body: createPatientSchema })              → 201, getPatient
GET    /api/v1/patients/:id                    requireAuth, validate({ params })                                  → getPatient
PATCH  /api/v1/patients/:id                    requireAuth, validate({ params, body: updatePatientSchema })       → 200
DELETE /api/v1/patients/:id                    requireAuth, requireRole(SUPER_ADMIN, RECEPTIONIST), validate      → 204
GET    /api/v1/patients/:id/history            requireAuth, validate({ params, query: { category?, page, limit }}) → list
POST   /api/v1/patients/:id/history            requireAuth, requireRole(SUPER_ADMIN, DENTIST), validate(body gen)  → 201
PATCH  /api/v1/patients/:id/history/:entryId   requireAuth, requireRole(SUPER_ADMIN, DENTIST), validate            → 200
DELETE /api/v1/patients/:id/history/:entryId   requireAuth, requireRole(SUPER_ADMIN, DENTIST), validate            → 204
```

## 8. RBAC interplay (matrix recap)

| Endpoint | ADMIN | DENTIST | RECEPTIONIST |
|---|---|---|---|
| `GET /patients(/:id)` | ✅ | ✅ | ✅ |
| `POST/PATCH /patients` | ✅ | ✅ | ✅ |
| `DELETE /patients/:id` (soft) | ✅ | ❌ | ✅ |
| History `GET` | ✅ | ✅ | ✅ |
| History `POST/PATCH/DELETE` | ✅ | ✅ | ❌ |

## 9. Definition of done

- [ ] CRUD works; `GET list` paginates with `meta.total`.
- [ ] Query `?search=smi` matches names/phone case-insensitively.
- [ ] Duplicate patient email → 409 `EMAIL_IN_USE` (no raw Prisma text).
- [ ] Receptionist `POST /:id/history` → 403.
- [ ] Deleting patient with unpaid invoice → 409 `PATIENT_HAS_UNPAID_INVOICES`.
- [ ] `GET /patients/:id/history?category=DENTAL` filters correctly.
