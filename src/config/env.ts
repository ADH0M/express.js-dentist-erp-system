import "dotenv/config";
import { z } from "zod";

/**
 * Zod-validated environment configuration.
 * The process fails fast at boot if any variable is missing or malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z.string().startsWith("/").default("/api/v1"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a postgres connection string",
    ),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  JWT_ISSUER: z.string().min(1).default("dentist-erp-system"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(16).default(12),

  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),

  // Optional clinic defaults (billing/report headers)
  CLINIC_NAME: z.string().default("Dentist ERP Clinic"),
  CLINIC_ADDRESS: z.string().optional(),
  CLINIC_PHONE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
