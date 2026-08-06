"use client";

import type { Account, Category } from "@prisma/client";
import { FormEvent, Fragment, KeyboardEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatUsdMoney,
  parseDisplayAmountToUsdCents,
  type UsdRateMap,
  usdCentsToDisplayInput,
} from "@/lib/money";
import type { BudgetMonthView, MonthKey } from "@/lib/types";

type Props = {
  month: MonthKey;
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

export function BudgetBoard({
  month,
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
    <div className="grid">
      <section className="card">
        <div className="inline-row" style={{ justifyContent: "space-between" }}>
          <h2>Month {month}</h2>
          <div className="inline-row">
            <span className={budget.status === "CLOSED" ? "badge-danger" : "muted"}>{budget.status}</span>
            <span className="muted">Ready to assign</span>
            <strong>{formatUsdMoney(budget.totals.availableToAssign, currency, usdRateMap)}</strong>
            <button type="button" className="secondary" onClick={fundAllTargets} disabled={working || budget.status === "CLOSED"}>
              Fund all targets
            </button>
            <button type="button" className="secondary" onClick={toggleMonthStatus} disabled={working}>
              {budget.status === "OPEN" ? "Close month" : "Reopen month"}
            </button>
          </div>
        </div>
        <div className="inline-row">
          <span className="muted">Income</span>
          <strong>{formatUsdMoney(budget.totals.income, currency, usdRateMap)}</strong>
          <span className="muted">Assigned</span>
          <strong>{formatUsdMoney(budget.totals.assigned, currency, usdRateMap)}</strong>
          <span className="muted">Spent</span>
          <strong>{formatUsdMoney(budget.totals.spent, currency, usdRateMap)}</strong>
        </div>
      </section>

      <section className="card">
        <h2>Quick add transaction</h2>
        <form onSubmit={addQuickTransaction}>
          <div className="inline-row">
            <label>
              Direction
              <select
                value={quickDirection}
                onChange={(event) => setQuickDirection(event.target.value as typeof quickDirection)}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label>
              Date
              <input type="date" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} required />
            </label>
            <label>
              Account
              <select value={quickAccountId} onChange={(event) => setQuickAccountId(event.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              {quickDirection === "income" ? (
                <select value={inflowCategoryId ?? ""} disabled>
                  <option value={inflowCategoryId ?? ""}>{inflowCategoryName}</option>
                </select>
              ) : (
                <select value={quickCategoryId} onChange={(event) => setQuickCategoryId(event.target.value)}>
                  {spendCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              Amount ({currency})
              <input value={quickAmount} onChange={(event) => setQuickAmount(event.target.value)} required />
            </label>
          </div>
          {quickDirection === "income" ? (
            <p className="muted">Income uses {inflowCategoryName}.</p>
          ) : null}
          <label>
            Payee
            <input value={quickPayee} onChange={(event) => setQuickPayee(event.target.value)} required />
          </label>
          <label>
            Memo
            <input value={quickMemo} onChange={(event) => setQuickMemo(event.target.value)} />
          </label>
          <button type="submit" disabled={budget.status === "CLOSED"}>
            Add transaction
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Category budget</h2>
        {errors ? <p className="alert">{errors}</p> : null}
        {budget.warnings.length ? (
          <p className="muted">Warnings: {budget.warnings.join("; ")}</p>
        ) : (
          <p className="muted">No overspending warnings.</p>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Assigned</th>
                <th>Target</th>
                <th>Activity</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(([groupName, rows]) => (
                <Fragment key={groupName}>
                  <tr className="group-header-row">
                    <td colSpan={5}>{groupName}</td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.categoryId}>
                      <td>{row.categoryName}</td>
                      <td>
                        <input
                          value={
                            assignmentDrafts[row.categoryId] ?? usdCentsToDisplayInput(row.assigned, currency, usdRateMap)
                          }
                          onChange={(event) =>
                            setAssignmentDrafts((previous) => ({
                              ...previous,
                              [row.categoryId]: event.target.value,
                            }))
                          }
                          onBlur={() => saveAssignment(row.categoryId, assignmentDrafts[row.categoryId] ?? "0")}
                          onKeyDown={onAssignmentKeyDown}
                          style={{ width: "110px" }}
                          disabled={budget.status === "CLOSED"}
                        />
                      </td>
                      <td>
                        <div className="inline-row">
                          <span>{row.targetMonthly ? formatUsdMoney(row.targetMonthly, currency, usdRateMap) : "-"}</span>
                          {row.targetMonthly && row.targetMonthly > 0 ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={budget.status === "CLOSED"}
                              onClick={() => fundRowToTarget(row)}
                            >
                              Fund
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatUsdMoney(row.activity, currency, usdRateMap)}</td>
                      <td>
                        <div className="grid" style={{ gap: "0.4rem" }}>
                          <span className={row.overspent ? "badge-danger" : undefined}>
                            {formatUsdMoney(row.available, currency, usdRateMap)}
                          </span>
                          {row.overspent ? (
                            (() => {
                              const eligible = eligibleCoverSources(budget.categories, row.categoryId);
                              return eligible.length ? (
                                <div className="grid" style={{ gap: "0.35rem" }}>
                                  <span className="muted">Cover spending from</span>
                                  <div className="inline-row">
                                    <select
                                      value={coverSourceDrafts[row.categoryId] ?? ""}
                                      onChange={(event) =>
                                        setCoverSourceDrafts((previous) => ({
                                          ...previous,
                                          [row.categoryId]: event.target.value,
                                        }))
                                      }
                                      disabled={budget.status === "CLOSED" || working}
                                      style={{ minWidth: "170px" }}
                                    >
                                      {eligible.map((candidate) => (
                                        <option key={candidate.categoryId} value={candidate.categoryId}>
                                          {candidate.categoryName} ({formatUsdMoney(candidate.available, currency, usdRateMap)})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="secondary"
                                      disabled={budget.status === "CLOSED" || working}
                                      onClick={() => coverOverspending(row)}
                                    >
                                      Cover
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="muted">No categories with available funds.</span>
                              );
                            })()
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
