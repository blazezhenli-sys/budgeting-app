export type Money = number; // integer cents

export type MonthKey = `${number}-${number}`;

export type AccountType = "CASH" | "CHECKING" | "SAVINGS";
export type TransactionStatus = "CLEARED" | "UNCLEARED";
export type RecurringFrequency = "WEEKLY" | "MONTHLY";

export type ImportError = {
  row: number;
  field: string;
  reason: string;
};

export type BudgetCategoryRow = {
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
  assigned: Money;
  activity: Money;
  available: Money;
  targetMonthly: Money | null;
  overspent: boolean;
  archived: boolean;
};

export type BudgetMonthView = {
  month: MonthKey;
  status: "OPEN" | "CLOSED";
  totals: {
    income: Money;
    assigned: Money;
    spent: Money;
    availableToAssign: Money;
  };
  categories: BudgetCategoryRow[];
  warnings: string[];
};

export type NetWorthTrendPoint = {
  month: MonthKey;
  netWorth: Money;
  changeFromPrevious: Money;
};

export type SpendingByGroupRow = {
  groupName: string;
  spent: Money;
  share: number;
  categoryCount: number;
};

export type TopSpendingCategoryRow = {
  categoryId: string;
  categoryName: string;
  groupName: string;
  spent: Money;
  share: number;
};

export type TopPayeeRow = {
  payee: string;
  spent: Money;
  share: number;
};

export type MonthlyReportView = {
  month: MonthKey;
  totals: BudgetMonthView["totals"];
  categorySummary: BudgetCategoryRow[];
  warnings: string[];
  netWorthTrend: NetWorthTrendPoint[];
  spendingByGroup: SpendingByGroupRow[];
  topSpendingCategories: TopSpendingCategoryRow[];
  topPayees: TopPayeeRow[];
};
