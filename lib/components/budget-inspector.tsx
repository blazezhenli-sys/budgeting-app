import type { Account, Category } from "@prisma/client";
import { FormEvent } from "react";

import { formatUsdMoney } from "@/lib/money";
import type { BudgetCategoryRow } from "@/lib/types";

type Props = {
  selectedRow: BudgetCategoryRow | null;
  currency: string;
  usdRateMap: import("@/lib/money").UsdRateMap;
  monthStatus: "OPEN" | "CLOSED";
  working: boolean;
  coverOptions: BudgetCategoryRow[];
  selectedCoverSourceId: string;
  onCoverSourceChange: (value: string) => void;
  onFundRowToTarget: (row: BudgetCategoryRow) => void;
  onCoverOverspending: (row: BudgetCategoryRow) => void;
  quickDirection: "expense" | "income";
  quickDate: string;
  quickAccountId: string;
  quickCategoryId: string;
  quickPayee: string;
  quickAmount: string;
  quickMemo: string;
  accounts: Account[];
  spendCategories: Category[];
  inflowCategoryId: string | null;
  inflowCategoryName: string;
  onQuickDirectionChange: (value: "expense" | "income") => void;
  onQuickDateChange: (value: string) => void;
  onQuickAccountChange: (value: string) => void;
  onQuickCategoryChange: (value: string) => void;
  onQuickPayeeChange: (value: string) => void;
  onQuickAmountChange: (value: string) => void;
  onQuickMemoChange: (value: string) => void;
  onQuickSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function BudgetInspector({
  selectedRow,
  currency,
  usdRateMap,
  monthStatus,
  working,
  coverOptions,
  selectedCoverSourceId,
  onCoverSourceChange,
  onFundRowToTarget,
  onCoverOverspending,
  quickDirection,
  quickDate,
  quickAccountId,
  quickCategoryId,
  quickPayee,
  quickAmount,
  quickMemo,
  accounts,
  spendCategories,
  inflowCategoryId,
  inflowCategoryName,
  onQuickDirectionChange,
  onQuickDateChange,
  onQuickAccountChange,
  onQuickCategoryChange,
  onQuickPayeeChange,
  onQuickAmountChange,
  onQuickMemoChange,
  onQuickSubmit,
}: Props) {
  const quickAddDisabled =
    monthStatus === "CLOSED" ||
    !accounts.length ||
    (quickDirection === "expense" ? !spendCategories.length : !inflowCategoryId);

  return (
    <aside className="budget-inspector">
      <section className="budget-inspector__section">
        <div className="budget-inspector__section-header">
          <h2>Inspector</h2>
          <span className="muted">{selectedRow ? selectedRow.groupName : "Month overview"}</span>
        </div>

        {selectedRow ? (
          <div className="budget-inspector__stack">
            <div>
              <h3>{selectedRow.categoryName}</h3>
              <p className="muted">{selectedRow.overspent ? "Overspent category" : "Selected category"}</p>
            </div>

            <div className="budget-inspector__stats">
              <div className="budget-inspector__stat">
                <span className="muted">Assigned</span>
                <strong>{formatUsdMoney(selectedRow.assigned, currency, usdRateMap)}</strong>
              </div>
              <div className="budget-inspector__stat">
                <span className="muted">Activity</span>
                <strong>{formatUsdMoney(selectedRow.activity, currency, usdRateMap)}</strong>
              </div>
              <div className="budget-inspector__stat">
                <span className="muted">Available</span>
                <strong className={selectedRow.overspent ? "badge-danger" : undefined}>
                  {formatUsdMoney(selectedRow.available, currency, usdRateMap)}
                </strong>
              </div>
              <div className="budget-inspector__stat">
                <span className="muted">Target</span>
                <strong>
                  {selectedRow.targetMonthly ? formatUsdMoney(selectedRow.targetMonthly, currency, usdRateMap) : "-"}
                </strong>
              </div>
            </div>

            {selectedRow.targetMonthly && selectedRow.targetMonthly > 0 ? (
              <button
                type="button"
                className="secondary"
                disabled={monthStatus === "CLOSED"}
                onClick={() => onFundRowToTarget(selectedRow)}
              >
                Fund selected category
              </button>
            ) : null}

            {selectedRow.overspent ? (
              coverOptions.length ? (
                <div className="budget-inspector__stack">
                  <label>
                    Cover overspending from
                    <select
                      value={selectedCoverSourceId}
                      onChange={(event) => onCoverSourceChange(event.target.value)}
                      disabled={monthStatus === "CLOSED" || working}
                    >
                      {coverOptions.map((candidate) => (
                        <option key={candidate.categoryId} value={candidate.categoryId}>
                          {candidate.categoryName} ({formatUsdMoney(candidate.available, currency, usdRateMap)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={monthStatus === "CLOSED" || working}
                    onClick={() => onCoverOverspending(selectedRow)}
                  >
                    Cover overspending
                  </button>
                </div>
              ) : (
                <p className="muted">No categories with available funds to cover this overspending.</p>
              )
            ) : (
              <p className="muted">Select an overspent category to move available funds from another category.</p>
            )}
          </div>
        ) : (
          <p className="muted">Select a category row to inspect details and run category-specific actions.</p>
        )}
      </section>

      <section className="budget-inspector__section">
        <div className="budget-inspector__section-header">
          <h2>Quick add</h2>
          <span className="muted">{monthStatus === "CLOSED" ? "Month closed" : "Add activity"}</span>
        </div>

        {!accounts.length ? <p className="muted">Create an account first to add transactions.</p> : null}
        {!spendCategories.length && quickDirection === "expense" ? (
          <p className="muted">Create a spending category before adding expenses.</p>
        ) : null}

        <form onSubmit={onQuickSubmit} className="budget-inspector__form">
          <label>
            Direction
            <select value={quickDirection} onChange={(event) => onQuickDirectionChange(event.target.value as "expense" | "income")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Date
            <input type="date" value={quickDate} onChange={(event) => onQuickDateChange(event.target.value)} required />
          </label>
          <label>
            Account
            <select value={quickAccountId} onChange={(event) => onQuickAccountChange(event.target.value)}>
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
              <select value={quickCategoryId} onChange={(event) => onQuickCategoryChange(event.target.value)}>
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
            <input value={quickAmount} onChange={(event) => onQuickAmountChange(event.target.value)} required />
          </label>
          <label>
            Payee
            <input value={quickPayee} onChange={(event) => onQuickPayeeChange(event.target.value)} required />
          </label>
          <label>
            Memo
            <input value={quickMemo} onChange={(event) => onQuickMemoChange(event.target.value)} />
          </label>
          {quickDirection === "income" ? <p className="muted">Income uses {inflowCategoryName}.</p> : null}
          <button type="submit" disabled={quickAddDisabled}>
            Add transaction
          </button>
        </form>
      </section>
    </aside>
  );
}
