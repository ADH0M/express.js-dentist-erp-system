import type { RecordCategory, UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { Patient, MedicalRecordEntry } from "@prisma/client";

/**
 * Public shapes + mappers (docs/execution-plan/03 §4).
 * Patients hold no auth data, so nothing is stripped — but `age` is computed
 * from `dateOfBirth` and `emergencyContact`/`email` are normalized (never `""`).
 */

/** Recorder projection embedded in history entries. */
export type RecorderDto = {
  id: string;
  fullName: string;
  role: UserRole;
};

export type PatientDto = Omit<Patient, "email" | "emergencyContact"> & {
  age: number;
  email: string | null;
  emergencyContact: { name: string; phone: string; relation: string } | null;
  createdBy: { id: string; fullName: string };
};

export type PatientDetailDto = PatientDto & {
  _count: { history: number; appointments: number };
};

export type HistoryEntryDto = Omit<MedicalRecordEntry, "recordedBy"> & {
  recordedBy: RecorderDto;
};

/** List row shape returned by service.list() (includes createdBy summary). */
export type PatientListItem = Patient & {
  createdBy: { id: string; fullName: string };
};

/** Full-years age as of today, from a birth date. */
export function computeAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export type WithCreatedBy = {
  createdBy: { id: string; fullName: string } | null;
};

/** Patient row → PatientDto (computes age, normalizes nullable fields). */
export function toPatientDto(
  patient: Patient & WithCreatedBy,
): PatientDto {
  const { email, emergencyContact, createdBy, ...rest } = patient;
  return {
    ...rest,
    email: email || null,
    emergencyContact:
      emergencyContact && typeof emergencyContact === "object"
        ? (emergencyContact as unknown as {
            name: string;
            phone: string;
            relation: string;
          })
        : null,
    age: computeAge(patient.dateOfBirth),
    createdBy: createdBy ?? { id: "", fullName: "" },
  };
}

export type HistoryEntryWithRecorder = Prisma.MedicalRecordEntryGetPayload<{
  include: { recordedBy: { select: { id: true; fullName: true; role: true } } };
}>;

/** History row → HistoryEntryDto (embeds recorder projection). */
export function toHistoryEntryDto(entry: HistoryEntryWithRecorder): HistoryEntryDto {
  const { recordedBy, ...rest } = entry;
  return {
    ...rest,
    recordedBy: {
      id: recordedBy.id,
      fullName: recordedBy.fullName,
      role: recordedBy.role,
    },
  };
}

export type RecordCategoryFilter = RecordCategory;
