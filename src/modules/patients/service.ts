import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";
import { buildPageMeta } from "../../common/utils/pagination";
import type { AuthUser } from "../../common/types/common";
import type {
  CreateHistoryEntryDto,
  CreatePatientDto,
  ListHistoryQuery,
  ListPatientsQuery,
  UpdateHistoryEntryDto,
  UpdatePatientDto,
} from "./dto";
import {
  toHistoryEntryDto,
  toPatientDto,
  type HistoryEntryDto,
  type HistoryEntryWithRecorder,
  type PatientDetailDto,
  type PatientDto,
  type PatientListItem,
  type WithCreatedBy,
} from "./types";

/**
 * Patient business logic (docs/execution-plan/03 §5).
 * Route-level RBAC already ran — the service only implements domain rules:
 * unique-email mapping, includeDeleted admin-only, soft-delete invoice guard,
 * history ownership checks.
 */

const PATIENT_NOT_FOUND = new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
const HISTORY_ENTRY_NOT_FOUND = new AppError(
  404,
  "HISTORY_ENTRY_NOT_FOUND",
  "History entry not found.",
);

const PATIENT_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  email: true,
  phone: true,
  address: true,
  emergencyContact: true,
  insuranceProvider: true,
  insurancePolicyNo: true,
  allergies: true,
  chronicConditions: true,
  notes: true,
  isDeleted: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PatientSelect;

const HISTORY_INCLUDE = {
  recordedBy: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.MedicalRecordEntryInclude;

/** `""` email → null so an absent email never triggers the unique index. */
const normalizeEmail = (email: string | undefined): string | null | undefined =>
  email === undefined ? undefined : email === "" ? null : email;

/** Fetch a patient incl. counts; throws PATIENT_NOT_FOUND when missing. */
async function getPatientOrThrow(id: string, actor: AuthUser): Promise<PatientDetailDto> {
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { ...PATIENT_LIST_SELECT, _count: { select: { history: true, appointments: true } } },
  });
  if (!patient) throw PATIENT_NOT_FOUND;
  // Mirror list's includeDeleted rule: soft-deleted patients are invisible
  // to everyone except SUPER_ADMIN.
  if (patient.isDeleted && actor.role !== "SUPER_ADMIN") {
    throw new AppError(404, "PATIENT_NOT_FOUND", "Patient is deleted.");
  }
  return toPatientDto(patient) as PatientDetailDto;
}

/** Cheap existence check for history endpoints. */
async function ensurePatientExists(id: string): Promise<void> {
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true, isDeleted: true },
  });
  if (!patient) throw PATIENT_NOT_FOUND;
  if (patient.isDeleted) {
    throw new AppError(404, "PATIENT_NOT_FOUND", "Patient is deleted.");
  }
}

/** Verify a history entry belongs to the given patient. */
async function getOwnedHistoryEntryOrThrow(
  patientId: string,
  entryId: string,
): Promise<HistoryEntryWithRecorder> {
  const entry = await prisma.medicalRecordEntry.findFirst({
    where: { id: entryId, patientId },
    include: HISTORY_INCLUDE,
  });
  if (!entry) throw HISTORY_ENTRY_NOT_FOUND;
  return entry;
}

export const patientService = {
  /**
   * Paginated list. `includeDeleted` is honored only for SUPER_ADMIN.
   * count+findMany run in one transaction (single round-trip pair, no N+1).
   */
  async list(
    query: ListPatientsQuery,
    actor: AuthUser,
  ): Promise<{ data: PatientDto[]; meta: ReturnType<typeof buildPageMeta> }> {
    const includeDeleted = query.includeDeleted === "true" && actor.role === "SUPER_ADMIN";

    const where: Prisma.PatientWhereInput = {
      isDeleted: includeDeleted ? undefined : false,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    // Deterministic ordering via sort map (docs §5).
    const orderBy: Prisma.PatientOrderByWithRelationInput[] =
      query.sortBy === "name"
        ? [{ lastName: query.order }, { firstName: query.order }]
        : [{ createdAt: query.order }];

    const skip = (query.page - 1) * query.limit;

    const [total, rows] = await prisma.$transaction([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        select: PATIENT_LIST_SELECT,
        orderBy,
        skip,
        take: query.limit,
      }),
    ]);

    return {
      data: rows.map((row) => toPatientDto(row as PatientListItem & WithCreatedBy)),
      meta: buildPageMeta(query.page, query.limit, total),
    };
  },

  /** Single patient with history/appointment counts. */
  async getById(id: string, actor: AuthUser): Promise<PatientDetailDto> {
    return getPatientOrThrow(id, actor);
  },

  /** Create patient. Duplicate email → 409 EMAIL_IN_USE. */
  async create(dto: CreatePatientDto, actor: AuthUser): Promise<PatientDto> {
    const { emergencyContact, ...rest } = dto;
    try {
      const patient = await prisma.patient.create({
        data: {
          ...rest,
          email: normalizeEmail(dto.email),
          dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00Z`),
          emergencyContact: emergencyContact ?? Prisma.DbNull,
          createdById: actor.id,
        },
        select: PATIENT_LIST_SELECT,
      });
      return toPatientDto(patient as PatientListItem);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes("email")
      ) {
        throw new AppError(409, "EMAIL_IN_USE", "A patient with this email already exists.");
      }
      throw error;
    }
  },

  /** Partial update. Same unique-email conflict mapping. */
  async update(id: string, dto: UpdatePatientDto, actor: AuthUser): Promise<PatientDto> {
    await getPatientOrThrow(id, actor);

    const { emergencyContact, ...rest } = dto;
    const data: Prisma.PatientUpdateInput = {
      ...rest,
      email: normalizeEmail(dto.email),
      dateOfBirth: dto.dateOfBirth ? new Date(`${dto.dateOfBirth}T00:00:00Z`) : undefined,
      emergencyContact: emergencyContact ?? undefined,
    };

    try {
      const patient = await prisma.patient.update({
        where: { id },
        data,
        select: PATIENT_LIST_SELECT,
      });
      return toPatientDto(patient as PatientListItem);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes("email")
      ) {
        throw new AppError(409, "EMAIL_IN_USE", "A patient with this email already exists.");
      }
      throw error;
    }
  },

  /**
   * Soft delete. Blocked while the patient holds any invoice that is ISSUED or
   * PARTIALLY_PAID (docs §5: guard vs PAID / VOID / DRAFT).
   */
  async softDelete(id: string, actor: AuthUser): Promise<void> {
    await getPatientOrThrow(id, actor);

    const unpaid = await prisma.invoice.count({
      where: { patientId: id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
    });
    if (unpaid > 0) {
      throw new AppError(
        409,
        "PATIENT_HAS_UNPAID_INVOICES",
        "Patient cannot be deleted while unpaid invoices exist.",
      );
    }

    await prisma.patient.update({ where: { id }, data: { isDeleted: true } });
  },

  /** Paginated history, newest first, optional category filter. */
  async listHistory(
    patientId: string,
    query: ListHistoryQuery,
  ): Promise<{ data: HistoryEntryDto[]; meta: ReturnType<typeof buildPageMeta> }> {
    // Existence check doubles as the 404 gate for the patient.
    await ensurePatientExists(patientId);

    const where: Prisma.MedicalRecordEntryWhereInput = {
      patientId,
      ...(query.category ? { category: query.category } : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [total, rows] = await prisma.$transaction([
      prisma.medicalRecordEntry.count({ where }),
      prisma.medicalRecordEntry.findMany({
        where,
        include: HISTORY_INCLUDE,
        orderBy: { recordDate: "desc" },
        skip,
        take: query.limit,
      }),
    ]);

    return {
      data: rows.map(toHistoryEntryDto),
      meta: buildPageMeta(query.page, query.limit, total),
    };
  },

  /** Add a history entry; patient must exist and not be deleted. */
  async addHistoryEntry(
    patientId: string,
    dto: CreateHistoryEntryDto,
    actor: AuthUser,
  ): Promise<HistoryEntryDto> {
    await ensurePatientExists(patientId);

    const entry = await prisma.medicalRecordEntry.create({
      data: {
        patientId,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        recordDate: dto.recordDate ?? new Date(),
        recordedById: actor.id,
      },
      include: HISTORY_INCLUDE,
    });
    return toHistoryEntryDto(entry);
  },

  /** Update title/description/recordDate; category is immutable. */
  async updateHistoryEntry(
    patientId: string,
    entryId: string,
    dto: UpdateHistoryEntryDto,
  ): Promise<HistoryEntryDto> {
    await getOwnedHistoryEntryOrThrow(patientId, entryId);

    const entry = await prisma.medicalRecordEntry.update({
      where: { id: entryId },
      data: {
        title: dto.title,
        description: dto.description,
        recordDate: dto.recordDate,
      },
      include: HISTORY_INCLUDE,
    });
    return toHistoryEntryDto(entry);
  },

  /** Delete a history entry after the ownership check. */
  async deleteHistoryEntry(patientId: string, entryId: string): Promise<void> {
    await getOwnedHistoryEntryOrThrow(patientId, entryId);
    await prisma.medicalRecordEntry.delete({ where: { id: entryId } });
  },
};
