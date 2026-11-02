import { z } from "zod";

/**
 * Password policy: min 10 chars, at least 1 letter and 1 digit.
 * Shared between register + change-password schemas.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one digit");

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    password: passwordSchema,
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(120),
    role: z.enum(["SUPER_ADMIN", "DENTIST", "RECEPTIONIST"]),
    position: z.enum(["DENTIST", "HYGIENIST", "RECEPTIONIST"]),
    phone: z.string().trim().min(5).max(40).optional(),
    licenseNumber: z.string().trim().min(2).max(60).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.role === "SUPER_ADMIN") return;
    // Dentists/hygienists are expected to carry a license; receptionists may not.
    if (val.position !== "RECEPTIONIST" && !val.licenseNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["licenseNumber"],
        message: "licenseNumber is required for clinical positions",
      });
    }
  });

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, "refreshToken is required"),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((val) => val.currentPassword !== val.newPassword, {
    path: ["newPassword"],
    message: "New password must differ from the current password",
  });

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
