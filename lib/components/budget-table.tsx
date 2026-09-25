import { Fragment, KeyboardEvent } from "react";

import { BudgetFocusedViews } from "@/lib/components/budget-focused-views";
import { formatUsdMoney, usdCentsToDisplayInput, type UsdRateMap } from "@/lib/money";
import type { BudgetCategoryRow } from "@/lib/types";

type FocusPreset = "all" | "overspent" | "underfunded" | "savings" | "custom";

type Props = {
  groupedRows: Array<[string, BudgetCategoryRow[]]>;
  selectedCategoryId: string | null;
  assignmentDrafts: Record<string, string>;
  currency: string;
  usdRateMap: UsdRateMap;
  monthStatus: "OPEN" | "CLOSED";
  onSelectCategory: (categoryId: string) => void;
  onAssignmentChange: (categoryId: string, value: string) => void;
  onAssignmentSave: (categoryId: string, value: string) => void;
  onAssignmentKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFundRowToTarget: (row: BudgetCategoryRow) => void;
  focusPreset: FocusPreset;
  customGroupName: string;
  groupOptions: string[];
  visibleCategoryCount: number;
  totalCategoryCount: number;
  onFocusPresetChange: (value: FocusPreset) => void;
  onCustomGroupNameChange: (value: string) => void;
};

export function BudgetTable({
  groupedRows,
  selectedCategoryId,
  assignmentDrafts,
  currency,
  usdRateMap,
  monthStatus,
  onSelectCategory,
  onAssignmentChange,
  onAssignmentSave,
  onAssignmentKeyDown,
  onFundRowToTarget,
  focusPreset,
  customGroupName,
  groupOptions,
  visibleCategoryCount,
  totalCategoryCount,
  onFocusPresetChange,
  onCustomGroupNameChange,
}: Props) {
  return (
    <section className="budget-table-panel">
      <div className="budget-table-panel__header">
        <div>
          <h2>Plan</h2>
          <p className="muted">Category groups, assignments, and available cash for this month.</p>
        </div>
        <BudgetFocusedViews
          focusPreset={focusPreset}
          customGroupName={customGroupName}
          groupOptions={groupOptions}
          visibleCategoryCount={visibleCategoryCount}
          totalCategoryCount={totalCategoryCount}
          onFocusPresetChange={onFocusPresetChange}
          onCustomGroupNameChange={onCustomGroupNameChange}
        />
      </div>

      {visibleCategoryCount ? (
        <div className="table-scroll budget-table-scroll">
          <table className="budget-table">
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
                  {rows.map((row) => {
                    const isSelected = row.categoryId === selectedCategoryId;
                    return (
                      <tr
                        key={row.categoryId}
                        className={`budget-table__row${isSelected ? " budget-table__row--selected" : ""}`}
                        onClick={() => onSelectCategory(row.categoryId)}
                      >
                        <td className="budget-table__category-cell">
                          <div className="budget-table__category-cell-main">
                            <strong>{row.categoryName}</strong>
                            {row.overspent ? <span className="budget-overspent-flag">Needs cover</span> : null}
                          </div>
                        </td>
                        <td>
                          <input
                            value={assignmentDrafts[row.categoryId] ?? usdCentsToDisplayInput(row.assigned, currency, usdRateMap)}
                            onChange={(event) => onAssignmentChange(row.categoryId, event.target.value)}
                            onBlur={() => onAssignmentSave(row.categoryId, assignmentDrafts[row.categoryId] ?? "0")}
                            onKeyDown={onAssignmentKeyDown}
                            onClick={(event) => event.stopPropagation()}
                            className="budget-amount-input"
                            disabled={monthStatus === "CLOSED"}
                          />
                        </td>
                        <td>
                          <div className="budget-target-cell">
                            <span>{row.targetMonthly ? formatUsdMoney(row.targetMonthly, currency, usdRateMap) : "-"}</span>
                            {row.targetMonthly && row.targetMonthly > 0 ? (
                              <button
                                type="button"
                                className="secondary budget-target-cell__action"
                                disabled={monthStatus === "CLOSED"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onFundRowToTarget(row);
                                }}
                              >
                                Fund
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td>{formatUsdMoney(row.activity, currency, usdRateMap)}</td>
                        <td
                          className={`budget-table__available-cell${row.overspent ? " budget-table__available-cell--overspent" : ""}`}
                        >
                          {formatUsdMoney(row.available, currency, usdRateMap)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="budget-table-empty">
          <p>No categories match this view.</p>
        </div>
      )}
    </section>
  );
}
