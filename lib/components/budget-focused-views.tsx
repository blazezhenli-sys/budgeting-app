type FocusPreset = "all" | "overspent" | "underfunded" | "savings" | "custom";

type Props = {
  focusPreset: FocusPreset;
  customGroupName: string;
  groupOptions: string[];
  visibleCategoryCount: number;
  totalCategoryCount: number;
  onFocusPresetChange: (value: FocusPreset) => void;
  onCustomGroupNameChange: (value: string) => void;
};

const presetOptions: Array<{ id: FocusPreset; label: string }> = [
  { id: "all", label: "All" },
  { id: "overspent", label: "Overspent" },
  { id: "underfunded", label: "Underfunded" },
  { id: "savings", label: "Savings" },
  { id: "custom", label: "Custom" },
];

export function BudgetFocusedViews({
  focusPreset,
  customGroupName,
  groupOptions,
  visibleCategoryCount,
  totalCategoryCount,
  onFocusPresetChange,
  onCustomGroupNameChange,
}: Props) {
  return (
    <div className="budget-focused-views">
      <div className="budget-focused-views__toolbar">
        <div className="segmented-control" role="tablist" aria-label="Focused views">
          {presetOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`segmented-control__button${focusPreset === option.id ? " segmented-control__button--active" : ""}`}
              onClick={() => onFocusPresetChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {focusPreset === "custom" ? (
          <label className="budget-focused-views__group-picker">
            <span className="muted">Group</span>
            <select value={customGroupName} onChange={(event) => onCustomGroupNameChange(event.target.value)}>
              {groupOptions.map((groupName) => (
                <option key={groupName} value={groupName}>
                  {groupName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p className="muted budget-focused-views__summary">
        {visibleCategoryCount} of {totalCategoryCount} categories
      </p>
    </div>
  );
}
