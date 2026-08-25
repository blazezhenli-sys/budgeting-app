import { z } from "zod";

import { DISPLAY_CURRENCIES } from "@/lib/money";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const accountSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["CASH", "CHECKING", "SAVINGS"]),
  openingBalance: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const accountPatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  type: z.enum(["CASH", "CHECKING", "SAVINGS"]).optional(),
  openingBalance: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const categoryGroupSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const categorySchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
  targetMonthly: z.number().int().min(0).nullable().optional(),
  archived: z.boolean().optional(),
});

export const categoryPatchSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1).optional(),
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().optional(),
  targetMonthly: z.number().int().min(0).nullable().optional(),
  archived: z.boolean().optional(),
});

export const categoryReorderSchema = z.object({
  kind: z.literal("reorder"),
  groupId: z.string().min(1),
  orderedCategoryIds: z.array(z.string().min(1)).min(1),
});

export const assignmentSchema = z.object({
  categoryId: z.string().min(1),
  assigned: z.number().int(),
});

export const budgetAssignmentSchema = z.object({
  month: z.string().regex(monthRegex),
  assignments: z.array(assignmentSchema),
});

export const budgetCoverOverspendingSchema = z.object({
  month: z.string().regex(monthRegex),
  overspentCategoryId: z.string().min(1),
  sourceCategoryId: z.string().min(1),
});

export const transactionSchema = z.object({
  date: z.string().min(1),
  accountId: z.string().min(1),
  payee: z.string().min(1),
  memo: z.string().optional().nullable(),
  amount: z.number().int(),
  categoryId: z.string().optional().nullable(),
  status: z.enum(["CLEARED", "UNCLEARED"]).default("UNCLEARED"),
  type: z.enum(["standard", "transfer"]).default("standard"),
  targetAccountId: z.string().optional().nullable(),
  splits: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        amount: z.number().int(),
        memo: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

export const transactionPatchSchema = z.object({
  id: z.string().min(1),
  date: z.string().optional(),
  accountId: z.string().optional(),
  payee: z.string().min(1).optional(),
  memo: z.string().nullable().optional(),
  amount: z.number().int().optional(),
  categoryId: z.string().nullable().optional(),
  status: z.enum(["CLEARED", "UNCLEARED"]).optional(),
});

export const recurringGenerateSchema = z.object({
  throughDate: z.string().regex(dateOnlyRegex).optional(),
  ruleIds: z.array(z.string().min(1)).optional(),
});

export const budgetMonthStatusSchema = z.object({
  month: z.string().regex(monthRegex),
  status: z.enum(["OPEN", "CLOSED"]),
});

export const csvImportSchema = z.object({
  fileName: z.string().min(1).max(200),
  csvText: z.string().min(1),
  commit: z.boolean().default(false),
});

export const settingsSchema = z.object({
  currency: z.enum(DISPLAY_CURRENCIES),
  timezone: z.string().min(1).max(100),
  monthStartDay: z.number().int().min(1).max(28),
});
