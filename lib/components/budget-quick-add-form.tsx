"use client";

import type { Account, Category } from "@prisma/client";
import type { FormEvent } from "react";

type Props = {
  monthStatus: "OPEN" | "CLOSED";
  quickDirection: "expense" | "income";
  quickDate: string;
  quickAccountId: string;
  quickCategoryId: string;
  quickPayee: string;
  quickAmount: string;
  quickMemo: string;
  currency: string;
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

export function BudgetQuickAddForm({
  monthStatus,
  quickDirection,
  quickDate,
  quickAccountId,
  quickCategoryId,
  quickPayee,
  quickAmount,
  quickMemo,
  currency,
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
    <form onSubmit={onQuickSubmit} className="budget-inspector__form">
      {!accounts.length ? <p className="muted">Create an account first to add transactions.</p> : null}
      {!spendCategories.length && quickDirection === "expense" ? (
        <p className="muted">Create a spending category before adding expenses.</p>
      ) : null}

      <div className="budget-modal-form-grid">
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
      </div>
      <label>
        Memo
        <input value={quickMemo} onChange={(event) => onQuickMemoChange(event.target.value)} />
      </label>
      {quickDirection === "income" ? <p className="muted">Income uses {inflowCategoryName}.</p> : null}
      <div className="budget-modal-actions">
        <button type="submit" disabled={quickAddDisabled}>
          Add transaction
        </button>
      </div>
    </form>
  );
}
