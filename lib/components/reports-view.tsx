"use client";

import { useMemo, useState } from "react";

import { formatUsdMoney, type UsdRateMap } from "@/lib/money";
import type { MonthlyReportView, NetWorthTrendPoint } from "@/lib/types";

const DONUT_COLORS = ["#2ecc71", "#1fbf80", "#36b38a", "#63c297", "#8ad0a7", "#b8e3bf", "#46a36e", "#268a5d"];

type DonutSlice = {
  label: string;
  amount: number;
  share: number;
  color: string;
};

function monthLabel(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) {
    return month;
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(year, monthIndex - 1, 1),
  );
}

function formatSignedMoney(amount: number, currency: string, usdRateMap: UsdRateMap): string {
  const absolute = formatUsdMoney(Math.abs(amount), currency, usdRateMap);
  return `${amount >= 0 ? "+" : "-"}${absolute}`;
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function clampShare(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function toDonutSlices(
  rows: Array<{ label: string; amount: number; share: number }>,
  options?: { includeOther?: boolean; totalAmount?: number },
): DonutSlice[] {
  const validRows = rows.filter((row) => row.share > 0 && row.amount > 0);
  const baseSlices = validRows.map((row, index) => ({
    label: row.label,
    amount: row.amount,
    share: clampShare(row.share),
    color: DONUT_COLORS[index % DONUT_COLORS.length],
  }));

  if (!options?.includeOther) {
    return baseSlices;
  }

  const totalAmount = Math.max(options.totalAmount ?? 0, 0);
  const usedShare = clampShare(baseSlices.reduce((sum, slice) => sum + slice.share, 0));
  const otherShare = clampShare(1 - usedShare);

  if (otherShare < 0.01 || totalAmount <= 0) {
    return baseSlices;
  }

  return [
    ...baseSlices,
    {
      label: "Other",
      amount: Math.round(totalAmount * otherShare),
      share: otherShare,
      color: "#6b7f76",
    },
  ];
}

function toTrendPolyline(points: NetWorthTrendPoint[]): string {
  if (!points.length) return "";

  const width = 760;
  const height = 220;
  const padX = 20;
  const padY = 16;
  const values = points.map((point) => point.netWorth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  return points
    .map((point, index) => {
      const x = padX + step * index;
      const y = padY + ((max - point.netWorth) / span) * (height - padY * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function DonutChart({
  title,
  slices,
  totalAmount,
  currency,
  usdRateMap,
}: {
  title: string;
  slices: DonutSlice[];
  totalAmount: number;
  currency: string;
  usdRateMap: UsdRateMap;
}) {
  const radius = 66;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;
  const chartSize = 180;
  const segments = slices.reduce<Array<DonutSlice & { length: number; offset: number }>>((acc, slice) => {
    const length = slice.share * circumference;
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    return acc.concat({
      ...slice,
      length,
      offset,
    });
  }, []);

  return (
    <article className="report-donut-card">
      <h3>{title}</h3>
      {segments.length ? (
        <>
          <div className="report-donut-visual">
            <svg viewBox={`0 0 ${chartSize} ${chartSize}`} role="img" aria-label={title}>
              <circle
                cx={chartSize / 2}
                cy={chartSize / 2}
                r={radius}
                strokeWidth={strokeWidth}
                className="report-donut-track"
              />
              {segments.map((segment) => (
                <circle
                  key={`${title}-${segment.label}`}
                  cx={chartSize / 2}
                  cy={chartSize / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${segment.length} ${Math.max(circumference - segment.length, 0)}`}
                  strokeDashoffset={-segment.offset}
                  transform={`rotate(-90 ${chartSize / 2} ${chartSize / 2})`}
                  className="report-donut-segment"
                />
              ))}
            </svg>
            <div className="report-donut-center">
              <p className="muted">Total</p>
              <p>{formatUsdMoney(totalAmount, currency, usdRateMap)}</p>
            </div>
          </div>
          <ul className="report-donut-legend">
            {segments.map((segment) => (
              <li key={`${title}-legend-${segment.label}`}>
                <span className="report-donut-dot" style={{ backgroundColor: segment.color }} />
                <span className="report-donut-label">{segment.label}</span>
                <span className="report-donut-figure">
                  {formatUsdMoney(segment.amount, currency, usdRateMap)} • {percentage(segment.share)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">No data for this chart yet.</p>
      )}
    </article>
  );
}

export function ReportsView({
  initialMonth,
  initialReport,
  currency,
  usdRateMap,
}: {
  initialMonth: string;
  initialReport: MonthlyReportView;
  currency: string;
  usdRateMap: UsdRateMap;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [report, setReport] = useState(initialReport);
  const [error, setError] = useState<string | null>(null);
  const trendPolyline = useMemo(() => toTrendPolyline(report.netWorthTrend), [report.netWorthTrend]);
  const trendFirst = report.netWorthTrend[0];
  const trendLast = report.netWorthTrend[report.netWorthTrend.length - 1];
  const trendWindowChange = trendLast ? trendLast.netWorth - (trendFirst?.netWorth ?? trendLast.netWorth) : 0;
  const categoryDonutSlices = useMemo(
    () =>
      toDonutSlices(
        report.topSpendingCategories.map((category) => ({
          label: category.categoryName,
          amount: category.spent,
          share: category.share,
        })),
        { includeOther: true, totalAmount: report.totals.spent },
      ),
    [report.topSpendingCategories, report.totals.spent],
  );
  const payeeDonutSlices = useMemo(
    () =>
      toDonutSlices(
        report.topPayees.map((payee) => ({
          label: payee.payee,
          amount: payee.spent,
          share: payee.share,
        })),
        { includeOther: true, totalAmount: report.totals.spent },
      ),
    [report.topPayees, report.totals.spent],
  );

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
    <div className="grid reports-view">
      <section className="card">
        <h2>Monthly summary</h2>
        <div className="inline-row report-toolbar">
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
        <h2>Monthly spending snapshot</h2>
        <div className="report-kpis">
          <p>Income: {formatUsdMoney(report.totals.income, currency, usdRateMap)}</p>
          <p>Assigned: {formatUsdMoney(report.totals.assigned, currency, usdRateMap)}</p>
          <p>Spent: {formatUsdMoney(report.totals.spent, currency, usdRateMap)}</p>
          <p>Ready to assign: {formatUsdMoney(report.totals.availableToAssign, currency, usdRateMap)}</p>
        </div>
        {report.warnings.length ? (
          <div className="grid">
            {report.warnings.map((warning) => (
              <p key={warning} className="alert">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Net worth over time</h2>
        <p className="muted">
          {trendFirst && trendLast ? `${monthLabel(trendFirst.month)} to ${monthLabel(trendLast.month)}` : "No trend data yet"}
        </p>
        {trendLast ? (
          <div className="report-kpis">
            <p>Current net worth: {formatUsdMoney(trendLast.netWorth, currency, usdRateMap)}</p>
            <p>Window change: {formatSignedMoney(trendWindowChange, currency, usdRateMap)}</p>
          </div>
        ) : (
          <p className="muted">Add accounts and transactions to see net worth trends.</p>
        )}
        {trendPolyline ? (
          <div className="report-trend-chart">
            <svg viewBox="0 0 760 220" role="img" aria-label="Net worth trend">
              <polyline points={trendPolyline} className="report-trend-line" />
            </svg>
          </div>
        ) : null}
        {report.netWorthTrend.length ? (
          <div className="table-scroll report-table-scroll report-networth-table">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Net worth</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {report.netWorthTrend.map((point) => (
                  <tr key={point.month}>
                    <td>{monthLabel(point.month)}</td>
                    <td>{formatUsdMoney(point.netWorth, currency, usdRateMap)}</td>
                    <td>{formatSignedMoney(point.changeFromPrevious, currency, usdRateMap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Spending breakdowns</h2>
        {report.spendingByGroup.length ? (
          <div className="report-donut-grid">
            <DonutChart
              title="Top categories"
              slices={categoryDonutSlices}
              totalAmount={report.totals.spent}
              currency={currency}
              usdRateMap={usdRateMap}
            />
            <DonutChart
              title="Top payees"
              slices={payeeDonutSlices}
              totalAmount={report.totals.spent}
              currency={currency}
              usdRateMap={usdRateMap}
            />
          </div>
        ) : null}
        {report.spendingByGroup.length ? (
          <div className="grid">
            <h3>By group</h3>
            {report.spendingByGroup.map((group) => (
              <div key={group.groupName} className="report-breakdown-row">
                <div className="inline-row report-breakdown-header">
                  <span className="report-breakdown-title">{group.groupName}</span>
                  <span className="report-breakdown-amount">
                    {formatUsdMoney(group.spent, currency, usdRateMap)} ({percentage(group.share)})
                  </span>
                </div>
                <div className="report-breakdown-bar-track">
                  <div className="report-breakdown-bar-fill" style={{ width: `${Math.max(group.share * 100, 2)}%` }} />
                </div>
                <p className="muted">{group.categoryCount} active categories</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No spending activity found for this month.</p>
        )}
      </section>

      <section className="card">
        <h2>Category activity</h2>
        <div className="table-scroll report-table-scroll report-category-table">
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
                  <td>{formatUsdMoney(row.assigned, currency, usdRateMap)}</td>
                  <td>{formatUsdMoney(row.activity, currency, usdRateMap)}</td>
                  <td className={row.overspent ? "badge-danger" : ""}>{formatUsdMoney(row.available, currency, usdRateMap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
