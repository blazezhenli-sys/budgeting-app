"use client";

import { Category } from "@prisma/client";
import { FormEvent, useState } from "react";

import {
  formatUsdMoney,
  parseDisplayAmountToUsdCents,
  type UsdRateMap,
  usdCentsToDisplayInput,
} from "@/lib/money";

type AccountWithCounts = {
  id: string;
  name: string;
  type: "CASH" | "CHECKING" | "SAVINGS";
  openingBalance: number;
  archived: boolean;
  _count: {
    transactions: number;
    recurringRules: number;
  };
};

type Props = {
  initialAccounts: AccountWithCounts[];
  initialBalances: Record<string, number>;
  categories: Category[];
  currency: string;
  usdRateMap: UsdRateMap;
  initialReconcileDate: string;
};

export function AccountsManager({
  initialAccounts,
  initialBalances,
  categories,
  currency,
  usdRateMap,
  initialReconcileDate,
}: Props) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [balances, setBalances] = useState<Record<string, number>>(initialBalances);
  const [openingEdits, setOpeningEdits] = useState<Record<string, string>>(
    Object.fromEntries(
      initialAccounts.map((account) => [account.id, usdCentsToDisplayInput(account.openingBalance, currency, usdRateMap)]),
    ),
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<"CASH" | "CHECKING" | "SAVINGS">("CHECKING");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [reconcileAccountId, setReconcileAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [reconcileDate, setReconcileDate] = useState(initialReconcileDate);
  const [reconcileBalance, setReconcileBalance] = useState(
    initialAccounts[0] ? usdCentsToDisplayInput(initialBalances[initialAccounts[0].id] ?? 0, currency, usdRateMap) : "0",
  );
  const [shortfallCategoryId, setShortfallCategoryId] = useState(categories[0]?.id ?? "");
  const [reconcileMemo, setReconcileMemo] = useState("");
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        openingBalance: parseDisplayAmountToUsdCents(openingBalance, currency, usdRateMap),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to create account");
      return;
    }

    setAccounts((previous) => [...previous, payload.account]);
    setBalances((previous) => ({
      ...previous,
      [payload.account.id]: payload.account.openingBalance,
    }));
    setOpeningEdits((previous) => ({
      ...previous,
      [payload.account.id]: usdCentsToDisplayInput(payload.account.openingBalance, currency, usdRateMap),
    }));
    setName("");
    setOpeningBalance("0");
  }

  async function toggleArchive(account: AccountWithCounts) {
    const response = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, archived: !account.archived }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update account");
      return;
    }

    setAccounts((previous) => previous.map((item) => (item.id === account.id ? payload.account : item)));
  }

  async function saveOpeningBalance(account: AccountWithCounts) {
    setError(null);

    let nextOpeningBalance = 0;
    try {
      nextOpeningBalance = parseDisplayAmountToUsdCents(openingEdits[account.id] ?? "0", currency, usdRateMap);
    } catch {
      setError("Starting amount must be a valid number.");
      return;
    }

    const response = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, openingBalance: nextOpeningBalance }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update starting amount");
      return;
    }

    const delta = nextOpeningBalance - account.openingBalance;
    setAccounts((previous) => previous.map((item) => (item.id === account.id ? payload.account : item)));
    setBalances((previous) => ({
      ...previous,
      [account.id]: (previous[account.id] ?? account.openingBalance) + delta,
    }));
  }

  async function deleteAccount(account: AccountWithCounts) {
    setError(null);

    const response = await fetch(`/api/accounts?id=${account.id}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 409 && payload.dependencies) {
        setError(
          `Cannot delete ${account.name}: ${payload.dependencies.transactions} transactions and ${payload.dependencies.recurringRules} recurring rules depend on it.`,
        );
        return;
      }
      setError(payload.error ?? "Failed to delete account");
      return;
    }

    setAccounts((previous) => previous.filter((item) => item.id !== account.id));
    setBalances((previous) => {
      const next = { ...previous };
      delete next[account.id];
      return next;
    });
    setOpeningEdits((previous) => {
      const next = { ...previous };
      delete next[account.id];
      return next;
    });

    if (reconcileAccountId === account.id) {
      const nextAccount = accounts.find((item) => item.id !== account.id);
      if (nextAccount) {
        setReconcileAccountId(nextAccount.id);
        setReconcileBalance(
          usdCentsToDisplayInput(balances[nextAccount.id] ?? nextAccount.openingBalance, currency, usdRateMap),
        );
      } else {
        setReconcileAccountId("");
        setReconcileBalance("0");
      }
    }
  }

  async function reconcileAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReconcileMessage(null);

    let actualBalance = 0;
    try {
      actualBalance = parseDisplayAmountToUsdCents(reconcileBalance, currency, usdRateMap);
    } catch {
      setError("Actual balance must be a valid number.");
      return;
    }

    const response = await fetch("/api/accounts/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: reconcileAccountId,
        date: reconcileDate,
        actualBalance,
        shortfallCategoryId,
        memo: reconcileMemo || undefined,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to reconcile account");
      return;
    }

    setBalances((previous) => ({
      ...previous,
      [reconcileAccountId]: payload.actualBalance,
    }));

    if (!payload.changed) {
      setReconcileMessage("Already reconciled. No adjustment was needed.");
      return;
    }

    setReconcileMessage(`Reconciled with adjustment ${formatUsdMoney(payload.adjustmentAmount, currency, usdRateMap)}.`);
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Create account</h2>
        <form onSubmit={createAccount}>
          <label>
            Account name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="CASH">Cash</option>
              <option value="CHECKING">Checking</option>
              <option value="SAVINGS">Savings</option>
            </select>
          </label>
          <label>
            Opening balance ({currency})
            <input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} required />
          </label>
          {error ? <p className="alert">{error}</p> : null}
          <button type="submit">Add account</button>
        </form>

        <h2 style={{ marginTop: "1rem" }}>Reconcile account</h2>
        <form onSubmit={reconcileAccount}>
          <label>
            Account
            <select
              value={reconcileAccountId}
              onChange={(event) => {
                const nextId = event.target.value;
                setReconcileAccountId(nextId);
                setReconcileBalance(usdCentsToDisplayInput(balances[nextId] ?? 0, currency, usdRateMap));
              }}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            As-of date
            <input type="date" value={reconcileDate} onChange={(event) => setReconcileDate(event.target.value)} required />
          </label>
          <label>
            Actual balance ({currency})
            <input value={reconcileBalance} onChange={(event) => setReconcileBalance(event.target.value)} required />
          </label>
          <label>
            Shortfall category (used if actual is lower)
            <select value={shortfallCategoryId} onChange={(event) => setShortfallCategoryId(event.target.value)}>
              {categories.length ? (
                categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))
              ) : (
                <option value="">No categories available</option>
              )}
            </select>
          </label>
          <label>
            Memo
            <input value={reconcileMemo} onChange={(event) => setReconcileMemo(event.target.value)} />
          </label>
          <button type="submit" disabled={!accounts.length}>
            Reconcile now
          </button>
          {reconcileMessage ? <p className="muted">{reconcileMessage}</p> : null}
        </form>
      </section>

      <section className="card">
        <h2>Accounts</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Starting amount</th>
                <th>Current</th>
                <th>Status</th>
                <th>Dependencies</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.type}</td>
                  <td>
                    <div className="inline-row">
                      <input
                        value={
                          openingEdits[account.id] ?? usdCentsToDisplayInput(account.openingBalance, currency, usdRateMap)
                        }
                        onChange={(event) =>
                          setOpeningEdits((previous) => ({
                            ...previous,
                            [account.id]: event.target.value,
                          }))
                        }
                        style={{ width: "110px" }}
                      />
                      <button type="button" className="secondary" onClick={() => saveOpeningBalance(account)}>
                        Save
                      </button>
                    </div>
                  </td>
                  <td>{formatUsdMoney(balances[account.id] ?? account.openingBalance, currency, usdRateMap)}</td>
                  <td>{account.archived ? "Archived" : "Active"}</td>
                  <td>
                    tx: {account._count.transactions}, rules: {account._count.recurringRules}
                  </td>
                  <td>
                    <div className="inline-row">
                      <button type="button" className="secondary" onClick={() => toggleArchive(account)}>
                        {account.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={account._count.transactions > 0 || account._count.recurringRules > 0}
                        onClick={() => deleteAccount(account)}
                      >
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
