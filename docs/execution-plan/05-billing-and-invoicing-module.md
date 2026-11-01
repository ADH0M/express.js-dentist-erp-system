# 05 — Billing & Invoicing Module

> Goal: invoice generation (from appointment or ad-hoc), item line computation, payment recording with ledger math, receipt retrieval, revenue report. Finance write = ADMIN + RECEPTIONIST; DENTIST read-only.

---

## 1. Files to create

```
src/modules/billing/dto.ts
src/modules/billing/types.ts
src/modules/billing/service.ts
src/modules/billing/controller.ts
src/modules/billing/receipt-template.ts   # plain HTML receipt builder (no external template engine)
src/modules/billing/routes.ts
```

## 2. DB tables involved

`Invoice`, `InvoiceItem`, `Payment`, plus reads of `Treatment`, `Patient`, `User` (audit), `Appointment`.

## 3. Money rules (single source of truth in `service.ts`)

```ts
calcTotals({ items, discount, taxRate }) {
  subtotal  = Σ(lineTotal)                    // lineTotal = round2(quantity × unitPrice)
  total     = round2(subtotal − discount + round2((subtotal − discount) × taxRatePercent))
}
```

- ALL computations use a cents-safe decimal helper (`round2` on `Prisma.Decimal` ops) — never raw JS floats end-to-end.
- Invoice holds **snapshots**; later edits to `Treatment.defaultPrice` don't mutate old invoices.
- `amountPaid` transitions: `0 → PARTIALLY_PAID (0 < paid < total) → PAID (paid == total)`.
- `InvoiceStatus` machine:
  - `DRAFT → ISSUED → PARTIALLY_PAID → PAID` (natural path when issued with no payment first).
  - `VOID` allowed only from `DRAFT`/`ISSUED`/`PARTIALLY_PAID` **and** requires zero payments recorded → refunds must be manual/offledger note in v1 (documented).
- `invoiceNumber = INV-<year>-<6-digit sequence>` generated inside the creation transaction using `count` + retry-on-unique (`P2002`) to be robust under concurrency.

## 4. Zod DTOs (`dto.ts`)

```ts
invoiceItemSchema (body strict)
{ treatmentId?: uuid, description: string(1-160), quantity: int(1-99), unitPrice: number ≥ 0 → Decimal }

createInvoiceSchema (body)
{
  patientId: uuid,
  appointmentId?: uuid,     // optional linkage; 1:1 unique
  dueDate?: date string (default today + 14d),
  discount?: number ≥ 0, taxRate?: number 0..1 (as fraction, e.g. 0.20),
  notes?: string,
  items: z.array(invoiceItemSchema).min(1).max(50),
  issueNow?: boolean default false     // DRAFT vs ISSUED
}

updateInvoiceSchema = createInvoiceSchema.partial().omit({ appointmentId: true, patientId: true })
  // only allowed while status === DRAFT

createPaymentSchema (body)
{ amount: number > 0, method: z.enum(PaymentMethod), reference?: string, paidAt?: datetime }

listInvoicesQuerySchema (query)
{ page, limit, patientId?, status?: InvoiceStatus, from?, to?, minAmount?, maxAmount?,
  sortBy: enum["issuedAt","dueDate","total"].default("issuedAt"), order }
addItemsToDraftSchema = { items: z.array(invoiceItemSchema).min(1) }
changeStatus         (implicit) POST /:id/{issue|void} need no body — body validated as {} (z.object({}).strict())
```

## 5. Service (`service.ts`)

| Method | Behavior | Errors |
|---|---|---|
| `list(query)` | `$transaction([count, findMany include { patient minimal, payments: select id/amount/method }])` | — |
| `getById(id)` | include items (+treatment name), payments (+recorder name), patient, appointment | 404 |
| `create(dto, actor)` | `$transaction`: ① patient exists/not deleted; ② if `appointmentId` → ensure exists, ensure `appointment.patientId === dto.patientId`, ensure no invoice attached yet (`unique` + explicit check for nicer error `409 INVOICE_ALREADY_FOR_APPOINTMENT`); ③ for item `treatmentId` → verify exists + catalog name preview; ④ compute totals; ⑤ identify `status = DRAFT` or `ISSUED`; ⑥ generate invoiceNumber; ⑦ `invoice.create({ items: { create: [...] } })` nested write (single insert round-trip). | 404, 409, 400 |
| `updateDraft(id, dto)` | Only when status DRAFT, else `409 INVOICE_NOT_MODIFIABLE`; recompute totals from merged items | 404, 409 |
| `issue(id)` | DRAFT → ISSUED (sets `issuedAt=now` if absent). Also MOVES `AppointmentStatus` unchanged (billing is independent). | 404, 409 |
| `void(id)` | DRAFT/ISSUED → VOID; `payments.count() > 0` → 409 `INVOICE_HAS_PAYMENTS` | 404, 409 |
| `addPayment(id, dto, actor)` | `$transaction`: fetch invoice with `amountPaid/total/status`; reject if `VOID` → 409; ensure `status` ≥ ISSUED (draft pay → auto-issue first? → v1 rejects with `INVOICE_NOT_PAYABLE`); clamp: overpay → 409 `PAYMENT_EXCEEDS_BALANCE` (`remaining = total − amountPaid`); create Payment; `amountPaid += amount`; recompute status (`PARTIALLY_PAID`/`PAID`); if now PAID, no side effects beyond status. | 404, 409 |
| `payments(id)` | list ledger, desc by paidAt | 404 |
| `receiptHtml(id)` | build simple semantic HTML (clinic header from env `CLINIC_NAME?`, invoice meta, item table, payments table, totals, status footer) returned as `text/html`. Read allowed for all roles (as it's patient-facing data but read-only) | 404, 409 (VOID?) → still render with VOID watermark |
| `revenueReport(query)` | params `from?/to? (default current month), groupBy: day|month`; aggregations: `payments.aggregate(_sum amount)` in window; `invoice.count` by status; `groupby on paidAt truncation` via `prisma.payment.groupBy` + JS bucketing (timezone-safe using UTC day) | — |

## 6. Controller & Routes

```
GET    /api/v1/billing/invoices                 requireAuth, validate({ query })                        → list
POST   /api/v1/billing/invoices                 requireRole(ADMIN, RECEPTIONIST), validate({ body })    → 201
GET    /api/v1/billing/invoices/:id             requireAuth, validate({ params })                       → 200
PATCH  /api/v1/billing/invoices/:id             requireRole(ADMIN, RECEPTIONIST), validate              → 200 (draft edit)
POST   /api/v1/billing/invoices/:id/issue       requireRole(ADMIN, RECEPTIONIST), validate({})          → 200
POST   /api/v1/billing/invoices/:id/void        requireRole(ADMIN),                validate({})         → 200
POST   /api/v1/billing/invoices/:id/payments    requireRole(ADMIN, RECEPTIONIST), validate({ body })    → 201
GET    /api/v1/billing/invoices/:id/payments    requireAuth, validate({ params })                       → list
GET    /api/v1/billing/invoices/:id/receipt     requireAuth, validate({ params })                       → HTML
GET    /api/v1/billing/revenue-report           requireRole(ADMIN, RECEPTIONIST), validate({ query })   → report
```

## 7. RBAC recap

| Endpoint group | ADMIN | DENTIST | RECEPTIONIST |
|---|---|---|---|
| list/get invoice | ✅ | ✅ | ✅ |
| create/update draft, issue | ✅ | ❌ | ✅ |
| void | ✅ | ❌ | ❌ |
| add payment | ✅ | ❌ | ✅ |
| receipts / revenue report | ✅ | ✅ (read) | ✅ |

## 8. Definition of done

- [ ] POST invoice with 2 items → correct `subtotal/total` with discount+tax math (checked with seeded values).
- [ ] Attaching one invoice to an appointment twice → 409 `INVOICE_ALREADY_FOR_APPOINTMENT`.
- [ ] Overpay attempt → 409 `PAYMENT_EXCEEDS_BALANCE` (ledger unchanged).
- [ ] Two payments fully clearing a balance drive `status: ISSUED → PARTIALLY_PAID → PAID`.
- [ ] VOID with payments → 409; receipt renders valid HTML with clinic header and totals.
- [ ] Revenue report groups cash-ins by month correctly.
- [ ] Dentist attempting `POST /payments` → 403.
