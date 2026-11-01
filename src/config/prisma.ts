import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Singleton PrismaClient.
 *
 * In development (tsx watch) the module is re-evaluated on every hot reload;
 * keeping the client on globalThis avoids exhausting the PostgreSQL
 * connection pool across restarts.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}
