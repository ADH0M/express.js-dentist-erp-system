import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Idempotent baseline seed:
 *  - 3 staff accounts (super admin, dentist, receptionist)
 *  - weekly schedule for the dentist
 *  - treatment catalog
 *
 * Re-running is safe: upserts by unique keys.
 */

const prisma = new PrismaClient();

async function hashPassword(plain: string): Promise<string> {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  return bcrypt.hash(plain, saltRounds);
}

async function seedUsers(): Promise<void> {
  const password = process.env.SEED_PASSWORD ?? "Password123"; // letters + digits, min 10

  const users = [
    {
      email: "admin@clinic.local",
      fullName: "Super Admin",
      role: "SUPER_ADMIN" as const,
      position: "RECEPTIONIST" as const,
      phone: "+20 100 000 0001",
    },
    {
      email: "dentist@clinic.local",
      fullName: "Dr. Sarah Hassan",
      role: "DENTIST" as const,
      position: "DENTIST" as const,
      licenseNumber: "DDS-100001",
      phone: "+20 100 000 0002",
    },
    {
      email: "hygienist@clinic.local",
      fullName: "Omar Khaled (Hygienist)",
      role: "DENTIST" as const,
      position: "HYGIENIST" as const,
      licenseNumber: "DHG-100002",
      phone: "+20 100 000 0003",
    },
    {
      email: "reception@clinic.local",
      fullName: "Nour Adel (Reception)",
      role: "RECEPTIONIST" as const,
      position: "RECEPTIONIST" as const,
      phone: "+20 100 000 0004",
    },
  ];

  const passwordHash = await hashPassword(password);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        role: user.role,
        position: user.position,
        phone: user.phone ?? null,
        licenseNumber: "licenseNumber" in user ? user.licenseNumber : null,
        isActive: true,
      },
      create: { ...user, passwordHash },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`✔ Users seeded (all use the password: ${password})`);
}

async function seedDentistSchedule(): Promise<void> {
  const dentist = await prisma.user.findUnique({ where: { email: "dentist@clinic.local" } });
  if (!dentist) return;

  const days = [1, 2, 3, 4, 5]; // Mon..Fri
  for (const dayOfWeek of days) {
    await prisma.staffSchedule.upsert({
      where: { userId_dayOfWeek: { userId: dentist.id, dayOfWeek } },
      update: { startTime: "09:00", endTime: "17:00" },
      create: {
        userId: dentist.id,
        dayOfWeek,
        startTime: "09:00",
        endTime: "17:00",
        breaks: [{ start: "13:00", end: "14:00" }],
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log("✔ Dentist weekly schedule seeded (Mon–Fri 09:00–17:00, break 13:00–14:00)");
}

async function seedTreatments(): Promise<void> {
  const treatments = [
    { code: "EXAM-01", name: "Dental Examination", description: "Comprehensive oral exam", defaultPrice: "150.00", durationMinutes: 15 },
    { code: "CLEAN-01", name: "Teeth Cleaning (Scaling + Polish)", description: "Routine prophylaxis", defaultPrice: "350.00", durationMinutes: 45 },
    { code: "FILL-COMP", name: "Composite Filling", description: "Tooth-colored restoration", defaultPrice: "450.00", durationMinutes: 60 },
    { code: "FILL-AM", name: "Amalgam Filling", description: "Silver restoration", defaultPrice: "300.00", durationMinutes: 45 },
    { code: "RCT-01", name: "Root Canal (single canal)", description: "Endodontic therapy", defaultPrice: "1800.00", durationMinutes: 120 },
    { code: "EXTR-01", name: "Simple Tooth Extraction", description: "Non-surgical extraction", defaultPrice: "500.00", durationMinutes: 45 },
    { code: "BLEACH-01", name: "In-Office Bleaching", description: "Whitening session", defaultPrice: "1200.00", durationMinutes: 90 },
  ];

  for (const treatment of treatments) {
    await prisma.treatment.upsert({
      where: { code: treatment.code },
      update: treatment,
      create: treatment,
    });
  }

  // eslint-disable-next-line no-console
  console.log(`✔ Treatment catalog seeded (${treatments.length} procedures)`);
}

async function main(): Promise<void> {
  await seedUsers();
  await seedDentistSchedule();
  await seedTreatments();
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
