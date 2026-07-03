"use client";

import type { Account, Category } from "@prisma/client";
import { FormEvent, useMemo, useState } from "react";

import { formatUsdMoney, parseDisplayAmountToUsdCents, type UsdRateMap, usdCentsToDisplayInput } from "@/lib/money";

type TransactionRow = {
  id: string;
  date: string;
  payee: string;
  memo: string | null;
  amount: number;
  status: "CLEARED" | "UNCLEARED";
  transferGroup: string | null;
  account: { id: string; name: string };
  categoryId: string | null;
  category: { id: string; name: string } | null;
  splits: Array<{
    id: string;
    amount: number;
    memo: string | null;
    category: { name: string };
  }>;
};

type SplitDraft = {
  categoryId: string;
  amount: string;
  memo: string;
};

type Props = {
  initialTransactions: TransactionRow[];
  accounts: Account[];
  categories: Category[];
  inflowCategoryId: string | null;
  currency: string;
  usdRateMap: UsdRateMap;
  initialDate: string;
};

export function TransactionsManager({
  initialTransactions,
  accounts,
  categories,
  inflowCategoryId,
  currency,
  usdRateMap,
  initialDate,
}: Props) {
  const initialSpendCategoryId = categories.find((category) => category.specialType !== "INFLOW")?.id ?? "";
  const inflowCategory =
    categories.find((category) => category.id === inflowCategoryId) ??
    categories.find((category) => category.specialType === "INFLOW") ??
    null;

  const [transactions, setTransactions] = useState(initialTransactions);
  const [type, setType] = useState<"standard" | "transfer">("standard");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(initialDate);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [targetAccountId, setTargetAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(initialSpendCategoryId);
  const [payee, setPayee] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("0");
  const [useSplits, setUseSplits] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([
    { categoryId: initialSpendCategoryId, amount: "0", memo: "" },
  ]);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(initialDate);
  const [editAccountId, setEditAccountId] = useState(accounts[0]?.id ?? "");
  const [editCategoryId, setEditCategoryId] = useState(initialSpendCategoryId);
  const [editDirection, setEditDirection] = useState<"expense" | "income">("expense");
  const [editPayee, setEditPayee] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editAmount, setEditAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const spendCategories = categories.filter((category) => category.specialType !== "INFLOW");

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions],
  );

  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let baseAmount = 0;
    try {
      baseAmount = Math.abs(parseDisplayAmountToUsdCents(amount, currency, usdRateMap));
    } catch {
      setError("Amount must be a valid number.");
      return;
    }

    const signedAmount =
      type === "transfer" ? baseAmount * -1 : direction === "income" ? baseAmount : baseAmount * -1;

    const categoryForRequest =
      type === "transfer" || useSplits ? null : direction === "income" ? inflowCategoryId : categoryId;

    let splitPayload: Array<{ categoryId: string; amount: number; memo?: string | null }> | undefined;
    if (type === "standard" && direction === "expense" && useSplits) {
      splitPayload = [];
      let splitTotal = 0;
      for (const draft of splitDrafts) {
        if (!draft.categoryId) {
          setError("Each split row needs a category.");
          return;
        }
        let parsedSplit = 0;
        try {
          parsedSplit = Math.abs(parseDisplayAmountToUsdCents(draft.amount, currency, usdRateMap));
        } catch {
          setError("Each split amount must be a valid number.");
          return;
        }

        splitTotal += parsedSplit;
        splitPayload.push({
          categoryId: draft.categoryId,
          amount: parsedSplit * -1,
          memo: draft.memo || null,
        });
      }

      if (splitTotal !== baseAmount) {
        setError("Split amounts must add up to the transaction amount.");
        return;
      }
    }

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        date,
        accountId,
        targetAccountId,
        categoryId: categoryForRequest,
        payee,
        memo,
        amount: signedAmount,
        splits: splitPayload,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to create transaction");
      return;
    }

    if (payload.transaction) {
      setTransactions((previous) => [payload.transaction, ...previous]);
    }
    if (payload.transactions) {
      window.location.reload();
      return;
    }
    setPayee("");
    setMemo("");
    setAmount("0");
    setUseSplits(false);
    setSplitDrafts([{ categoryId: spendCategories[0]?.id ?? "", amount: "0", memo: "" }]);
  }

  async function deleteTransaction(id: string) {
    const response = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Failed to delete transaction");
      return;
    }

    const payload = await response.json();
    if (payload.transferGroup) {
      setTransactions((previous) => previous.filter((row) => row.transferGroup !== payload.transferGroup));
      return;
    }

    setTransactions((previous) => previous.filter((row) => row.id !== id));
  }

  function isEditableTransaction(transaction: TransactionRow): boolean {
    return !transaction.transferGroup && transaction.splits.length === 0;
  }

  function startEditing(transaction: TransactionRow) {
    if (!isEditableTransaction(transaction)) {
      setError("Transfer and split transactions must be deleted and recreated.");
      return;
    }

    setError(null);
    setEditingTransactionId(transaction.id);
    setEditDate(transaction.date.slice(0, 10));
    setEditAccountId(transaction.account.id);
    setEditPayee(transaction.payee);
    setEditMemo(transaction.memo ?? "");
    setEditDirection(transaction.amount >= 0 ? "income" : "expense");
    setEditAmount(usdCentsToDisplayInput(Math.abs(transaction.amount), currency, usdRateMap));
    setEditCategoryId(transaction.categoryId ?? initialSpendCategoryId);
  }

  function cancelEditing() {
    setEditingTransactionId(null);
  }

  async function saveEditingTransaction() {
    if (!editingTransactionId) return;
    setError(null);

    let baseAmount = 0;
    try {
      baseAmount = Math.abs(parseDisplayAmountToUsdCents(editAmount, currency, usdRateMap));
    } catch {
      setError("Amount must be a valid number.");
      return;
    }

    if (baseAmount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    const signedAmount = editDirection === "income" ? baseAmount : baseAmount * -1;
    const categoryForRequest = editDirection === "income" ? inflowCategoryId : editCategoryId;

    if (editDirection === "income" && !inflowCategoryId) {
      setError("Inflow category unavailable.");
      return;
    }
    if (editDirection === "expense" && !categoryForRequest) {
      setError("Category is required for expense transactions.");
      return;
    }

    const response = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingTransactionId,
        date: editDate,
        accountId: editAccountId,
        categoryId: categoryForRequest,
        payee: editPayee,
        memo: editMemo || null,
        amount: signedAmount,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update transaction");
      return;
    }

    const nextAccount = accounts.find((account) => account.id === editAccountId);
    const nextCategory =
      signedAmount > 0
        ? categories.find((category) => category.id === inflowCategoryId) ?? null
        : categories.find((category) => category.id === categoryForRequest) ?? null;

    setTransactions((previous) =>
      previous.map((row) =>
        row.id === editingTransactionId
          ? {
              ...row,
              date: new Date(editDate).toISOString(),
              payee: editPayee,
              memo: editMemo || null,
              amount: signedAmount,
              account: {
                id: editAccountId,
                name: nextAccount?.name ?? row.account.name,
              },
              categoryId: categoryForRequest ?? null,
              category: nextCategory ? { id: nextCategory.id, name: nextCategory.name } : null,
            }
          : row,
      ),
    );
    setEditingTransactionId(null);
  }

  function addSplitRow() {
    setSplitDrafts((previous) => [...previous, { categoryId: spendCategories[0]?.id ?? "", amount: "0", memo: "" }]);
  }

  function removeSplitRow(index: number) {
    setSplitDrafts((previous) => {
      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [{ categoryId: spendCategories[0]?.id ?? "", amount: "0", memo: "" }];
    });
  }

  function updateSplit(index: number, patch: Partial<SplitDraft>) {
    setSplitDrafts((previous) =>
      previous.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Add transaction</h2>
        <form onSubmit={addTransaction}>
          <div className="inline-row">
            <label>
              Type
              <select
                value={type}
                onChange={(event) => {
                  const nextType = event.target.value as typeof type;
                  setType(nextType);
                  if (nextType === "transfer") {
                    setUseSplits(false);
                  }
                }}
              >
                <option value="standard">Standard</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>

            {type === "standard" ? (
              <label>
                Direction
                <select
                  value={direction}
                  onChange={(event) => {
                    const nextDirection = event.target.value as typeof direction;
                    setDirection(nextDirection);
                    if (nextDirection === "income") {
                      setUseSplits(false);
                    }
                  }}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
            ) : null}

            <label>
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
          </div>

          <div className="inline-row">
            <label>
              Account
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            {type === "transfer" ? (
              <label>
                Target account
                <select value={targetAccountId} onChange={(event) => setTargetAccountId(event.target.value)} required>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Category
                {direction === "income" ? (
                  <select value={inflowCategoryId ?? ""} disabled>
                    {inflowCategory ? (
                      <option value={inflowCategory.id}>{inflowCategory.name}</option>
                    ) : (
                      <option value="">Inflow category unavailable</option>
                    )}
                  </select>
                ) : (
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
                    {spendCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}

            <label>
              Amount ({currency})
              <input value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </label>
          </div>

          {type === "standard" && direction === "expense" ? (
            <label>
              <span>Split by category</span>
              <select
                value={useSplits ? "yes" : "no"}
                onChange={(event) => setUseSplits(event.target.value === "yes")}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          ) : null}

          {type === "standard" && direction === "expense" && useSplits ? (
            <div className="grid" style={{ marginBottom: "0.5rem" }}>
              <h3>Split details</h3>
              {splitDrafts.map((split, index) => (
                <div key={`split-${index}`} className="inline-row">
                  <select
                    value={split.categoryId}
                    onChange={(event) => updateSplit(index, { categoryId: event.target.value })}
                  >
                    {spendCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={split.amount}
                    onChange={(event) => updateSplit(index, { amount: event.target.value })}
                    placeholder={`Amount (${currency})`}
                  />
                  <input
                    value={split.memo}
                    onChange={(event) => updateSplit(index, { memo: event.target.value })}
                    placeholder="Split memo (optional)"
                  />
                  <button type="button" className="secondary" onClick={() => removeSplitRow(index)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="secondary" onClick={addSplitRow}>
                Add split row
              </button>
            </div>
          ) : null}

          {type === "standard" && direction === "income" ? (
            <p className="muted">Income uses {inflowCategory?.name ?? "Inflow: Ready to Assign"}.</p>
          ) : null}

          <label>
            Payee
            <input value={payee} onChange={(event) => setPayee(event.target.value)} required />
          </label>
          <label>
            Memo
            <input value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>

          {error ? <p className="alert">{error}</p> : null}
          <button type="submit">Save transaction</button>
        </form>
      </section>

      <section className="card">
        <h2>Transactions</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Account</th>
                <th>Category</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    {editingTransactionId === transaction.id ? (
                      <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                    ) : (
                      transaction.date.slice(0, 10)
                    )}
                  </td>
                  <td>
                    {editingTransactionId === transaction.id ? (
                      <div className="grid">
                        <input value={editPayee} onChange={(event) => setEditPayee(event.target.value)} />
                        <input
                          placeholder="Memo (optional)"
                          value={editMemo}
                          onChange={(event) => setEditMemo(event.target.value)}
                        />
                      </div>
                    ) : (
                      transaction.payee
                    )}
                  </td>
                  <td>
                    {editingTransactionId === transaction.id ? (
                      <select value={editAccountId} onChange={(event) => setEditAccountId(event.target.value)}>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      transaction.account?.name ?? "-"
                    )}
                  </td>
                  <td>
                    {editingTransactionId === transaction.id ? (
                      editDirection === "income" ? (
                        inflowCategory?.name ?? "Inflow"
                      ) : (
                        <select value={editCategoryId} onChange={(event) => setEditCategoryId(event.target.value)}>
                          {spendCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      )
                    ) : transaction.transferGroup ? (
                      "Transfer"
                    ) : transaction.splits.length ? (
                      `Split (${transaction.splits.length})`
                    ) : (
                      transaction.category?.name ?? "Inflow"
                    )}
                  </td>
                  <td>
                    {editingTransactionId === transaction.id ? (
                      <div className="grid">
                        <select
                          value={editDirection}
                          onChange={(event) => setEditDirection(event.target.value as "expense" | "income")}
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                        <input value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
                      </div>
                    ) : (
                      formatUsdMoney(transaction.amount, currency, usdRateMap)
                    )}
                  </td>
                  <td>
                    <div className="inline-row">
                      {editingTransactionId === transaction.id ? (
                        <>
                          <button type="button" onClick={saveEditingTransaction}>
                            Save
                          </button>
                          <button type="button" className="secondary" onClick={cancelEditing}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startEditing(transaction)}
                          disabled={!isEditableTransaction(transaction)}
                          title={
                            isEditableTransaction(transaction)
                              ? "Edit transaction"
                              : "Transfer and split transactions must be deleted and recreated"
                          }
                        >
                          Edit
                        </button>
                      )}
                      <button type="button" className="secondary" onClick={() => deleteTransaction(transaction.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
