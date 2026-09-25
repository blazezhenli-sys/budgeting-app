import type { Category } from "@prisma/client";

import { formatUsdMoney } from "@/lib/money";
import type { BudgetCategoryRow, RecurringQueueItem } from "@/lib/types";

type Props = {
  selectedRow: BudgetCategoryRow | null;
  selectedCategoryDefinition: Category | null;
  currency: string;
  usdRateMap: import("@/lib/money").UsdRateMap;
  monthStatus: "OPEN" | "CLOSED";
  working: boolean;
  coverOptions: BudgetCategoryRow[];
  selectedCoverSourceId: string;
  onCoverSourceChange: (value: string) => void;
  onFundRowToTarget: (row: BudgetCategoryRow) => void;
  onCoverOverspending: (row: BudgetCategoryRow) => void;
  noteDraft: string;
  savingNote: boolean;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: () => void;
  recurringQueue: RecurringQueueItem[];
  onGenerateRecurring: () => void;
};

export function BudgetInspector({
  selectedRow,
  selectedCategoryDefinition,
  currency,
  usdRateMap,
  monthStatus,
  working,
  coverOptions,
  selectedCoverSourceId,
  onCoverSourceChange,
  onFundRowToTarget,
  onCoverOverspending,
  noteDraft,
  savingNote,
  onNoteDraftChange,
  onSaveNote,
  recurringQueue,
  onGenerateRecurring,
}: Props) {
  const targetGap = selectedRow?.targetMonthly ? Math.max(selectedRow.targetMonthly - selectedRow.assigned, 0) : 0;
  const overfundedAmount = selectedRow?.targetMonthly ? Math.max(selectedRow.assigned - selectedRow.targetMonthly, 0) : 0;
  const overspendingAmount = selectedRow ? Math.abs(Math.min(selectedRow.available, 0)) : 0;

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
              <div className="budget-inspector__stat">
                <span className="muted">Needed</span>
                <strong>{selectedRow.targetMonthly ? formatUsdMoney(targetGap, currency, usdRateMap) : "-"}</strong>
              </div>
              <div className="budget-inspector__stat">
                <span className="muted">Over target</span>
                <strong>{selectedRow.targetMonthly ? formatUsdMoney(overfundedAmount, currency, usdRateMap) : "-"}</strong>
              </div>
            </div>

            {selectedRow.overspent ? (
              <p className="budget-inspector__callout budget-inspector__callout--danger">
                Overspent by {formatUsdMoney(overspendingAmount, currency, usdRateMap)}.
              </p>
            ) : targetGap > 0 ? (
              <p className="budget-inspector__callout">Needs {formatUsdMoney(targetGap, currency, usdRateMap)} to reach target.</p>
            ) : selectedRow.targetMonthly ? (
              <p className="budget-inspector__callout">Target is fully funded for this month.</p>
            ) : null}

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

            <div className="budget-inspector__stack">
              <label>
                Category note
                <textarea
                  value={noteDraft}
                  onChange={(event) => onNoteDraftChange(event.target.value)}
                  rows={5}
                  placeholder="Add planning context for this category"
                />
              </label>
              <div className="budget-inspector__note-actions">
                <button type="button" className="secondary" onClick={onSaveNote} disabled={savingNote}>
                  {savingNote ? "Saving..." : "Save note"}
                </button>
                <span className="muted">
                  {selectedCategoryDefinition?.notes ? "Saved note present" : "No saved note yet"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="muted">Select a category row to inspect details and run category-specific actions.</p>
        )}
      </section>

      <section className="budget-inspector__section">
        <div className="budget-inspector__section-header">
          <h2>Scheduled</h2>
          <span className="muted">{recurringQueue.length ? `${recurringQueue.length} due` : "Up to date"}</span>
        </div>

        {recurringQueue.length ? (
          <div className="budget-inspector__stack">
            <div className="budget-recurring-list">
              {recurringQueue.map((item) => (
                <div key={`${item.ruleId}-${item.nextRunDate}`} className="budget-recurring-list__item">
                  <div>
                    <strong>{item.payee}</strong>
                    <p className="muted">
                      {item.nextRunDate} · {item.account.name}
                      {item.category ? ` · ${item.category.name}` : ""}
                    </p>
                  </div>
                  <strong>{formatUsdMoney(item.amount, currency, usdRateMap)}</strong>
                </div>
              ))}
            </div>
            <button type="button" className="secondary" onClick={onGenerateRecurring} disabled={working}>
              Generate due
            </button>
          </div>
        ) : (
          <p className="muted">No scheduled transactions are queued for this month.</p>
        )}
      </section>
    </aside>
  );
}
