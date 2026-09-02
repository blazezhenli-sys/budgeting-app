"use client";

import type { Account, Category } from "@prisma/client";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { BudgetHeader } from "@/lib/components/budget-header";
import { BudgetInspector } from "@/lib/components/budget-inspector";
import { BudgetTable } from "@/lib/components/budget-table";
import {
  parseDisplayAmountToUsdCents,
  type UsdRateMap,
  usdCentsToDisplayInput,
} from "@/lib/money";
import type { BudgetMonthView, MonthKey } from "@/lib/types";

type Props = {
  month: MonthKey;
  monthLabel: string;
  prevMonthHref: string;
  nextMonthHref: string;
  currency: string;
  usdRateMap: UsdRateMap;
  initialBudget: BudgetMonthView;
  accounts: Account[];
  categories: Category[];
  inflowCategoryId: string | null;
  inflowCategoryName: string;
  initialQuickDate: string;
};

function buildAssignmentDrafts(
  categories: BudgetMonthView["categories"],
  currency: string,
  usdRateMap: UsdRateMap,
): Record<string, string> {
  return Object.fromEntries(
    categories.map((row) => [row.categoryId, usdCentsToDisplayInput(row.assigned, currency, usdRateMap)]),
  );
}

function eligibleCoverSources(
  categories: BudgetMonthView["categories"],
  overspentCategoryId: string,
): BudgetMonthView["categories"] {
  return categories.filter((row) => row.categoryId !== overspentCategoryId && row.available > 0);
}

function buildCoverSourceDrafts(
  categories: BudgetMonthView["categories"],
  previous: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const row of categories) {
    if (!row.overspent) {
      continue;
    }

    const eligible = eligibleCoverSources(categories, row.categoryId);
    const preserved = previous[row.categoryId];
    next[row.categoryId] = eligible.some((candidate) => candidate.categoryId === preserved)
      ? preserved
      : (eligible[0]?.categoryId ?? "");
  }

  return next;
}

function chooseInitialSelectedCategoryId(categories: BudgetMonthView["categories"]) {
  return categories.find((row) => row.overspent)?.categoryId ?? categories[0]?.categoryId ?? null;
}

export function BudgetWorkspace({
  month,
  monthLabel,
  prevMonthHref,
  nextMonthHref,
  currency,
  usdRateMap,
  initialBudget,
  accounts,
  categories,
  inflowCategoryId,
  inflowCategoryName,
  initialQuickDate,
}: Props) {
  const router = useRouter();
  const [budget, setBudget] = useState(initialBudget);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>(
    buildAssignmentDrafts(initialBudget.categories, currency, usdRateMap),
  );
  const [coverSourceDrafts, setCoverSourceDrafts] = useState<Record<string, string>>(
    buildCoverSourceDrafts(initialBudget.categories),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    chooseInitialSelectedCategoryId(initialBudget.categories),
  );
  const [errors, setErrors] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const spendCategories = categories.filter((category) => category.specialType !== "INFLOW");

  const [quickDirection, setQuickDirection] = useState<"expense" | "income">("expense");
  const [quickDate, setQuickDate] = useState(initialQuickDate);
  const [quickAccountId, setQuickAccountId] = useState(accounts[0]?.id ?? "");
  const [quickCategoryId, setQuickCategoryId] = useState(spendCategories[0]?.id ?? "");
  const [quickPayee, setQuickPayee] = useState("");
  const [quickAmount, setQuickAmount] = useState("0");
  const [quickMemo, setQuickMemo] = useState("");

  const groupedRows = useMemo(() => {
    const grouped = new Map<string, typeof budget.categories>();
    for (const row of budget.categories) {
      const current = grouped.get(row.groupName) ?? [];
      current.push(row);
      grouped.set(row.groupName, current);
    }
    return [...grouped.entries()];
  }, [budget]);

  const effectiveSelectedCategoryId =
    selectedCategoryId && budget.categories.some((row) => row.categoryId === selectedCategoryId)
      ? selectedCategoryId
      : chooseInitialSelectedCategoryId(budget.categories);

  const selectedRow = useMemo(
    () => budget.categories.find((row) => row.categoryId === effectiveSelectedCategoryId) ?? null,
    [budget.categories, effectiveSelectedCategoryId],
  );

  const coverOptions = useMemo(
    () => (selectedRow?.overspent ? eligibleCoverSources(budget.categories, selectedRow.categoryId) : []),
    [budget.categories, selectedRow],
  );

  function applyBudgetUpdate(nextBudget: BudgetMonthView) {
    setBudget(nextBudget);
    setAssignmentDrafts(buildAssignmentDrafts(nextBudget.categories, currency, usdRateMap));
    setCoverSourceDrafts((previous) => buildCoverSourceDrafts(nextBudget.categories, previous));
  }

  async function saveAssignment(categoryId: string, assignedDisplayAmount: string) {
    if (budget.status === "CLOSED") {
      setErrors("This month is closed.");
      return;
    }
    setErrors(null);

    let assignedUsd = 0;
    try {
      assignedUsd = parseDisplayAmountToUsdCents(assignedDisplayAmount, currency, usdRateMap);
    } catch {
      setErrors("Assigned amount must be a valid number.");
      return;
    }

    const existing = budget.categories.find((row) => row.categoryId === categoryId)?.assigned;
    if (existing === assignedUsd) {
      return;
    }

    const response = await fetch(`/api/budget/${month}/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        assignments: [{ categoryId, assigned: assignedUsd }],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setErrors(payload.error ?? "Failed to save assignment");
      setAssignmentDrafts((previous) => ({
        ...previous,
        [categoryId]: usdCentsToDisplayInput(existing ?? 0, currency, usdRateMap),
      }));
      return;
    }

    applyBudgetUpdate(payload.budget);
  }

  function onAssignmentKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  async function addQuickTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (budget.status === "CLOSED") {
      setErrors("This month is closed. Reopen it to add transactions.");
      return;
    }
    setErrors(null);

    let baseAmount = 0;
    try {
      baseAmount = Math.abs(parseDisplayAmountToUsdCents(quickAmount, currency, usdRateMap));
    } catch {
      setErrors("Amount must be a valid number.");
      return;
    }
    const signedAmount = quickDirection === "income" ? baseAmount : baseAmount * -1;
    const categoryId = quickDirection === "income" ? inflowCategoryId : quickCategoryId;

    if (quickDirection === "income" && !inflowCategoryId) {
      setErrors("Inflow category is unavailable.");
      return;
    }

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: quickDate,
        accountId: quickAccountId,
        categoryId,
        payee: quickPayee,
        memo: quickMemo,
        amount: signedAmount,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setErrors(payload.error ?? "Failed to create transaction");
      return;
    }

    setQuickPayee("");
    setQuickMemo("");
    setQuickAmount("0");
    router.refresh();
  }

  async function toggleMonthStatus() {
    setErrors(null);
    setWorking(true);
    const nextStatus = budget.status === "OPEN" ? "CLOSED" : "OPEN";

    const response = await fetch(`/api/budget/${month}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, status: nextStatus }),
    });

    const payload = await response.json();
    setWorking(false);
    if (!response.ok) {
      setErrors(payload.error ?? "Failed to change month status");
      return;
    }

    applyBudgetUpdate(payload.budget);
  }

  async function fundAllTargets() {
    if (budget.status === "CLOSED") {
      setErrors("This month is closed.");
      return;
    }

    setErrors(null);
    setWorking(true);
    const response = await fetch(`/api/budget/${month}/fund-targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    setWorking(false);
    if (!response.ok) {
      setErrors(payload.error ?? "Failed to fund targets");
      return;
    }

    applyBudgetUpdate(payload.budget);
  }

  async function fundRowToTarget(row: BudgetMonthView["categories"][number]) {
    if (budget.status === "CLOSED") {
      setErrors("This month is closed.");
      return;
    }
    if (!row.targetMonthly || row.targetMonthly <= 0) return;
    if (row.assigned === row.targetMonthly) return;

    await saveAssignment(row.categoryId, usdCentsToDisplayInput(row.targetMonthly, currency, usdRateMap));
  }

  async function coverOverspending(row: BudgetMonthView["categories"][number]) {
    if (budget.status === "CLOSED") {
      setErrors("This month is closed.");
      return;
    }

    const sourceCategoryId = coverSourceDrafts[row.categoryId];
    if (!sourceCategoryId) {
      setErrors("Choose a source category with available funds.");
      return;
    }

    setErrors(null);
    setWorking(true);
    const response = await fetch(`/api/budget/${month}/cover-overspending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        overspentCategoryId: row.categoryId,
        sourceCategoryId,
      }),
    });
    const payload = await response.json();
    setWorking(false);
    if (!response.ok) {
      setErrors(payload.error ?? "Failed to cover overspending");
      return;
    }

    applyBudgetUpdate(payload.budget);
  }

  return (
    <div className="budget-workspace">
      <div className="budget-workspace__main">
        <BudgetHeader
          month={month}
          monthLabel={monthLabel}
          prevMonthHref={prevMonthHref}
          nextMonthHref={nextMonthHref}
          currency={currency}
          usdRateMap={usdRateMap}
          budget={budget}
          working={working}
          onFundAllTargets={fundAllTargets}
          onToggleMonthStatus={toggleMonthStatus}
        />

        {errors ? <p className="alert">{errors}</p> : null}
        {budget.warnings.length ? (
          <section className="budget-warning-strip">
            <strong>Warnings</strong>
            <span>{budget.warnings.join("; ")}</span>
          </section>
        ) : null}

        <BudgetTable
          groupedRows={groupedRows}
          selectedCategoryId={effectiveSelectedCategoryId}
          assignmentDrafts={assignmentDrafts}
          currency={currency}
          usdRateMap={usdRateMap}
          monthStatus={budget.status}
          onSelectCategory={setSelectedCategoryId}
          onAssignmentChange={(categoryId, value) =>
            setAssignmentDrafts((previous) => ({
              ...previous,
              [categoryId]: value,
            }))
          }
          onAssignmentSave={saveAssignment}
          onAssignmentKeyDown={onAssignmentKeyDown}
          onFundRowToTarget={fundRowToTarget}
        />
      </div>

      <BudgetInspector
        selectedRow={selectedRow}
        currency={currency}
        usdRateMap={usdRateMap}
        monthStatus={budget.status}
        working={working}
        coverOptions={coverOptions}
        selectedCoverSourceId={selectedRow ? coverSourceDrafts[selectedRow.categoryId] ?? "" : ""}
        onCoverSourceChange={(value) => {
          if (!selectedRow) return;
          setCoverSourceDrafts((previous) => ({
            ...previous,
            [selectedRow.categoryId]: value,
          }));
        }}
        onFundRowToTarget={fundRowToTarget}
        onCoverOverspending={coverOverspending}
        quickDirection={quickDirection}
        quickDate={quickDate}
        quickAccountId={quickAccountId}
        quickCategoryId={quickCategoryId}
        quickPayee={quickPayee}
        quickAmount={quickAmount}
        quickMemo={quickMemo}
        accounts={accounts}
        spendCategories={spendCategories}
        inflowCategoryId={inflowCategoryId}
        inflowCategoryName={inflowCategoryName}
        onQuickDirectionChange={setQuickDirection}
        onQuickDateChange={setQuickDate}
        onQuickAccountChange={setQuickAccountId}
        onQuickCategoryChange={setQuickCategoryId}
        onQuickPayeeChange={setQuickPayee}
        onQuickAmountChange={setQuickAmount}
        onQuickMemoChange={setQuickMemo}
        onQuickSubmit={addQuickTransaction}
      />
    </div>
  );
}
