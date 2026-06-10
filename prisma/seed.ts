/**
 * Optional local seed: creates a demo household with two members.
 * Run with: npm run db:seed
 * Logins: robert@example.com / spouse@example.com  (password: password123)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "robert@example.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("seed: demo household already exists, skipping.");
    return;
  }

  const household = await prisma.household.create({
    data: { name: "The Whites", timezone: "America/Denver" },
  });
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.create({
    data: {
      householdId: household.id,
      name: "Robert",
      email,
      passwordHash,
      color: "#6366f1",
    },
  });
  await prisma.user.create({
    data: {
      householdId: household.id,
      name: "Partner",
      email: "spouse@example.com",
      passwordHash,
      color: "#ec4899",
    },
  });

  console.log(
    "seed: created demo household. Login robert@example.com / password123",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
