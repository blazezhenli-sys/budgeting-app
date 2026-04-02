"use client";

import type { Account, Category } from "@prisma/client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { parseDisplayAmountToUsdCents, type UsdRateMap } from "@/lib/money";

type Props = {
  currency: string;
  accounts: Account[];
  categories: Category[];
  inflowCategoryId: string | null;
  inflowCategoryName: string;
  initialDate: string;
  usdRateMap: UsdRateMap;
};

export function FastCapture({
  currency,
  accounts,
  categories,
  inflowCategoryId,
  inflowCategoryName,
  initialDate,
  usdRateMap,
}: Props) {
  const router = useRouter();
  const spendCategories = categories.filter((category) => category.specialType !== "INFLOW");

  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(initialDate);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(spendCategories[0]?.id ?? "");
  const [payee, setPayee] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(destination: "new" | "ledger") {
    setError(null);

    let parsedAmount = 0;
    try {
      parsedAmount = Math.abs(parseDisplayAmountToUsdCents(amount, currency, usdRateMap));
    } catch {
      setError("Amount must be a valid number.");
      return;
    }

    const signedAmount = direction === "income" ? parsedAmount : parsedAmount * -1;
    const selectedCategoryId = direction === "income" ? inflowCategoryId : categoryId;
    if (!selectedCategoryId) {
      setError("Select a category.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        accountId,
        categoryId: selectedCategoryId,
        payee,
        memo,
        amount: signedAmount,
      }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Failed to save transaction");
      return;
    }

    if (destination === "ledger") {
      router.push("/transactions");
      return;
    }

    setPayee("");
    setMemo("");
    setAmount("0");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save("new");
  }

  return (
    <section className="card">
      <h2>Fast capture</h2>
      {!accounts.length ? <p className="muted">Create an account first to capture transactions.</p> : null}
      <form onSubmit={onSubmit}>
        <div className="inline-row">
          <label>
            Direction
            <select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label>
            Account
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="inline-row">
          <label>
            Category
            {direction === "income" ? (
              <select value={inflowCategoryId ?? ""} disabled>
                <option value={inflowCategoryId ?? ""}>{inflowCategoryName}</option>
              </select>
            ) : (
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
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
            <input value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label>
            Payee
            <input value={payee} onChange={(event) => setPayee(event.target.value)} required />
          </label>
        </div>

        <label>
          Memo
          <input value={memo} onChange={(event) => setMemo(event.target.value)} />
        </label>

        <div className="inline-row">
          <button type="submit" disabled={saving || !accounts.length}>
            Save + new
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving || !accounts.length}
            onClick={() => void save("ledger")}
          >
            Save + go to ledger
          </button>
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </form>
    </section>
  );
}
