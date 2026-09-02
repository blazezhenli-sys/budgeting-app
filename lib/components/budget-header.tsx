import Link from "next/link";

import { formatUsdMoney, type UsdRateMap } from "@/lib/money";
import type { BudgetMonthView } from "@/lib/types";

type Props = {
  month: string;
  monthLabel: string;
  prevMonthHref: string;
  nextMonthHref: string;
  currency: string;
  usdRateMap: UsdRateMap;
  budget: BudgetMonthView;
  working: boolean;
  onFundAllTargets: () => void;
  onToggleMonthStatus: () => void;
};

export function BudgetHeader({
  month,
  monthLabel,
  prevMonthHref,
  nextMonthHref,
  currency,
  usdRateMap,
  budget,
  working,
  onFundAllTargets,
  onToggleMonthStatus,
}: Props) {
  return (
    <section className="budget-header">
      <div className="budget-header__row">
        <div>
          <p className="budget-header__eyebrow">Budget</p>
          <div className="budget-header__title-row">
            <h1>{monthLabel}</h1>
            <span className={`status-badge${budget.status === "CLOSED" ? " status-badge--closed" : ""}`}>
              {budget.status}
            </span>
          </div>
          <p className="muted">Month key {month}</p>
        </div>

        <div className="budget-toolbar">
          <Link href={prevMonthHref} className="button-link secondary">
            Previous
          </Link>
          <Link href={nextMonthHref} className="button-link secondary">
            Next
          </Link>
          <button type="button" className="secondary" onClick={onFundAllTargets} disabled={working || budget.status === "CLOSED"}>
            Fund all targets
          </button>
          <button type="button" className="secondary" onClick={onToggleMonthStatus} disabled={working}>
            {budget.status === "OPEN" ? "Close month" : "Reopen month"}
          </button>
        </div>
      </div>

      <div className="budget-summary-grid">
        <div className="budget-summary-card budget-summary-card--highlight">
          <span className="budget-summary-card__label">Ready to assign</span>
          <strong>{formatUsdMoney(budget.totals.availableToAssign, currency, usdRateMap)}</strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-card__label">Income</span>
          <strong>{formatUsdMoney(budget.totals.income, currency, usdRateMap)}</strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-card__label">Assigned</span>
          <strong>{formatUsdMoney(budget.totals.assigned, currency, usdRateMap)}</strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-card__label">Spent</span>
          <strong>{formatUsdMoney(budget.totals.spent, currency, usdRateMap)}</strong>
        </div>
      </div>
    </section>
  );
}
