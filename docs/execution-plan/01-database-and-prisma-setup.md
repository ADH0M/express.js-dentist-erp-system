# 01 — Database & Prisma Setup

> Goal: install Prisma, define the full schema, run the first migration, verify the singleton client, and seed baseline data.

---

## 1. Files to create / modify

```
prisma/schema.prisma          # full schema (below)
prisma/seed.ts                # baseline seed (super admin + treatment catalog)
src/config/env.ts             # Zod-validated environment config
src/config/prisma.ts          # singleton PrismaClient
```

Install commands:

```bash
npm install
npx prisma init --datasource-provider postgresql   # already covered: .env DATABASE_URL
npx prisma migrate dev --name init
npm run prisma:generate
npm run prisma:seed
```

## 2. `prisma/schema.prisma` (authoritative)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Enums ----------

enum UserRole {
  SUPER_ADMIN
  DENTIST
  RECEPTIONIST
}

enum StaffPosition {
  DENTIST
  HYGIENIST
  RECEPTIONIST
}

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum InvoiceStatus {
  DRAFT
  ISSUED
  PARTIALLY_PAID
  PAID
  VOID
}

enum PaymentMethod {
  CASH
  CARD
  BANK_TRANSFER
  INSURANCE
}

enum RecordCategory {
  MEDICAL
  DENTAL
}

// ---------- Staff / HR ----------

model User {
  id            String        @id @default(uuid()) @db.Uuid
  email         String        @unique
  passwordHash  String
  fullName      String
  role          UserRole      @default(RECEPTIONIST)
  position      StaffPosition @default(RECEPTIONIST)
  phone         String?
  licenseNumber String?       // dentists/hygienists
  bio           String?
  isActive      Boolean       @default(true)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  schedules          StaffSchedule[]
  timeOffEntries     TimeOffEntry[]
  appointments       Appointment[]       @relation("AppointmentDentist")
  createdAppointments Appointment[]      @relation("AppointmentCreator")
  recordedRecords    MedicalRecordEntry[]
  recordedPayments   Payment[]
  createdInvoices    Invoice[]

  @@index([role, isActive])
}

model StaffSchedule {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  dayOfWeek Int      // 0 = Sunday .. 6 = Saturday
  startTime String   // "HH:mm" local clinic time
  endTime   String   // "HH:mm"
  breaks    Json?    // [{ "start": "13:00", "end": "14:00" }]

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, dayOfWeek])
  @@index([userId])
}

model TimeOffEntry {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  startsAt  DateTime @db.Timestamptz
  endsAt    DateTime @db.Timestamptz
  reason    String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, startsAt, endsAt])
}

// ---------- Patients ----------

model Patient {
  id                String    @id @default(uuid()) @db.Uuid
  firstName         String
  lastName          String
  dateOfBirth       DateTime  @db.Date
  gender            String    // MALE | FEMALE | OTHER (validated in Zod)
  email             String?   @unique
  phone             String
  address           String?
  emergencyContact  Json?     // { name, phone, relation }
  insuranceProvider String?
  insurancePolicyNo String?
  allergies         String?   // free text summary
  chronicConditions String?   // free text summary
  notes             String?
  isDeleted         Boolean   @default(false)
  createdById       String    @db.Uuid
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  createdBy   User                 @relation("PatientCreator")  @relation(fields: [createdById], references: [id])
  history     MedicalRecordEntry[]
  appointments Appointment[]
  invoices    Invoice[]

  @@index([lastName, firstName])
  @@index([isDeleted])
}

model MedicalRecordEntry {
  id             String         @id @default(uuid()) @db.Uuid
  patientId      String         @db.Uuid
  category       RecordCategory
  title          String         // e.g. "Root canal on 36", "Penicillin allergy"
  description    String
  recordDate     DateTime       @db.Timestamptz
  recordedById   String         @db.Uuid
  createdAt      DateTime       @default(now())

  patient    Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordedBy User    @relation(fields: [recordedById], references: [id])

  @@index([patientId, category])
  @@index([patientId, recordDate])
}

// ---------- Treatments catalog ----------

model Treatment {
  id              String  @id @default(uuid()) @db.Uuid
  code            String  @unique // "CLEAN-01"
  name            String
  description     String?
  defaultPrice    Decimal @db.Decimal(12, 2)
  durationMinutes Int
  isActive        Boolean @default(true)

  appointments Appointment[]
  invoiceItems InvoiceItem[]

  @@index([isActive])
}

// ---------- Appointments ----------

model Appointment {
  id              String            @id @default(uuid()) @db.Uuid
  patientId       String            @db.Uuid
  dentistId       String            @db.Uuid
  treatmentId     String?           @db.Uuid
  scheduledAt     DateTime          @db.Timestamptz
  durationMinutes Int               @default(30)
  status          AppointmentStatus @default(SCHEDULED)
  notes           String?
  cancelReason    String?
  createdById     String            @db.Uuid
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  patient   Patient    @relation(fields: [patientId], references: [id])
  dentist   User       @relation("AppointmentDentist", fields: [dentistId], references: [id])
  treatment Treatment?
  createdBy User       @relation("AppointmentCreator", fields: [createdById], references: [id])
  invoice   Invoice?

  @@index([dentistId, scheduledAt, status])
  @@index([patientId, scheduledAt])
  @@index([status])
}

// ---------- Billing ----------

model Invoice {
  id            String        @id @default(uuid()) @db.Uuid
  invoiceNumber String        @unique // INV-2026-000001
  patientId     String        @db.Uuid
  appointmentId String?       @unique @db.Uuid
  status        InvoiceStatus @default(DRAFT)
  issuedAt      DateTime      @default(now())
  dueDate       DateTime      @db.Date
  subtotal      Decimal       @db.Decimal(12, 2)
  discount      Decimal       @default(0) @db.Decimal(12, 2)
  taxRate       Decimal       @default(0) @db.Decimal(5, 4)
  total         Decimal       @db.Decimal(12, 2)
  amountPaid    Decimal       @default(0) @db.Decimal(12, 2)
  notes         String?
  createdById   String        @db.Uuid
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  patient     Patient       @relation(fields: [patientId], references: [id])
  appointment Appointment?   @relation(fields: [appointmentId], references: [id])
  items       InvoiceItem[]
  payments    Payment[]
  createdBy   User          @relation(fields: [createdById], references: [id])

  @@index([patientId])
  @@index([status, issuedAt])
}

model InvoiceItem {
  id           String   @id @default(uuid()) @db.Uuid
  invoiceId    String   @db.Uuid
  treatmentId  String?  @db.Uuid
  description  String
  quantity     Int      @default(1)
  unitPrice    Decimal  @db.Decimal(12, 2)
  lineTotal    Decimal  @db.Decimal(12, 2)

  invoice   Invoice    @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  treatment Treatment?

  @@index([invoiceId])
}

model Payment {
  id         String        @id @default(uuid()) @db.Uuid
  invoiceId  String        @db.Uuid
  amount     Decimal       @db.Decimal(12, 2)
  method     PaymentMethod
  reference  String?
  paidAt     DateTime      @default(now())
  recordedById String      @db.Uuid

  invoice    Invoice @relation(fields: [invoiceId], references: [id])
  recordedBy User    @relation(fields: [recordedById], references: [id])

  @@index([invoiceId])
  @@index([paidAt])
}
```

> Note: `User` needs one extra relation line added in step 00's schema when this file lands: `@relation("PatientCreator") patients Patient[]`.

## 3. Migration & deliverable checks

1. `npx prisma migrate dev --name init` → generates `prisma/migrations/<ts>_init/migration.sql`.
2. Verify with `npx prisma studio` or `psql \dt` that all 9 tables + 6 enums exist.
3. `src/config/env.ts` — Zod schema for `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_*`, `BCRYPT_SALT_ROUNDS`, `CORS_ORIGIN`; export frozen `env` object; fatal `AppError` on invalid env (fail-fast boot).
4. `src/config/prisma.ts` — `export const prisma = new PrismaClient()` (module singleton; reusable in dev via `globalThis` guard to survive `tsx watch` restarts).
5. `prisma/seed.ts` —
   - 1 Super Admin (`admin@clinic.local` / password from `SEED_ADMIN_PASSWORD` env or `admin123` hashed with bcrypt)
   - 1 dentist, 1 receptionist (demo creds)
   - Seat the weekly schedule (Mon–Fri 09:00–17:00) for the dentist
   - Treatment catalog: `EXAM`, `CLEAN-01`, `FILL-AM`, `FILL-COMP`, `RCT-01`, `EXTR-01`, `BLEACH-01` with default prices/durations; upsert by `code` so re-seeding is idempotent.

## 4. DB tables involved

`User`, `StaffSchedule`, `TimeOffEntry`, `Patient`, `MedicalRecordEntry`, `Treatment`, `Appointment`, `Invoice`, `InvoiceItem`, `Payment` — all created in this step.

## 5. Definition of done

- [ ] `npm run typecheck` passes with the two config files in place.
- [ ] Migration `init` applied cleanly.
- [ ] Seed runs idempotently (`prisma db seed` twice OK).
- [ ] `server.ts` can boot with just helmet/cors/json + a `GET /health` route returning `{ success: true, data: { status: "up" } }`.
```
