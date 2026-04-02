"use client";

import { Account, Category, RecurringRule, Setting } from "@prisma/client";
import { FormEvent, useState } from "react";

import {
  DISPLAY_CURRENCIES,
  type DisplayCurrency,
  formatUsdMoney,
  normalizeDisplayCurrency,
  parseDisplayAmountToUsdCents,
} from "@/lib/money";

type RuleWithRefs = RecurringRule & {
  account: Account;
  category: Category | null;
};

type QueueItem = {
  ruleId: string;
  payee: string;
  amount: number;
  frequency: "WEEKLY" | "MONTHLY";
  nextRunDate: string;
  account: { id: string; name: string };
  category: { id: string; name: string } | null;
};

type Props = {
  initialSettings: Setting;
  rules: RuleWithRefs[];
  accounts: Account[];
  categories: Category[];
  initialQueue: QueueItem[];
  initialRuleDate: string;
};

function formatDateOnly(value: Date | string): string {
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" ? value.slice(0, 10) : "";
  }
  return parsed.toISOString().slice(0, 10);
}

export function SettingsManager({ initialSettings, rules, accounts, categories, initialQueue, initialRuleDate }: Props) {
  const [currency, setCurrency] = useState(normalizeDisplayCurrency(initialSettings.currency));
  const [timezone, setTimezone] = useState(initialSettings.timezone);
  const [monthStartDay, setMonthStartDay] = useState(String(initialSettings.monthStartDay));
  const [ruleList, setRuleList] = useState(rules);
  const [queue, setQueue] = useState(initialQueue);
  const [selectedQueueRuleIds, setSelectedQueueRuleIds] = useState<string[]>(initialQueue.map((item) => item.ruleId));
  const [error, setError] = useState<string | null>(null);

  const [ruleAccountId, setRuleAccountId] = useState(accounts[0]?.id ?? "");
  const [ruleCategoryId, setRuleCategoryId] = useState(categories[0]?.id ?? "");
  const [rulePayee, setRulePayee] = useState("");
  const [ruleMemo, setRuleMemo] = useState("");
  const [ruleAmount, setRuleAmount] = useState("0");
  const [ruleFrequency, setRuleFrequency] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [ruleNextDate, setRuleNextDate] = useState(initialRuleDate);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currency: currency.toUpperCase(),
        timezone,
        monthStartDay: Number(monthStartDay),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to save settings");
      return;
    }

    setCurrency(payload.settings.currency);
    setTimezone(payload.settings.timezone);
    setMonthStartDay(String(payload.settings.monthStartDay));
  }

  async function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/recurring/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: ruleAccountId,
        categoryId: ruleCategoryId,
        payee: rulePayee,
        memo: ruleMemo,
        amount: parseDisplayAmountToUsdCents(ruleAmount, currency),
        frequency: ruleFrequency,
        nextRunDate: ruleNextDate,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to create recurring rule");
      return;
    }

    window.location.reload();
  }

  async function toggleRule(id: string, active: boolean) {
    const response = await fetch("/api/recurring/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update rule");
      return;
    }

    setRuleList((previous) => previous.map((rule) => (rule.id === id ? { ...rule, active: payload.rule.active } : rule)));
  }

  async function runRecurringNow() {
    const uniqueRuleIds = [...new Set(selectedQueueRuleIds)];
    if (!uniqueRuleIds.length) {
      setError("Select at least one queued rule.");
      return;
    }

    const response = await fetch("/api/recurring/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleIds: uniqueRuleIds }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to generate recurring transactions");
      return;
    }

    setQueue((previous) => previous.filter((item) => !uniqueRuleIds.includes(item.ruleId)));
    setSelectedQueueRuleIds((previous) => previous.filter((id) => !uniqueRuleIds.includes(id)));
    alert(`Generated ${payload.createdCount} recurring transactions.`);
  }

  function toggleQueueRule(ruleId: string) {
    setSelectedQueueRuleIds((previous) =>
      previous.includes(ruleId) ? previous.filter((id) => id !== ruleId) : [...previous, ruleId],
    );
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>General settings</h2>
        <form onSubmit={saveSettings}>
          <label>
            Display currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value as DisplayCurrency)} required>
              {DISPLAY_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Authoritative storage remains USD; this only changes display and form conversion.</p>
          <label>
            Timezone
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
          </label>
          <label>
            Month start day
            <input
              type="number"
              min={1}
              max={28}
              value={monthStartDay}
              onChange={(event) => setMonthStartDay(event.target.value)}
              required
            />
          </label>
          <button type="submit">Save settings</button>
        </form>

        <h2 style={{ marginTop: "1rem" }}>Recurring rule</h2>
        <form onSubmit={addRule}>
          <label>
            Account
            <select value={ruleAccountId} onChange={(event) => setRuleAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={ruleCategoryId} onChange={(event) => setRuleCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payee
            <input value={rulePayee} onChange={(event) => setRulePayee(event.target.value)} required />
          </label>
          <label>
            Memo
            <input value={ruleMemo} onChange={(event) => setRuleMemo(event.target.value)} />
          </label>
          <label>
            Amount ({currency})
            <input value={ruleAmount} onChange={(event) => setRuleAmount(event.target.value)} required />
          </label>
          <label>
            Frequency
            <select value={ruleFrequency} onChange={(event) => setRuleFrequency(event.target.value as typeof ruleFrequency)}>
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </label>
          <label>
            Next run date
            <input type="date" value={ruleNextDate} onChange={(event) => setRuleNextDate(event.target.value)} required />
          </label>
          <button type="submit">Create recurring rule</button>
        </form>

        <button type="button" className="secondary" onClick={runRecurringNow} style={{ marginTop: "1rem" }}>
          Generate selected queued transactions
        </button>
        {error ? <p className="alert">{error}</p> : null}
      </section>

      <section className="card">
        <h2>Recurring rules</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Payee</th>
                <th>Account</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Next run</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ruleList.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.payee}</td>
                  <td>{rule.account.name}</td>
                  <td>{rule.category?.name ?? "Inflow"}</td>
                  <td>{formatUsdMoney(rule.amount, currency)}</td>
                  <td>{rule.frequency}</td>
                  <td>{formatDateOnly(rule.nextRunDate)}</td>
                  <td>{rule.active ? "Active" : "Paused"}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => toggleRule(rule.id, rule.active)}>
                      {rule.active ? "Pause" : "Resume"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Recurring queue</h2>
        {queue.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={`${item.ruleId}-${item.nextRunDate}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedQueueRuleIds.includes(item.ruleId)}
                        onChange={() => toggleQueueRule(item.ruleId)}
                      />
                    </td>
                    <td>{item.nextRunDate}</td>
                    <td>{item.payee}</td>
                    <td>{item.account.name}</td>
                    <td>{item.category?.name ?? "Inflow"}</td>
                    <td>{formatUsdMoney(item.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No recurring transactions are due right now.</p>
        )}
      </section>
    </div>
  );
}
