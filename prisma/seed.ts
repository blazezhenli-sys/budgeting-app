import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "TWD"] as const;
const INFLOW_CATEGORY_NAME = "Inflow: Ready to Assign";

function normalizeDisplayCurrency(currency: string | undefined | null): (typeof DISPLAY_CURRENCIES)[number] {
  const normalized = (currency ?? "").toUpperCase();
  return DISPLAY_CURRENCIES.includes(normalized as (typeof DISPLAY_CURRENCIES)[number])
    ? (normalized as (typeof DISPLAY_CURRENCIES)[number])
    : "USD";
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

async function main() {
  const email = process.env.APP_USER_EMAIL;
  const password = process.env.APP_USER_PASSWORD;
  const secondaryEmail = process.env.APP_USER_EMAIL_2?.trim().toLowerCase() || null;
  const secondaryPassword = process.env.APP_USER_PASSWORD_2 || null;

  if (!email || !password) {
    throw new Error("APP_USER_EMAIL and APP_USER_PASSWORD must be set before seeding");
  }
  if ((secondaryEmail && !secondaryPassword) || (!secondaryEmail && secondaryPassword)) {
    throw new Error("Set both APP_USER_EMAIL_2 and APP_USER_PASSWORD_2, or neither.");
  }
  if (secondaryEmail && secondaryEmail === email.toLowerCase()) {
    throw new Error("APP_USER_EMAIL_2 must be different from APP_USER_EMAIL.");
  }

  const secondaryPasswordHash = secondaryPassword ? await hashPassword(secondaryPassword) : null;

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: await hashPassword(password),
      ...(secondaryEmail
        ? {
            secondaryEmail,
            secondaryPasswordHash,
          }
        : {}),
    },
    create: {
      email,
      passwordHash: await hashPassword(password),
      secondaryEmail,
      secondaryPasswordHash,
      settings: {
        create: {
          currency: normalizeDisplayCurrency(process.env.APP_CURRENCY),
          timezone: process.env.APP_TIMEZONE ?? "UTC",
          monthStartDay: 1,
        },
      },
    },
  });

  const existingGroups = await prisma.categoryGroup.count({ where: { userId: user.id } });
  if (existingGroups === 0) {
    await prisma.categoryGroup.createMany({
      data: [
        { userId: user.id, name: "System", sortOrder: 0 },
        { userId: user.id, name: "Needs", sortOrder: 1 },
        { userId: user.id, name: "Wants", sortOrder: 2 },
        { userId: user.id, name: "Savings", sortOrder: 3 },
      ],
    });

    const groups = await prisma.categoryGroup.findMany({ where: { userId: user.id } });
    const groupByName = new Map(groups.map((group) => [group.name, group.id]));

    await prisma.category.createMany({
      data: [
        {
          userId: user.id,
          groupId: groupByName.get("System")!,
          name: INFLOW_CATEGORY_NAME,
          specialType: "INFLOW",
        },
        { userId: user.id, groupId: groupByName.get("Needs")!, name: "Rent" },
        { userId: user.id, groupId: groupByName.get("Needs")!, name: "Groceries" },
        { userId: user.id, groupId: groupByName.get("Needs")!, name: "Utilities" },
        { userId: user.id, groupId: groupByName.get("Wants")!, name: "Dining Out" },
        { userId: user.id, groupId: groupByName.get("Wants")!, name: "Entertainment" },
        { userId: user.id, groupId: groupByName.get("Savings")!, name: "Emergency Fund" },
      ],
    });
  } else {
    const inflow = await prisma.category.findFirst({
      where: { userId: user.id, specialType: "INFLOW" },
    });

    if (!inflow) {
      const systemGroup = await prisma.categoryGroup.upsert({
        where: {
          userId_name: {
            userId: user.id,
            name: "System",
          },
        },
        create: {
          userId: user.id,
          name: "System",
          sortOrder: 0,
        },
        update: {},
      });

      const existingByName = await prisma.category.findFirst({
        where: {
          userId: user.id,
          name: INFLOW_CATEGORY_NAME,
        },
      });

      if (existingByName) {
        await prisma.category.update({
          where: { id: existingByName.id },
          data: {
            specialType: "INFLOW",
            groupId: systemGroup.id,
          },
        });
      } else {
        await prisma.category.create({
          data: {
            userId: user.id,
            groupId: systemGroup.id,
            name: INFLOW_CATEGORY_NAME,
            specialType: "INFLOW",
          },
        });
      }
    }
  }

  console.log(`Seed complete for ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
