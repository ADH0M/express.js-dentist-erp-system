import { z } from "zod";

/**
 * Patient module DTOs (docs/execution-plan/03 §3).
 * Bodies are .strict() so unknown fields are rejected by validate().
 */

/** Shared phone rule: `^\+?[0-9().\-\s]{7,20}$` — digits/spaces/brackets only. */
export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9().\-\s]{7,20}$/, "Invalid phone number format");

/** YYYY-MM-DD, must be a real date and not in the future. */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be an ISO date (YYYY-MM-DD)")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), {
    message: "dateOfBirth must be a valid calendar date",
  })
  .refine((value) => new Date(`${value}T00:00:00Z`).getTime() <= Date.now(), {
    message: "dateOfBirth cannot be in the future",
  });

/** Emergency contact embedded JSON (optional on create/update). */
export const emergencyContactSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120),
    phone: phoneSchema,
    relation: z.string().trim().min(1, "relation is required").max(80),
  })
  .strict();

/**
 * Email is nullable-unique in the schema: `""` is accepted and normalized to
 * `null` by the service so a missing email never collides on the unique index.
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .optional()
  .or(z.literal(""));

export const createPatientSchema = z
  .object({
    firstName: z.string().trim().min(1, "firstName is required").max(80),
    lastName: z.string().trim().min(1, "lastName is required").max(80),
    dateOfBirth: dateOfBirthSchema,
    gender: z.enum(["MALE", "FEMALE", "OTHER"]),
    email: emailSchema,
    phone: phoneSchema,
    address: z.string().trim().max(400).optional(),
    emergencyContact: emergencyContactSchema.optional(),
    insuranceProvider: z.string().trim().max(120).optional(),
    insurancePolicyNo: z.string().trim().max(60).optional(),
    allergies: z.string().trim().max(1000).optional(),
    chronicConditions: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

/** All fields optional; same string limits apply (docs §3). */
export const updatePatientSchema = createPatientSchema.partial();

export const createHistoryEntrySchema = z
  .object({
    category: z.enum(["MEDICAL", "DENTAL"]),
    title: z.string().trim().min(1, "title is required").max(160),
    description: z.string().trim().min(1, "description is required").max(4000),
    recordDate: z.coerce.date().optional(), // defaults to now in the service
  })
  .strict();

/** category is immutable after creation (docs §3) → omitted here. */
export const updateHistoryEntrySchema = createHistoryEntrySchema
  .omit({ category: true })
  .partial();

export const patientIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const historyEntryIdParamsSchema = z
  .object({ id: z.string().uuid(), entryId: z.string().uuid() })
  .strict();

export const listPatientsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    sortBy: z.enum(["name", "createdAt"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
    // Honored only for SUPER_ADMIN (service enforces the role check).
    includeDeleted: z.enum(["true", "false"]).default("false"),
  })
  .strict();

export const listHistoryQuerySchema = z
  .object({
    category: z.enum(["MEDICAL", "DENTAL"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreatePatientDto = z.infer<typeof createPatientSchema>;
export type UpdatePatientDto = z.infer<typeof updatePatientSchema>;
export type CreateHistoryEntryDto = z.infer<typeof createHistoryEntrySchema>;
export type UpdateHistoryEntryDto = z.infer<typeof updateHistoryEntrySchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
