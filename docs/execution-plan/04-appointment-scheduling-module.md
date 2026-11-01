# 04 — Appointment Scheduling Module

> Goal: slot booking with conflict/availability checks, status lifecycle. All roles book; dentists may modify/complete only their own appointments; receptionist/admin full control.

---

## 1. Files to create

```
src/modules/appointments/dto.ts
src/modules/appointments/types.ts
src/modules/appointments/service.ts
src/modules/appointments/controller.ts
src/modules/appointments/routes.ts
src/common/utils/time.ts     # overlap math, clinic-day boundaries helpers
```

## 2. DB tables involved

`Appointment` (+ `Patient`, `User` dentist, `Treatment`, `StaffSchedule`, `TimeOffEntry`, `Invoice` for linkage).

## 3. Zod DTOs (`dto.ts`)

```ts
createAppointmentSchema (body, strict)
{
  patientId: uuid, dentistId: uuid,
  treatmentId?: uuid,              // defaults duration from catalog if omitted
  scheduledAt: z.coerce.date(),    // ISO-8601; must be future (refine)
  durationMinutes: int 10..240 default 30,
  notes?: string(≤ 1000)
}

updateAppointmentSchema = createAppointmentSchema.partial().omit({ patientId: true })

changeStatusSchema (body)
{ status: z.enum(["CONFIRMED","COMPLETED","CANCELLED","NO_SHOW"]), cancelReason?: string(≤ 500) }

listAppointmentsQuerySchema (query)
{
  page, limit (defaults 1 / 20, max 100),
  patientId?: uuid, dentistId?: uuid, status?: AppointmentStatus,
  from?: z.coerce.date(), to?: z.coerce.date(),          // filter scheduledAt window
  sortBy: z.enum(["scheduledAt","createdAt"]).default("scheduledAt"),
  order: z.enum(["asc","desc"]).default("asc")
}

availabilityQuerySchema (query)
{ dentistId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }

appointmentIdParamsSchema: { id: uuid }
```

## 4. Service (`service.ts`) — the scheduling brain

Key invariants (enforced inside transactions):

- **Overlap rule**: for dentist D and window `[start, end)`, no existing appointment with status in (`SCHEDULED`, `CONFIRMED`) overlaps `[start, end)`.
- **Clinic-hours rule**: slot must fit within the dentist's `StaffSchedule` row for `date.getDay()` and NOT intersect any configured break.
- **Time-off rule**: no `TimeOffEntry` for dentist overlapping the window.
- **Status lifecycle** (`transition` map, `BadRequestError` on invalid):
  ```ts
  SCHEDULED  → CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
  CONFIRMED  → COMPLETED | CANCELLED | NO_SHOW
  COMPLETED  → (terminal)
  CANCELLED  → (terminal)
  NO_SHOW    → (terminal)
  ```
- Transition guards: `COMPLETED` requires patient/dentist exist and status currently active; `CANCELLED` requires a `cancelReason` (Zod `.refine` or service check); past `scheduledAt` cannot be `CONFIRMED`.

| Method | Behavior | Errors |
|---|---|---|
| `list(query, actor)` | `include { patient: {select…}, dentist: {select…}, treatment: true }` single query + count in `$transaction`. DENTIST default scope: if `query.dentistId` omitted → force `dentistId = actor.id`. Others see all. | — |
| `getById(id)` | includes patient/dentist/treatment minimal fields | 404 |
| `create(dto, actor)` | In `$transaction("Serializable")`: ① patient exists & not deleted; ② dentist exists, active, role DENTIST; ③ treatment exists (set `durationMinutes` default if body omitted); ④ re-fetch overlapping appointments for dentist (timestamp overlap query) → 409 `APPOINTMENT_CONFLICT` with conflicting slot `data`; ⑤ check StaffSchedule & TimeOff → 409/422 `OUTSIDE_WORKING_HOURS` / `DENTIST_ON_LEAVE`; ⑥ `create` with `createdById = actor.id`. | 404, 409, 422 |
| `update(id, dto, actor)` | Strict fetch; ownership check for DENTIST (`appointment.dentistId === actor.id` → else 403). If `scheduledAt`/`dentistId`/`durationMinutes` changed → re-run full conflict workflow (treat as rebook). Past or terminal-status appointment (COMPLETED/CANCELLED/NO_SHOW) is frozen → 400 `APPOINTMENT_NOT_MODIFIABLE`. | 403, 404, 409, 400 |
| `changeStatus(id, dto, actor)` | Validate transition map + scope (RECEPTIONIST may set `CANCELLED`/`NO_SHOW` only; DENTIST only on own). Return updated incl. dentist/patient summary. | 400 `INVALID_STATUS_TRANSITION`, 403, 404 |
| `availability(dentistId, date)` | Pure read: fetch schedule rows, time-off, booked appointments for the day; generate interval list `[ { start: "09:00", end: "10:00", available: false }, …]` in 30-min steps bounded by working hours; steps also merge into contiguous blocks in response `data.blocks`. | 404 dentist |
| `delete` | **Not offered.** Cancelling/to NO_SHOW preserves history (clinic audit requirement). | — |

Overlap SQL pattern (Prisma): `where: { dentistId, status: { in: ["SCHEDULED","CONFIRMED"] }, scheduledAt: { lt: windowEnd }, AND: { OR: [...] } }` computed as `scheduledAt + duration > windowStart` — carried out with raw interval compare in JS from fetched rows for the day (bounded set) to keep Prisma compatibility; the day's rows are small (< 100).

## 5. Controller & Routes

```
GET  /api/v1/appointments              requireAuth, validate({ query })                    → list (dentist auto-scoped)
POST /api/v1/appointments              requireAuth, validate({ body: create })             → 201
GET  /api/v1/appointments/:id          requireAuth, validate({ params })                   → 200
PATCH /api/v1/appointments/:id         requireAuth, validate({ params, body: update })     → 200
POST /api/v1/appointments/:id/status   requireAuth, validate({ params, body: status })     → 200
GET  /api/v1/appointments/availability requireAuth, requireRole(ADMIN, DENTIST, RECEPTIONIST), validate({ query })
```

Conflict envelope example:

```json
{ "success": false, "error": { "code": "APPOINTMENT_CONFLICT",
  "message": "Dr. Ivanov is not available in the requested time slot.",
  "details": { "conflict": { "id": "...", "scheduledAt": "2026-11-02T10:00:00Z", "durationMinutes": 45 } } } }
```

## 6. RBAC recap

| Endpoint | ADMIN | DENTIST | RECEPTIONIST |
|---|---|---|---|
| list/get/availability | ✅ | ✅ (auto-scoped) | ✅ |
| book (POST) | ✅ | ✅ | ✅ |
| reschedule (PATCH) | ✅ | own only | ✅ |
| status CONFIRM/COMPLETED/NO_SHOW | ✅ | own only | CONFIRM only |
| status CANCELLED | ✅ | own only | ✅ |

## 7. Definition of done

- [ ] Booking inside working hours with a free slot → 201.
- [ ] Overlap attempt → 409 with conflicting slot details; no partial transaction writes.
- [ ] Slot outside `StaffSchedule` or during time-off → 422 with explicit code.
- [ ] Invalid transition (`COMPLETED → CONFIRMED`) → 400 `INVALID_STATUS_TRANSITION`.
- [ ] Dentist cannot PATCH someone else's appointment → 403.
- [ ] `GET /availability?dentistId&date=2026-11-02` returns step timeline with breaks excluded.
