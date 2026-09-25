"use client";

import type { Account, Category, CategoryGroup } from "@prisma/client";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

import { BudgetQuickAddForm } from "@/lib/components/budget-quick-add-form";
import { BudgetHeader } from "@/lib/components/budget-header";
import { BudgetInspector } from "@/lib/components/budget-inspector";
import { BudgetTable } from "@/lib/components/budget-table";
import { CategoriesManager } from "@/lib/components/categories-manager";
import { ModalShell } from "@/lib/components/modal-shell";
import {
  parseDisplayAmountToUsdCents,
  type UsdRateMap,
  usdCentsToDisplayInput,
} from "@/lib/money";
import type { BudgetMonthView, MonthKey, RecurringQueueItem } from "@/lib/types";

type FocusPreset = "all" | "overspent" | "underfunded" | "savings" | "custom";

type Props = {
  month: MonthKey;
  monthLabel: string;
  prevMonthHref: string;
  nextMonthHref: string;
  currency: string;
  usdRateMap: UsdRateMap;
  initialBudget: BudgetMonthView;
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  inflowCategoryId: string | null;
  inflowCategoryName: string;
  initialQuickDate: string;
  initialRecurringQueue: RecurringQueueItem[];
  recurringThroughDate: string;
  initialModal?: "quick-add" | "categories" | null;
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

function isUnderfundedRow(row: BudgetMonthView["categories"][number]) {
  return row.targetMonthly !== null && row.targetMonthly > row.assigned;
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
  categoryGroups,
  categories,
  inflowCategoryId,
  inflowCategoryName,
  initialQuickDate,
  initialRecurringQueue,
  recurringThroughDate,
  initialModal = null,
}: Props) {
  const [budget, setBudget] = useState(initialBudget);
  const [groupDefinitions, setGroupDefinitions] = useState(categoryGroups);
  const [categoryDefinitions, setCategoryDefinitions] = useState(categories);
  const [recurringQueue, setRecurringQueue] = useState(initialRecurringQueue);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>(
    buildAssignmentDrafts(initialBudget.categories, currency, usdRateMap),
  );
  const [coverSourceDrafts, setCoverSourceDrafts] = useState<Record<string, string>>(
    buildCoverSourceDrafts(initialBudget.categories),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    chooseInitialSelectedCategoryId(initialBudget.categories),
  );
  const [focusPreset, setFocusPreset] = useState<FocusPreset>("all");
  const [customGroupName, setCustomGroupName] = useState(
    initialBudget.categories.find((row) => !row.archived)?.groupName ?? initialBudget.categories[0]?.groupName ?? "",
  );
  const [autoAssignMode, setAutoAssignMode] = useState<"underfunded" | "overspent" | "overspent_then_underfunded">(
    "underfunded",
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((category) => [category.id, category.notes ?? ""])),
  );
  const [errors, setErrors] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [savingNoteCategoryId, setSavingNoteCategoryId] = useState<string | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(initialModal === "quick-add");
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(initialModal === "categories");

  const spendCategories = categoryDefinitions.filter((category) => category.specialType !== "INFLOW");

  const [quickDirection, setQuickDirection] = useState<"expense" | "income">("expense");
  const [quickDate, setQuickDate] = useState(initialQuickDate);
  const [quickAccountId, setQuickAccountId] = useState(accounts[0]?.id ?? "");
  const [quickCategoryId, setQuickCategoryId] = useState(spendCategories[0]?.id ?? "");
  const [quickPayee, setQuickPayee] = useState("");
  const [quickAmount, setQuickAmount] = useState("0");
  const [quickMemo, setQuickMemo] = useState("");
  const activeQuickCategoryId = spendCategories.some((category) => category.id === quickCategoryId)
    ? quickCategoryId
    : (spendCategories[0]?.id ?? "");

  const groupOptions = useMemo(
    () => [...new Set(budget.categories.map((row) => row.groupName))],
    [budget.categories],
  );

  const visibleCategories = useMemo(() => {
    const fallbackGroupName = groupOptions[0] ?? "";
    const activeCustomGroupName =
      customGroupName && groupOptions.includes(customGroupName) ? customGroupName : fallbackGroupName;

    return budget.categories.filter((row) => {
      switch (focusPreset) {
        case "overspent":
          return row.overspent;
        case "underfunded":
          return isUnderfundedRow(row);
        case "savings":
          return row.groupName === "Savings";
        case "custom":
          return row.groupName === activeCustomGroupName;
        case "all":
        default:
          return true;
      }
    });
  }, [budget.categories, customGroupName, focusPreset, groupOptions]);

  const filteredGroupedRows = useMemo(() => {
    const grouped = new Map<string, BudgetMonthView["categories"]>();
    for (const row of visibleCategories) {
      const current = grouped.get(row.groupName) ?? [];
      current.push(row);
      grouped.set(row.groupName, current);
    }
    return [...grouped.entries()];
  }, [visibleCategories]);

  const effectiveSelectedCategoryId =
    selectedCategoryId && visibleCategories.some((row) => row.categoryId === selectedCategoryId)
      ? selectedCategoryId
      : chooseInitialSelectedCategoryId(visibleCategories);

  const selectedRow = useMemo(
    () => visibleCategories.find((row) => row.categoryId === effectiveSelectedCategoryId) ?? null,
    [effectiveSelectedCategoryId, visibleCategories],
  );

  const selectedCategoryDefinition = useMemo(
    () => categoryDefinitions.find((category) => category.id === selectedRow?.categoryId) ?? null,
    [categoryDefinitions, selectedRow],
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

  function applyCategoryDefinitions(nextGroups: CategoryGroup[], nextCategories: Category[]) {
    setGroupDefinitions(nextGroups);
    setCategoryDefinitions(nextCategories);
    setNoteDrafts((previous) =>
      Object.fromEntries(nextCategories.map((category) => [category.id, previous[category.id] ?? category.notes ?? ""])),
    );
  }

  async function refreshWorkspace(options?: { includeCategories?: boolean }) {
    const includeCategories = options?.includeCategories ?? false;

    const requests = [fetch(`/api/budget/${month}`)];
    if (includeCategories) {
      requests.push(fetch("/api/categories"));
    }

    const responses = await Promise.all(requests);
    const budgetResponse = responses[0];
    const budgetPayload = await budgetResponse.json();
    if (!budgetResponse.ok) {
      setErrors(budgetPayload.error ?? "Failed to refresh the budget.");
      return false;
    }

    applyBudgetUpdate(budgetPayload.budget);

    if (includeCategories) {
      const categoriesResponse = responses[1];
      const categoriesPayload = await categoriesResponse.json();
      if (!categoriesResponse.ok) {
        setErrors(categoriesPayload.error ?? "Budget refreshed, but categories did not.");
        return false;
      }

      applyCategoryDefinitions(categoriesPayload.groups, categoriesPayload.categories);
    }

    return true;
  }

  async function saveAssignment(categoryId: string, assignedDisplayAmount: string) {
    if (budget.status === "CLOSED") {
      setErrors("This month is closed.");
      return;
    }
    setErrors(null);
    setNotice(null);

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
    setNotice(null);

    let baseAmount = 0;
    try {
      baseAmount = Math.abs(parseDisplayAmountToUsdCents(quickAmount, currency, usdRateMap));
    } catch {
      setErrors("Amount must be a valid number.");
      return;
    }
    const signedAmount = quickDirection === "income" ? baseAmount : baseAmount * -1;
    const categoryId = quickDirection === "income" ? inflowCategoryId : activeQuickCategoryId;

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
    const refreshed = await refreshWorkspace();
    if (!refreshed) {
      return;
    }

    setQuickPayee("");
    setQuickMemo("");
    setQuickAmount("0");
    setIsQuickAddOpen(false);
    setNotice("Transaction added to this month.");
  }

  async function toggleMonthStatus() {
    setErrors(null);
    setNotice(null);
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

  async function autoAssignBudget() {
    if (budget.status === "CLOSED") {
      setErrors("This month is closed.");
      return;
    }

    setErrors(null);
    setNotice(null);
    setWorking(true);
    const response = await fetch(`/api/budget/${month}/fund-targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: autoAssignMode }),
    });
    const payload = await response.json();
    setWorking(false);
    if (!response.ok) {
      setErrors(payload.error ?? "Failed to auto-assign");
      return;
    }

    applyBudgetUpdate(payload.budget);
    setNotice(
      payload.fundedCount
        ? `Auto-assign updated ${payload.fundedCount} categor${payload.fundedCount === 1 ? "y" : "ies"}.`
        : "Auto-assign did not change any categories.",
    );
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

  async function saveCategoryNote(categoryId: string) {
    const existingCategory = categoryDefinitions.find((category) => category.id === categoryId);
    if (!existingCategory) {
      return;
    }

    const nextNotes = (noteDrafts[categoryId] ?? "").trim();
    const normalizedNotes = nextNotes ? nextNotes : null;
    if ((existingCategory.notes ?? null) === normalizedNotes) {
      return;
    }

    setErrors(null);
    setNotice(null);
    setSavingNoteCategoryId(categoryId);
    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: categoryId, notes: normalizedNotes }),
    });
    const payload = await response.json();
    setSavingNoteCategoryId(null);

    if (!response.ok) {
      setErrors(payload.error ?? "Failed to save category note");
      return;
    }

    setCategoryDefinitions((previous) =>
      previous.map((category) => (category.id === categoryId ? payload.category : category)),
    );
    setNoteDrafts((previous) => ({
      ...previous,
      [categoryId]: payload.category.notes ?? "",
    }));
  }

  async function generateRecurringForMonth() {
    if (!recurringQueue.length) {
      setNotice("No scheduled transactions are due in this month.");
      return;
    }

    setErrors(null);
    setNotice(null);
    setWorking(true);
    const response = await fetch("/api/recurring/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        throughDate: recurringThroughDate,
        ruleIds: recurringQueue.map((item) => item.ruleId),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setWorking(false);
      setErrors(payload.error ?? "Failed to generate scheduled transactions");
      return;
    }

    setWorking(false);
    const refreshed = await refreshWorkspace();
    if (!refreshed) {
      setErrors("Scheduled transactions were generated, but the budget did not refresh.");
      return;
    }

    setRecurringQueue([]);
    setNotice(
      payload.createdCount
        ? `Generated ${payload.createdCount} scheduled transaction${payload.createdCount === 1 ? "" : "s"} for this month.`
        : "No scheduled transactions needed to be generated.",
    );
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
          autoAssignMode={autoAssignMode}
          onAutoAssignModeChange={setAutoAssignMode}
          onAutoAssign={autoAssignBudget}
          onToggleMonthStatus={toggleMonthStatus}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          onOpenManageCategories={() => setIsManageCategoriesOpen(true)}
        />

        {errors ? <p className="alert">{errors}</p> : null}
        {notice ? <p className="budget-notice">{notice}</p> : null}
        {budget.warnings.length ? (
          <section className="budget-warning-strip">
            <strong>Warnings</strong>
            <span>{budget.warnings.join("; ")}</span>
          </section>
        ) : null}

        <BudgetTable
          groupedRows={filteredGroupedRows}
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
          focusPreset={focusPreset}
          customGroupName={customGroupName}
          groupOptions={groupOptions}
          visibleCategoryCount={visibleCategories.length}
          totalCategoryCount={budget.categories.length}
          onFocusPresetChange={setFocusPreset}
          onCustomGroupNameChange={setCustomGroupName}
        />
      </div>

      <BudgetInspector
        selectedRow={selectedRow}
        selectedCategoryDefinition={selectedCategoryDefinition}
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
        noteDraft={selectedRow ? noteDrafts[selectedRow.categoryId] ?? "" : ""}
        savingNote={selectedRow ? savingNoteCategoryId === selectedRow.categoryId : false}
        onNoteDraftChange={(value) => {
          if (!selectedRow) return;
          setNoteDrafts((previous) => ({
            ...previous,
            [selectedRow.categoryId]: value,
          }));
        }}
        onSaveNote={() => {
          if (!selectedRow) return;
          void saveCategoryNote(selectedRow.categoryId);
        }}
        recurringQueue={recurringQueue}
        onGenerateRecurring={generateRecurringForMonth}
      />

      {isQuickAddOpen ? (
        <ModalShell title="Add transaction" subtitle={`${monthLabel} activity`} onClose={() => setIsQuickAddOpen(false)}>
          <BudgetQuickAddForm
            monthStatus={budget.status}
            quickDirection={quickDirection}
            quickDate={quickDate}
            quickAccountId={quickAccountId}
            quickCategoryId={activeQuickCategoryId}
            quickPayee={quickPayee}
            quickAmount={quickAmount}
            quickMemo={quickMemo}
            currency={currency}
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
        </ModalShell>
      ) : null}

      {isManageCategoriesOpen ? (
        <ModalShell
          title="Manage categories"
          subtitle="Update groups, reorder categories, archive, or move existing activity."
          size="large"
          onClose={() => setIsManageCategoriesOpen(false)}
        >
          <CategoriesManager
            initialGroups={groupDefinitions}
            initialCategories={categoryDefinitions}
            currency={currency}
            usdRateMap={usdRateMap}
            onChangeCommitted={() => {
              void refreshWorkspace({ includeCategories: true });
            }}
          />
        </ModalShell>
      ) : null}
    </div>
  );
}
