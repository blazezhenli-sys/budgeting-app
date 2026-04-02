"use client";

import { useState } from "react";

import { formatUsdMoney } from "@/lib/money";

type Report = {
  month: string;
  totals: {
    income: number;
    assigned: number;
    spent: number;
    availableToAssign: number;
  };
  categorySummary: Array<{
    categoryId: string;
    categoryName: string;
    groupName: string;
    assigned: number;
    activity: number;
    available: number;
    overspent: boolean;
  }>;
  warnings: string[];
};

export function ReportsView({
  initialMonth,
  initialReport,
  currency,
}: {
  initialMonth: string;
  initialReport: Report;
  currency: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [report, setReport] = useState(initialReport);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setError(null);
    const response = await fetch(`/api/reports/monthly?month=${month}`);
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to fetch report");
      return;
    }
    setReport(payload);
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Monthly summary</h2>
        <div className="inline-row">
          <label>
            Month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <button type="button" onClick={loadReport}>
            Load
          </button>
          <a href="/api/export/csv?type=transactions">
            <button type="button" className="secondary">
              Export transactions
            </button>
          </a>
          <a href="/api/export/csv?type=assignments">
            <button type="button" className="secondary">
              Export assignments
            </button>
          </a>
          <a href="/api/export/csv?type=balances">
            <button type="button" className="secondary">
              Export balances
            </button>
          </a>
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </section>

      <section className="card">
        <div className="inline-row">
          <p>Income: {formatUsdMoney(report.totals.income, currency)}</p>
          <p>Assigned: {formatUsdMoney(report.totals.assigned, currency)}</p>
          <p>Spent: {formatUsdMoney(report.totals.spent, currency)}</p>
          <p>Ready to assign: {formatUsdMoney(report.totals.availableToAssign, currency)}</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Category</th>
                <th>Assigned</th>
                <th>Activity</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {report.categorySummary.map((row) => (
                <tr key={row.categoryId}>
                  <td>{row.groupName}</td>
                  <td>{row.categoryName}</td>
                  <td>{formatUsdMoney(row.assigned, currency)}</td>
                  <td>{formatUsdMoney(row.activity, currency)}</td>
                  <td className={row.overspent ? "badge-danger" : ""}>{formatUsdMoney(row.available, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
