import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";

const prisma = new PrismaClient();
const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "TWD"] as const;
const INFLOW_CATEGORY_NAME = "Inflow: Ready to Assign";
const HISTORY_MEMO_MARKER = "[seed-local-history-v1]";
const DEFAULT_USD_TO_DISPLAY_RATE = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.5,
  CAD: 1.36,
  AUD: 1.52,
  TWD: 32.1,
};

function normalizeDisplayCurrency(currency: string | undefined | null): (typeof DISPLAY_CURRENCIES)[number] {
  const normalized = (currency ?? "").toUpperCase();
  return DISPLAY_CURRENCIES.includes(normalized as (typeof DISPLAY_CURRENCIES)[number])
    ? (normalized as (typeof DISPLAY_CURRENCIES)[number])
    : "USD";
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readArgValue(prefix: string): string | undefined {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function readHistoryMonths(): number {
  const fromArg = parseIntOrNull(readArgValue("--months="));
  const fromEnv = parseIntOrNull(process.env.APP_SEED_HISTORY_MONTHS);
  return clamp(fromArg ?? fromEnv ?? 6, 3, 6);
}

function computeMonthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

function dateInMonth(monthStart: Date, dayOfMonth: number): Date {
  const maxDay = endOfMonth(monthStart).getDate();
  const safeDay = clamp(dayOfMonth, 1, maxDay);
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), safeDay, 10, 0, 0);
}

function wave(monthIndex: number, amplitude: number): number {
  const cycle = ((monthIndex * 37 + 11) % 7) - 3;
  return cycle * amplitude;
}

async function ensureDefaultGroups(userId: string) {
  const groups = [
    { name: "System", sortOrder: 0 },
    { name: "Needs", sortOrder: 1 },
    { name: "Wants", sortOrder: 2 },
    { name: "Savings", sortOrder: 3 },
  ];

  for (const group of groups) {
    await prisma.categoryGroup.upsert({
      where: {
        userId_name: {
          userId,
          name: group.name,
        },
      },
      create: {
        userId,
        name: group.name,
        sortOrder: group.sortOrder,
      },
      update: {
        sortOrder: group.sortOrder,
      },
    });
  }

  const allGroups = await prisma.categoryGroup.findMany({ where: { userId } });
  return new Map(allGroups.map((group) => [group.name, group]));
}

async function ensureInflowCategory(userId: string, systemGroupId: string) {
  const existingInflow = await prisma.category.findFirst({
    where: { userId, specialType: "INFLOW" },
  });

  if (existingInflow) {
    return existingInflow;
  }

  const existingByName = await prisma.category.findFirst({
    where: {
      userId,
      name: INFLOW_CATEGORY_NAME,
    },
  });

  if (existingByName) {
    return prisma.category.update({
      where: { id: existingByName.id },
      data: {
        specialType: "INFLOW",
        groupId: systemGroupId,
      },
    });
  }

  return prisma.category.create({
    data: {
      userId,
      groupId: systemGroupId,
      name: INFLOW_CATEGORY_NAME,
      specialType: "INFLOW",
    },
  });
}

async function ensureBaseCategories(userId: string, groupByName: Map<string, { id: string }>) {
  const templates = [
    { groupName: "Needs", name: "Rent", targetMonthly: 190_000 },
    { groupName: "Needs", name: "Groceries", targetMonthly: 70_000 },
    { groupName: "Needs", name: "Utilities", targetMonthly: 25_000 },
    { groupName: "Wants", name: "Dining Out", targetMonthly: 35_000 },
    { groupName: "Wants", name: "Entertainment", targetMonthly: 22_000 },
    { groupName: "Savings", name: "Emergency Fund", targetMonthly: 55_000 },
  ];

  for (const template of templates) {
    const existing = await prisma.category.findFirst({
      where: { userId, name: template.name },
    });

    if (!existing) {
      await prisma.category.create({
        data: {
          userId,
          groupId: groupByName.get(template.groupName)!.id,
          name: template.name,
          targetMonthly: template.targetMonthly,
        },
      });
    }
  }
}

async function ensureHistoryAccounts(userId: string, historyStart: Date) {
  const createdAt = addMonths(historyStart, -1);
  const templates = [
    { name: "Checking", type: "CHECKING" as const, openingBalance: 7_500_00 },
    { name: "Savings", type: "SAVINGS" as const, openingBalance: 2_500_00 },
    { name: "Cash Wallet", type: "CASH" as const, openingBalance: 300_00 },
  ];

  const accountByName = new Map<string, { id: string }>();

  for (const template of templates) {
    const account = await prisma.account.upsert({
      where: {
        userId_name: {
          userId,
          name: template.name,
        },
      },
      create: {
        userId,
        name: template.name,
        type: template.type,
        openingBalance: template.openingBalance,
        createdAt,
      },
      update: {
        archived: false,
      },
      select: {
        id: true,
      },
    });
    accountByName.set(template.name, account);
  }

  return accountByName;
}

async function seedDummyHistory(userId: string, historyMonths: number, forceSeed: boolean) {
  const totalTransactions = await prisma.transaction.count({ where: { userId } });
  const seededTransactions = await prisma.transaction.count({
    where: { userId, memo: { contains: HISTORY_MEMO_MARKER } },
  });

  if (totalTransactions > 0 && seededTransactions === 0 && !forceSeed) {
    console.log(
      "Skipped history seeding because this user already has non-seed transactions. Re-run with --force-history to continue.",
    );
    return;
  }

  if (seededTransactions > 0) {
    await prisma.transaction.deleteMany({
      where: { userId, memo: { contains: HISTORY_MEMO_MARKER } },
    });
  }

  const nowMonthStart = startOfMonth(new Date());
  const historyStart = addMonths(nowMonthStart, -(historyMonths - 1));
  const accountByName = await ensureHistoryAccounts(userId, historyStart);

  const categories = await prisma.category.findMany({
    where: {
      userId,
      specialType: null,
    },
    select: {
      id: true,
      name: true,
    },
  });
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));
  const inflowCategory = await prisma.category.findFirst({
    where: { userId, specialType: "INFLOW" },
    select: { id: true },
  });
  if (!inflowCategory) {
    throw new Error("Missing inflow category.");
  }

  const transactions: Array<{
    userId: string;
    accountId: string;
    categoryId?: string | null;
    date: Date;
    payee: string;
    memo: string;
    amount: number;
    status: "CLEARED" | "UNCLEARED";
    transferGroup?: string | null;
  }> = [];

  for (let monthIndex = 0; monthIndex < historyMonths; monthIndex += 1) {
    const monthStart = addMonths(historyStart, monthIndex);
    const monthKey = computeMonthKey(monthStart);
    const isCurrentMonth = monthIndex === historyMonths - 1;

    const budgetMonth = await prisma.budgetMonth.upsert({
      where: {
        userId_monthKey: {
          userId,
          monthKey,
        },
      },
      create: {
        userId,
        monthKey,
        status: isCurrentMonth ? "OPEN" : "CLOSED",
        closedAt: isCurrentMonth ? null : endOfMonth(monthStart),
      },
      update: {
        status: isCurrentMonth ? "OPEN" : "CLOSED",
        closedAt: isCurrentMonth ? null : endOfMonth(monthStart),
      },
    });

    const assignments = [
      { name: "Rent", amount: 190_000 + wave(monthIndex, 300) },
      { name: "Groceries", amount: 70_000 + wave(monthIndex, 1_200) },
      { name: "Utilities", amount: 25_000 + wave(monthIndex, 800) },
      { name: "Dining Out", amount: 35_000 + wave(monthIndex, 900) },
      { name: "Entertainment", amount: 22_000 + wave(monthIndex, 700) },
      { name: "Emergency Fund", amount: 55_000 + wave(monthIndex, 1_000) },
    ];

    for (const assignment of assignments) {
      const categoryId = categoryByName.get(assignment.name);
      if (!categoryId) continue;
      await prisma.categoryBudget.upsert({
        where: {
          budgetMonthId_categoryId: {
            budgetMonthId: budgetMonth.id,
            categoryId,
          },
        },
        create: {
          userId,
          budgetMonthId: budgetMonth.id,
          categoryId,
          assigned: Math.max(assignment.amount, 0),
        },
        update: {
          assigned: Math.max(assignment.amount, 0),
        },
      });
    }

    const monthMemoPrefix = `${HISTORY_MEMO_MARKER} ${monthKey}`;
    const checkingId = accountByName.get("Checking")!.id;
    const savingsId = accountByName.get("Savings")!.id;
    const cashId = accountByName.get("Cash Wallet")!.id;

    transactions.push({
      userId,
      accountId: checkingId,
      categoryId: inflowCategory.id,
      date: dateInMonth(monthStart, 1),
      payee: "Acme Payroll",
      memo: `${monthMemoPrefix} salary`,
      amount: 530_000 + wave(monthIndex, 2_000),
      status: "CLEARED",
      transferGroup: null,
    });

    if (monthIndex % 2 === 0) {
      transactions.push({
        userId,
        accountId: checkingId,
        categoryId: inflowCategory.id,
        date: dateInMonth(monthStart, 14),
        payee: "Freelance Client",
        memo: `${monthMemoPrefix} side-income`,
        amount: 70_000 + wave(monthIndex, 1_500),
        status: "CLEARED",
        transferGroup: null,
      });
    }

    transactions.push({
      userId,
      accountId: checkingId,
      categoryId: categoryByName.get("Rent"),
      date: dateInMonth(monthStart, 2),
      payee: "Landlord Co",
      memo: `${monthMemoPrefix} rent`,
      amount: -186_000 + wave(monthIndex, 700),
      status: "CLEARED",
      transferGroup: null,
    });

    transactions.push({
      userId,
      accountId: checkingId,
      categoryId: categoryByName.get("Utilities"),
      date: dateInMonth(monthStart, 9),
      payee: "City Utilities",
      memo: `${monthMemoPrefix} utilities`,
      amount: -21_000 + wave(monthIndex, 500),
      status: "CLEARED",
      transferGroup: null,
    });

    const groceryDays = [5, 12, 19, 26];
    for (const day of groceryDays) {
      transactions.push({
        userId,
        accountId: checkingId,
        categoryId: categoryByName.get("Groceries"),
        date: dateInMonth(monthStart, day),
        payee: "Fresh Market",
        memo: `${monthMemoPrefix} groceries-${day}`,
        amount: -(15_000 + ((day + monthIndex) % 5) * 1_400 + Math.abs(wave(monthIndex, 280))),
        status: isCurrentMonth && day >= 26 ? "UNCLEARED" : "CLEARED",
        transferGroup: null,
      });
    }

    const diningDays = [8, 16, 24];
    for (const day of diningDays) {
      transactions.push({
        userId,
        accountId: checkingId,
        categoryId: categoryByName.get("Dining Out"),
        date: dateInMonth(monthStart, day),
        payee: "Neighborhood Cafe",
        memo: `${monthMemoPrefix} dining-${day}`,
        amount: -(8_500 + ((day + monthIndex) % 4) * 1_200 + Math.abs(wave(monthIndex, 200))),
        status: isCurrentMonth && day >= 24 ? "UNCLEARED" : "CLEARED",
        transferGroup: null,
      });
    }

    const entertainmentDays = [11, 22];
    for (const day of entertainmentDays) {
      transactions.push({
        userId,
        accountId: checkingId,
        categoryId: categoryByName.get("Entertainment"),
        date: dateInMonth(monthStart, day),
        payee: day === 11 ? "Cinema One" : "StreamFlix",
        memo: `${monthMemoPrefix} entertainment-${day}`,
        amount: -(7_000 + ((day + monthIndex) % 3) * 2_000 + Math.abs(wave(monthIndex, 150))),
        status: isCurrentMonth && day >= 22 ? "UNCLEARED" : "CLEARED",
        transferGroup: null,
      });
    }

    transactions.push({
      userId,
      accountId: cashId,
      categoryId: categoryByName.get("Dining Out"),
      date: dateInMonth(monthStart, 18),
      payee: "Street Food",
      memo: `${monthMemoPrefix} cash-food`,
      amount: -(2_200 + Math.abs(wave(monthIndex, 180))),
      status: "CLEARED",
      transferGroup: null,
    });

    const transferGroup = `seed-transfer-${monthKey}-${randomUUID()}`;
    const transferAmount = -(45_000 + Math.abs(wave(monthIndex, 800)));
    transactions.push({
      userId,
      accountId: checkingId,
      date: dateInMonth(monthStart, 3),
      payee: "Monthly Savings Transfer",
      memo: `${monthMemoPrefix} transfer-out`,
      amount: transferAmount,
      status: "CLEARED",
      transferGroup,
    });
    transactions.push({
      userId,
      accountId: savingsId,
      date: dateInMonth(monthStart, 3),
      payee: "Monthly Savings Transfer",
      memo: `${monthMemoPrefix} transfer-in`,
      amount: transferAmount * -1,
      status: "CLEARED",
      transferGroup,
    });
  }

  if (transactions.length > 0) {
    await prisma.transaction.createMany({
      data: transactions,
    });
  }

  console.log(
    `Seeded ${historyMonths} months of local dummy history with ${transactions.length} transactions for user ${userId}.`,
  );
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

  const withHistory = readFlag("--history") || process.env.APP_SEED_DEMO_HISTORY === "1";
  const forceHistory = readFlag("--force-history") || process.env.APP_SEED_FORCE_HISTORY === "1";
  const historyMonths = readHistoryMonths();

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
          usdRates: DEFAULT_USD_TO_DISPLAY_RATE,
          usdRatesFetchedAt: new Date(),
        },
      },
    },
  });

  const existingSettings = await prisma.setting.findUnique({ where: { userId: user.id } });
  if (!existingSettings) {
    await prisma.setting.create({
      data: {
        userId: user.id,
        currency: normalizeDisplayCurrency(process.env.APP_CURRENCY),
        timezone: process.env.APP_TIMEZONE ?? "UTC",
        monthStartDay: 1,
        usdRates: DEFAULT_USD_TO_DISPLAY_RATE,
        usdRatesFetchedAt: new Date(),
      },
    });
  }

  const groupByName = await ensureDefaultGroups(user.id);
  const systemGroup = groupByName.get("System");
  if (!systemGroup) {
    throw new Error("System category group is missing after seeding.");
  }

  await ensureInflowCategory(user.id, systemGroup.id);
  await ensureBaseCategories(user.id, groupByName);

  if (withHistory) {
    await seedDummyHistory(user.id, historyMonths, forceHistory);
  }

  console.log(
    withHistory
      ? `Seed complete for ${email} with ${historyMonths} months of local dummy budgeting history.`
      : `Seed complete for ${email}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
