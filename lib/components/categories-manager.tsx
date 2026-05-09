"use client";

import { Category, CategoryGroup } from "@prisma/client";
import { FormEvent, useMemo, useState } from "react";

import { parseDisplayAmountToUsdCents, type UsdRateMap, usdCentsToDisplayInput } from "@/lib/money";

type Props = {
  initialGroups: CategoryGroup[];
  initialCategories: Category[];
  currency: string;
  usdRateMap: UsdRateMap;
};

export function CategoriesManager({ initialGroups, initialCategories, currency, usdRateMap }: Props) {
  const initialSystemGroupIds = new Set(
    initialCategories
      .filter((category) => category.specialType !== null)
      .map((category) => category.groupId),
  );
  const initialGroupId = initialGroups.find((group) => !initialSystemGroupIds.has(group.id))?.id ?? "";

  const [groups, setGroups] = useState(initialGroups);
  const [categories, setCategories] = useState(initialCategories);
  const [groupName, setGroupName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryTarget, setCategoryTarget] = useState("");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      initialCategories.map((category) => [
        category.id,
        category.targetMonthly === null ? "" : usdCentsToDisplayInput(category.targetMonthly, currency, usdRateMap),
      ]),
    ),
  );
  const [movingCategoryIds, setMovingCategoryIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const systemGroupIds = useMemo(
    () =>
      new Set(
        categories
          .filter((category) => category.specialType !== null)
          .map((category) => category.groupId),
      ),
    [categories],
  );
  const editableGroups = useMemo(
    () =>
      groups
        .filter((group) => !systemGroupIds.has(group.id))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [groups, systemGroupIds],
  );
  const editableCategories = useMemo(
    () => categories.filter((category) => !systemGroupIds.has(category.groupId)),
    [categories, systemGroupIds],
  );
  const grouped = useMemo(
    () =>
      editableGroups.map((group) => ({
        ...group,
        categories: editableCategories.filter((category) => category.groupId === group.id),
      })),
    [editableCategories, editableGroups],
  );

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "group",
        name: groupName,
        sortOrder: Math.max(0, ...groups.map((group) => group.sortOrder)) + 1,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to create group");
      return;
    }

    setGroups((previous) => [...previous, payload.group]);
    setGroupName("");
    if (!groupId) {
      setGroupId(payload.group.id);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let targetMonthly: number | null = null;
    if (categoryTarget.trim()) {
      try {
        targetMonthly = parseDisplayAmountToUsdCents(categoryTarget, currency, usdRateMap);
      } catch {
        setError("Target amount must be a valid number.");
        return;
      }
    }

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        name: categoryName,
        targetMonthly,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to create category");
      return;
    }

    setCategories((previous) => [...previous, payload.category]);
    setTargetDrafts((previous) => ({
      ...previous,
      [payload.category.id]:
        payload.category.targetMonthly === null
          ? ""
          : usdCentsToDisplayInput(payload.category.targetMonthly, currency, usdRateMap),
    }));
    setCategoryName("");
    setCategoryTarget("");
  }

  async function deleteCategory(categoryId: string) {
    setError(null);
    const response = await fetch(
      `/api/categories?kind=category&id=${encodeURIComponent(categoryId)}`,
      { method: "DELETE" },
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete category");
      return;
    }

    setCategories((previous) => previous.filter((category) => category.id !== categoryId));
  }

  async function saveTarget(category: Category) {
    setError(null);
    const draft = targetDrafts[category.id] ?? "";

    let targetMonthly: number | null = null;
    if (draft.trim()) {
      try {
        targetMonthly = parseDisplayAmountToUsdCents(draft, currency, usdRateMap);
      } catch {
        setError("Target amount must be a valid number.");
        return;
      }
    }

    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id, targetMonthly }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update target");
      return;
    }

    setCategories((previous) =>
      previous.map((item) => (item.id === category.id ? { ...item, targetMonthly: payload.category.targetMonthly } : item)),
    );
    setTargetDrafts((previous) => ({
      ...previous,
      [category.id]:
        payload.category.targetMonthly === null
          ? ""
          : usdCentsToDisplayInput(payload.category.targetMonthly, currency, usdRateMap),
    }));
  }

  async function moveCategory(category: Category, nextGroupId: string) {
    if (category.groupId === nextGroupId) {
      return;
    }

    setError(null);
    const previousGroupId = category.groupId;
    setMovingCategoryIds((previous) => ({ ...previous, [category.id]: true }));
    setCategories((previous) =>
      previous.map((item) =>
        item.id === category.id ? { ...item, groupId: nextGroupId } : item,
      ),
    );

    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id, groupId: nextGroupId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setCategories((previous) =>
        previous.map((item) =>
          item.id === category.id ? { ...item, groupId: previousGroupId } : item,
        ),
      );
      setError(payload.error ?? "Failed to move category");
      setMovingCategoryIds((previous) => ({ ...previous, [category.id]: false }));
      return;
    }

    setCategories((previous) =>
      previous.map((item) => (item.id === category.id ? payload.category : item)),
    );
    setMovingCategoryIds((previous) => ({ ...previous, [category.id]: false }));
  }

  async function deleteGroup(groupIdToDelete: string) {
    setError(null);
    const response = await fetch(
      `/api/categories?kind=group&id=${encodeURIComponent(groupIdToDelete)}`,
      { method: "DELETE" },
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete group");
      return;
    }

    setGroups((previous) => {
      const nextGroups = previous.filter((group) => group.id !== groupIdToDelete);
      if (groupId === groupIdToDelete) {
        const nextEditableGroup = nextGroups.find((group) => !systemGroupIds.has(group.id));
        setGroupId(nextEditableGroup?.id ?? "");
      }
      return nextGroups;
    });
  }

  async function moveGroup(groupToMove: CategoryGroup, direction: "up" | "down") {
    const currentIndex = editableGroups.findIndex((group) => group.id === groupToMove.id);
    if (currentIndex === -1) return;
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= editableGroups.length) return;

    const neighborGroup = editableGroups[nextIndex];
    const moveSortOrder = groupToMove.sortOrder;
    const neighborSortOrder = neighborGroup.sortOrder;

    setError(null);
    setGroups((previous) =>
      previous.map((group) => {
        if (group.id === groupToMove.id) return { ...group, sortOrder: neighborSortOrder };
        if (group.id === neighborGroup.id) return { ...group, sortOrder: moveSortOrder };
        return group;
      }),
    );

    const [moveResponse, neighborResponse] = await Promise.all([
      fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "group",
          id: groupToMove.id,
          name: groupToMove.name,
          sortOrder: neighborSortOrder,
          archived: groupToMove.archived,
        }),
      }),
      fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "group",
          id: neighborGroup.id,
          name: neighborGroup.name,
          sortOrder: moveSortOrder,
          archived: neighborGroup.archived,
        }),
      }),
    ]);

    if (!moveResponse.ok || !neighborResponse.ok) {
      const movePayload = await moveResponse.json().catch(() => ({}));
      const neighborPayload = await neighborResponse.json().catch(() => ({}));
      setGroups((previous) =>
        previous.map((group) => {
          if (group.id === groupToMove.id) return { ...group, sortOrder: moveSortOrder };
          if (group.id === neighborGroup.id) return { ...group, sortOrder: neighborSortOrder };
          return group;
        }),
      );
      setError(
        movePayload.error ??
          neighborPayload.error ??
          "Failed to reorder groups",
      );
    }
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Create group</h2>
        <p className="muted">Groups are headings that organize multiple categories.</p>
        <form onSubmit={createGroup}>
          <label>
            Group name
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} required />
          </label>
          <button type="submit">Add group</button>
        </form>

        <h2 style={{ marginTop: "1rem" }}>Create category</h2>
        <p className="muted">Categories are individual budget lines inside a group.</p>
        <form onSubmit={createCategory}>
          <label>
            Group
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} required disabled={!editableGroups.length}>
              {editableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category name
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required disabled={!editableGroups.length} />
          </label>
          <label>
            Monthly target ({currency})
            <input
              value={categoryTarget}
              onChange={(event) => setCategoryTarget(event.target.value)}
              placeholder="Optional"
              disabled={!editableGroups.length}
            />
          </label>
          {error ? <p className="alert">{error}</p> : null}
          <button type="submit" disabled={!editableGroups.length}>Add category</button>
        </form>
      </section>

      <section className="card">
        <h2>Categories by group</h2>
        {!editableGroups.length ? <p className="muted">No editable groups yet.</p> : null}
        {grouped.map((group) => (
          <div key={group.id} className="category-group-block">
            <div className="inline-row category-group-header">
              <h3>{group.name}</h3>
              <div className="inline-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void moveGroup(group, "up");
                  }}
                  disabled={editableGroups[0]?.id === group.id}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void moveGroup(group, "down");
                  }}
                  disabled={editableGroups[editableGroups.length - 1]?.id === group.id}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (confirm(`Delete group "${group.name}"? This only works if the group has no categories.`)) {
                      void deleteGroup(group.id);
                    }
                  }}
                >
                  Delete group
                </button>
              </div>
            </div>
            <ul className="category-list">
              {group.categories.length ? (
                group.categories.map((category) => {
                  const isMoving = movingCategoryIds[category.id] ?? false;
                  return (
                    <li key={category.id} className="category-item">
                      <div className="category-main">
                        <span className="category-name">
                          {category.name}
                          {category.specialType === "INFLOW" ? " (System)" : ""}
                        </span>
                        {category.specialType === "INFLOW" ? null : (
                          <div className="category-target">
                            <input
                              value={targetDrafts[category.id] ?? ""}
                              onChange={(event) =>
                                setTargetDrafts((previous) => ({
                                  ...previous,
                                  [category.id]: event.target.value,
                                }))
                              }
                              className="category-target-input"
                              aria-label={`Target for ${category.name}`}
                              placeholder={`Target (${currency})`}
                            />
                            <button type="button" className="secondary" onClick={() => saveTarget(category)} disabled={isMoving}>
                              Save target
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="category-actions">
                        {category.specialType === "INFLOW" ? (
                          <span className="muted">Locked</span>
                        ) : (
                          <>
                            <label className="category-move-label">
                              Group
                              <select
                                value={category.groupId}
                                onChange={(event) => {
                                  void moveCategory(category, event.target.value);
                                }}
                                aria-label={`Move ${category.name} to group`}
                                className="category-move-select"
                                disabled={isMoving}
                              >
                                {editableGroups.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                if (confirm(`Delete category "${category.name}"?`)) {
                                  void deleteCategory(category.id);
                                }
                              }}
                              disabled={isMoving}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })
              ) : (
                <li className="muted">No categories in this group yet.</li>
              )}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
