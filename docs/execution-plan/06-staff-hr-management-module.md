# 06 — Staff / HR Management Module

> Goal: manage user accounts (dentists, hygienists, receptionists), weekly working schedules, and time-off. Full write = SUPER_ADMIN; self-edit (profile + own schedule) allowed; others read-only, non-sensitive.

---

## 1. Files to create

```
src/modules/staff/dto.ts       # Zod schemas
src/modules/staff/types.ts     # StaffDTO (safe shape), ScheduleDTO
src/modules/staff/service.ts
src/modules/staff/controller.ts
src/modules/staff/routes.ts
```

(SSO/account-password lives in auth module; here we handle staff LIFECYCLE: create/update/deactivate, schedules, time-off.)

## 2. DB tables involved

`User`, `StaffSchedule`, `TimeOffEntry`.

## 3. Safe user shape (`types.ts`) — reused by auth module

```ts
type StaffDTO = {
  id: string; email: string; fullName: string;
  role: UserRole; position: StaffPosition; phone?: string;
  licenseNumber?: string; bio?: string; isActive: boolean;
  createdAt: Date; updatedAt: Date;
}  // NEVER includes passwordHash
```

## 4. Zod DTOs (`dto.ts`)

```ts
createStaffSchema (body, strict)
{
  email: string().email(), password: passwordSchema,   // min 10, ≥1 letter, ≥1 digit, ≤72 (bcrypt limit)
  fullName: string(1-120),
  role: z.enum(["SUPER_ADMIN","DENTIST","RECEPTIONIST"]),
  position: z.enum(["DENTIST","HYGIENIST","RECEPTIONIST"]),
  phone?: string, licenseNumber?: string, bio?: string(≤ 1000)
}
updateStaffSchema = createStaffSchema.extends({ password omitted }).partial()
   // password changes go via auth:  POST /auth/…/me/password (self)  or dedicated admin reset below
resetPasswordSchema (body)   // SUPER_ADMIN only: { newPassword: passwordSchema }  → POST /:id/reset-password
deactivateSchema (body)      // { reason?: string(≤ 500) }
schedulesUpsertSchema (body) // { schedules: [{ dayOfWeek: 0..6, startTime: HHmm, endTime: HHmm, breaks?: [{start,end}] }].max(7) }
   // refine: startTime < endTime; no overlapping entries per user; breaks within window
timeOffCreateSchema (body)   // { startsAt, endsAt (future, endsAfterStart), reason?: string }
staffIdParamsSchema          // { id: uuid }
listStaffQuerySchema (query) // { page, limit, status?: "ACTIVE"|"INACTIVE", role?: UserRole, position?, search? }
```

## 5. Service (`service.ts`)

| Method | Behavior | Errors |
|---|---|---|
| `list(query)` | `$transaction([count, findMany])` select safe fields; search on fullName/email | — |
| `getbyId(id)` | safe select + `_count` of appointments; include schedule rows & upcoming time-off when `?include=schedule` | 404 |
| `create(dto, actor)` | SUPER_ADMIN guard at route; hash password; disallow duplicate email → 409 `EMAIL_IN_USE`. Cross-checks: if `position ∈ {DENTIST,HYGIENIST}` then `licenseNumber` required (`400 LICENSE_REQUIRED`); if position RECEPTIONIST, role cannot be DENTIST. | 400, 409 |
| `update(id, dto, actor)` | route: SUPER_ADMIN full; non-admin may only update own profile (`requireSelfOrRoles`) → same single implementation, guard decided at route level. Cannot change your own `role` (self-privilege escalation) → `403 ROLE_CHANGE_SELF`; cannot update `isActive` here (dedicated deactivate method); email immutability in this module (email is login identity — changing it is admin-only via `update` with explicit field allowed only for SUPER_ADMIN). | 403, 404, 409 |
| `deactivate(id, dto, actor)` | Sets `isActive = false` (no hard delete — audit trail). Guard: cannot deactivate the LAST active SUPER_ADMIN (`count({ where: { role: SUPER_ADMIN, isActive: true }}) === 1 && target is super admin` → 409 `LAST_ADMIN`). Cannot self-deactivate (403). | 403, 409 |
| `activate(id)` | re-enable account | 404 |
| `resetPassword(id, dto)` | SUPER_ADMIN only route; hash new temp password, return nothing (no plaintext email integration in v1). bcrypt-limited to 72 chars by schema. | 404 |
| `getSchedule(id)` | include schedule (7-day map) | 404 |
| `upsertSchedule(id, dto, actor)` | Replaces the whole week in `$transaction` when SUPER_ADMIN, or when `id === actor.id` (self-service). Validate schedule slot parse/warnings if existing FUTURE appointments fall outside the new working hours — v1: allow warn-only response `{ changes: [ {appointmentsOutside: 2 } ] }` | 403, 404, 400 |
| `listTimeOff(id, from?)` | filter startsAt ≥ provided or now | 404 |
| `createTimeOff(id, dto, actor)` | SUPER_ADMIN (any staff) or self; future-dated only + Sanitize: reject if overlaps existing time-off entry (409). Future-open appointments within window returned as `affectedAppointments` (info only, not auto-cancelled). | 404, 409 |

## 6. Controller & Routes

```
GET   /api/v1/staff                          requireAuth (admin/receptionist/dentist read directory), validate({ query })   → list
POST  /api/v1/staff                          requireRole(SUPER_ADMIN), validate({ body: create })                            → 201
GET   /api/v1/staff/:id                      requireAuth, validate({ params })                                               → 200
PATCH /api/v1/staff/:id                      requireAuth, requireSelfOrRoles("id", SUPER_ADMIN), validate                     → 200
POST  /api/v1/staff/:id/deactivate           requireRole(SUPER_ADMIN), validate({ body })                                     → 200
POST  /api/v1/staff/:id/deactivate           requireRole(SUPER_ADMIN), validate                                              → 200
POST  /api/v1/staff/:id/activate             requireRole(SUPER_ADMIN), validate({})                                           → 200
POST  /api/v1/staff/:id/reset-password       requireRole(SUPER_ADMIN), validate({ body })                                     → 204
GET   /api/v1/staff/:id/schedules            requireAuth, validate({ params })                                                → 200
PUT   /api/v1/staff/:id/schedules            requireAuth, requireSelfOrRoles("id", SUPER_ADMIN), validate({ body })            → 200
GET   /api/v1/staff/:id/time-off             requireAuth, validate({ params, query? })                                        → list
POST  /api/v1/staff/:id/time-off             requireAuth, requireSelfOrRoles("id", SUPER_ADMIN), validate({ body })            → 201
```

## 7. RBAC recap

| Endpoint group | ADMIN | DENTIST | RECEPTIONIST |
|---|---|---|---|
| staff directory (list/get) | ✅ | ✅ | ✅ |
| create staff / reset password / activate | ✅ | ❌ | ❌ |
| deactivate | ✅ (not self, not last admin) | ❌ | ❌ |
| edit own profile | ✅ (any) | ✅ | ✅ |
| edit other profile | ✅ | ❌ | ❌ |
| schedules read | ✅ | ✅ | ✅ |
| schedules write | ✅ (all) | self | self |
| time-off write | ✅ (all) | self | self |

## 8. Definition of done

- [ ] Non-admin creating staff → 403.
- [ ] Creating dentist/hygienist without licence → 400 `LICENSE_REQUIRED`; invalid `role ↔ position` mismatch combos rejected.
- [ ] Duplicate email → 409 `EMAIL_IN_USE`.
- [ ] PUT schedules with 5 weekday rows persists 7-day map; self-edit allowed; editing others → 403 except admin.
- [ ] Deactivating last active super admin → 409 `LAST_ADMIN` (seed a second admin or block).
- [ ] Time-off overlapping an existing entry → 409; time-off entity for dentist shows in `appointments/availability` (integration — plan 04 reads `TimeOffEntry`).
- [ ] Staff list never contains `passwordHash` anywhere (verified via integration test / manual curl).
