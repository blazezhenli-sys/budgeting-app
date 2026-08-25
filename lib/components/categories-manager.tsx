"use client";

import { Category, CategoryGroup } from "@prisma/client";
import { DragEvent, FormEvent, useMemo, useState } from "react";

import { parseDisplayAmountToUsdCents, type UsdRateMap, usdCentsToDisplayInput } from "@/lib/money";

type Props = {
  initialGroups: CategoryGroup[];
  initialCategories: Category[];
  currency: string;
  usdRateMap: UsdRateMap;
};

function compareCategories(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

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
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialCategories.map((category) => [category.id, category.name])),
  );
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      initialCategories.map((category) => [
        category.id,
        category.targetMonthly === null ? "" : usdCentsToDisplayInput(category.targetMonthly, currency, usdRateMap),
      ]),
    ),
  );
  const [workingCategoryIds, setWorkingCategoryIds] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [deleteDraftCategoryId, setDeleteDraftCategoryId] = useState<string | null>(null);
  const [deleteReplacementCategoryId, setDeleteReplacementCategoryId] = useState("");
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after">("before");
  const [reorderingGroupId, setReorderingGroupId] = useState<string | null>(null);
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
    () => categories.filter((category) => !systemGroupIds.has(category.groupId)).sort(compareCategories),
    [categories, systemGroupIds],
  );
  const categoriesByGroup = useMemo(
    () =>
      new Map(
        editableGroups.map((group) => [
          group.id,
          editableCategories.filter((category) => category.groupId === group.id).sort(compareCategories),
        ]),
      ),
    [editableCategories, editableGroups],
  );
  const activeEditableCategories = useMemo(
    () => editableCategories.filter((category) => !category.archived),
    [editableCategories],
  );
  const visibleEditableCategories = useMemo(
    () => editableCategories.filter((category) => showArchived || !category.archived),
    [editableCategories, showArchived],
  );
  const grouped = useMemo(
    () =>
      editableGroups.map((group) => ({
        ...group,
        categories: (categoriesByGroup.get(group.id) ?? []).filter((category) => showArchived || !category.archived),
      })),
    [categoriesByGroup, editableGroups, showArchived],
  );

  function setCategoryWorking(categoryId: string, working: boolean) {
    setWorkingCategoryIds((previous) => ({ ...previous, [categoryId]: working }));
  }

  function clearDragState() {
    setDraggingCategoryId(null);
    setDragOverCategoryId(null);
    setDragOverPosition("before");
  }

  function applyCategoryOrder(groupIdToReorder: string, orderedCategoryIds: string[]) {
    const orderById = new Map(orderedCategoryIds.map((categoryId, index) => [categoryId, index]));
    setCategories((previous) =>
      previous.map((category) =>
        category.groupId === groupIdToReorder && orderById.has(category.id)
          ? { ...category, sortOrder: orderById.get(category.id)! }
          : category,
      ),
    );
  }

  async function reorderCategories(groupIdToReorder: string, orderedCategoryIds: string[]) {
    setError(null);
    const previousCategories = categories;
    setReorderingGroupId(groupIdToReorder);
    applyCategoryOrder(groupIdToReorder, orderedCategoryIds);

    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "reorder",
        groupId: groupIdToReorder,
        orderedCategoryIds,
      }),
    });
    const payload = await response.json();
    setReorderingGroupId(null);

    if (!response.ok) {
      setCategories(previousCategories);
      setError(payload.error ?? "Failed to reorder categories");
      return;
    }

    const updatedById = new Map((payload.categories as Category[]).map((category) => [category.id, category]));
    setCategories((previous) => previous.map((category) => updatedById.get(category.id) ?? category));
  }

  function buildReorderedCategoryIds(
    groupIdToReorder: string,
    sourceCategoryId: string,
    targetCategoryId: string,
    position: "before" | "after",
  ): string[] | null {
    const groupCategories = categoriesByGroup.get(groupIdToReorder) ?? [];
    const visibleGroupCategories = groupCategories.filter((category) => showArchived || !category.archived);
    const sourceCategory = groupCategories.find((category) => category.id === sourceCategoryId);
    const targetCategory = groupCategories.find((category) => category.id === targetCategoryId);

    if (!sourceCategory || !targetCategory || sourceCategory.groupId !== targetCategory.groupId) {
      return null;
    }

    const visibleIds = visibleGroupCategories.map((category) => category.id);
    if (!visibleIds.includes(sourceCategoryId) || !visibleIds.includes(targetCategoryId)) {
      return null;
    }

    const withoutSource = visibleIds.filter((categoryId) => categoryId !== sourceCategoryId);
    const targetIndex = withoutSource.indexOf(targetCategoryId);
    if (targetIndex === -1) {
      return null;
    }

    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    const reorderedVisibleIds = [...withoutSource];
    reorderedVisibleIds.splice(insertIndex, 0, sourceCategoryId);

    if (showArchived) {
      return reorderedVisibleIds;
    }

    const hiddenIds = groupCategories
      .filter((category) => category.archived && !reorderedVisibleIds.includes(category.id))
      .map((category) => category.id);
    return [...reorderedVisibleIds, ...hiddenIds];
  }

  function handleCategoryDragStart(event: DragEvent<HTMLButtonElement>, categoryId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", categoryId);
    setDraggingCategoryId(categoryId);
    setDeleteDraftCategoryId(null);
    setDeleteReplacementCategoryId("");
  }

  function handleCategoryDragOver(event: DragEvent<HTMLLIElement>, categoryId: string) {
    if (!draggingCategoryId || draggingCategoryId === categoryId) {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";

    if (dragOverCategoryId !== categoryId || dragOverPosition !== position) {
      setDragOverCategoryId(categoryId);
      setDragOverPosition(position);
    }
  }

  async function handleCategoryDrop(event: DragEvent<HTMLLIElement>, groupIdToReorder: string, categoryId: string) {
    event.preventDefault();
    if (!draggingCategoryId || draggingCategoryId === categoryId) {
      clearDragState();
      return;
    }

    const orderedCategoryIds = buildReorderedCategoryIds(
      groupIdToReorder,
      draggingCategoryId,
      categoryId,
      dragOverPosition,
    );
    clearDragState();

    if (!orderedCategoryIds) {
      return;
    }

    await reorderCategories(groupIdToReorder, orderedCategoryIds);
  }

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
    setNameDrafts((previous) => ({
      ...previous,
      [payload.category.id]: payload.category.name,
    }));
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
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }
    setCategoryWorking(categoryId, true);
    const response = await fetch(
      `/api/categories?kind=category&id=${encodeURIComponent(categoryId)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replacementCategoryId: deleteReplacementCategoryId || null,
        }),
      },
    );
    const payload = await response.json();
    setCategoryWorking(categoryId, false);
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete category");
      return;
    }

    setCategories((previous) => previous.filter((category) => category.id !== categoryId));
    setNameDrafts((previous) => {
      const next = { ...previous };
      delete next[categoryId];
      return next;
    });
    setTargetDrafts((previous) => {
      const next = { ...previous };
      delete next[categoryId];
      return next;
    });
    setDeleteDraftCategoryId(null);
    setDeleteReplacementCategoryId("");
  }

  async function saveCategory(category: Category) {
    setError(null);
    const nextName = (nameDrafts[category.id] ?? category.name).trim();
    const draft = targetDrafts[category.id] ?? "";

    if (!nextName) {
      setError("Category name is required.");
      return;
    }

    let targetMonthly: number | null = null;
    if (draft.trim()) {
      try {
        targetMonthly = parseDisplayAmountToUsdCents(draft, currency, usdRateMap);
      } catch {
        setError("Target amount must be a valid number.");
        return;
      }
    }

    setCategoryWorking(category.id, true);

    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id, name: nextName, targetMonthly }),
    });

    const payload = await response.json();
    setCategoryWorking(category.id, false);
    if (!response.ok) {
      setError(payload.error ?? "Failed to update category");
      return;
    }

    setCategories((previous) =>
      previous.map((item) => (item.id === category.id ? payload.category : item)),
    );
    setNameDrafts((previous) => ({
      ...previous,
      [category.id]: payload.category.name,
    }));
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
    setCategoryWorking(category.id, true);
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
      setCategoryWorking(category.id, false);
      return;
    }

    setCategories((previous) =>
      previous.map((item) => (item.id === category.id ? payload.category : item)),
    );
    setNameDrafts((previous) => ({
      ...previous,
      [category.id]: payload.category.name,
    }));
    setCategoryWorking(category.id, false);
  }

  async function toggleCategoryArchived(category: Category) {
    setError(null);
    setCategoryWorking(category.id, true);

    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: category.id,
        archived: !category.archived,
      }),
    });
    const payload = await response.json();
    setCategoryWorking(category.id, false);

    if (!response.ok) {
      setError(payload.error ?? "Failed to update archived state");
      return;
    }

    setCategories((previous) =>
      previous.map((item) => (item.id === category.id ? payload.category : item)),
    );
    setNameDrafts((previous) => ({
      ...previous,
      [category.id]: payload.category.name,
    }));
    setTargetDrafts((previous) => ({
      ...previous,
      [category.id]:
        payload.category.targetMonthly === null
          ? ""
          : usdCentsToDisplayInput(payload.category.targetMonthly, currency, usdRateMap),
    }));
    if (deleteDraftCategoryId === category.id) {
      setDeleteDraftCategoryId(null);
      setDeleteReplacementCategoryId("");
    }
  }

  function startDeleteCategory(category: Category) {
    const replacementOptions = activeEditableCategories.filter((item) => item.id !== category.id);
    setDeleteDraftCategoryId(category.id);
    setDeleteReplacementCategoryId(replacementOptions[0]?.id ?? "");
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
        <div className="inline-row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <label className="category-archive-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            <span>Show archived</span>
          </label>
          <p className="muted" style={{ margin: 0 }}>
            {visibleEditableCategories.length} visible
          </p>
        </div>
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
                  const isWorking = workingCategoryIds[category.id] ?? false;
                  const isReordering = reorderingGroupId === group.id;
                  const itemClassName = [
                    "category-item",
                    draggingCategoryId === category.id ? "category-item--dragging" : "",
                    dragOverCategoryId === category.id && dragOverPosition === "before" ? "category-item--drop-before" : "",
                    dragOverCategoryId === category.id && dragOverPosition === "after" ? "category-item--drop-after" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const replacementCategories = activeEditableCategories.filter((item) => item.id !== category.id);
                  return (
                    <li
                      key={category.id}
                      className={itemClassName}
                      onDragOver={(event) => handleCategoryDragOver(event, category.id)}
                      onDrop={(event) => void handleCategoryDrop(event, group.id, category.id)}
                    >
                      <div className="category-main">
                        <div className="inline-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                          <button
                            type="button"
                            className="secondary category-reorder-handle"
                            draggable={!isWorking && !isReordering}
                            onDragStart={(event) => handleCategoryDragStart(event, category.id)}
                            onDragEnd={clearDragState}
                            aria-label={`Reorder ${category.name}`}
                            title="Drag to reorder"
                            disabled={isWorking || isReordering}
                          >
                            :::
                          </button>
                          <div className="inline-row">
                            {category.archived ? <span className="category-status-badge">Archived</span> : null}
                          </div>
                        </div>
                        <div className="category-detail-grid">
                          <label className="category-detail-label">
                            <span>Name</span>
                            <input
                              value={nameDrafts[category.id] ?? category.name}
                              onChange={(event) =>
                                setNameDrafts((previous) => ({
                                  ...previous,
                                  [category.id]: event.target.value,
                                }))
                              }
                              aria-label={`Name for ${category.name}`}
                              disabled={isWorking}
                            />
                          </label>
                          <label className="category-detail-label">
                            <span>Monthly target ({currency})</span>
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
                              placeholder="Optional"
                              disabled={isWorking}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="category-actions">
                        {category.specialType === "INFLOW" ? (
                          <span className="muted">Locked</span>
                        ) : (
                          <>
                            <button type="button" className="secondary" onClick={() => saveCategory(category)} disabled={isWorking || isReordering}>
                              Save
                            </button>
                            <label className="category-move-label">
                              Group
                              <select
                                value={category.groupId}
                                onChange={(event) => {
                                  void moveCategory(category, event.target.value);
                                }}
                                aria-label={`Move ${category.name} to group`}
                                className="category-move-select"
                                disabled={isWorking || isReordering}
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
                                void toggleCategoryArchived(category);
                              }}
                              disabled={isWorking || isReordering}
                            >
                              {category.archived ? "Restore" : "Archive"}
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                startDeleteCategory(category);
                              }}
                              disabled={isWorking || isReordering}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                      {deleteDraftCategoryId === category.id ? (
                        <div className="category-delete-panel">
                          <p className="muted" style={{ margin: 0 }}>
                            Delete this category and move any linked transactions, splits, recurring rules, and budget history first.
                          </p>
                          {replacementCategories.length ? (
                            <label className="category-detail-label">
                              <span>Move linked content to</span>
                              <select
                                value={deleteReplacementCategoryId}
                                onChange={(event) => setDeleteReplacementCategoryId(event.target.value)}
                                disabled={isWorking || isReordering}
                              >
                                {replacementCategories.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <p className="muted" style={{ margin: 0 }}>
                              No other active category is available. This delete will only succeed if the category is empty.
                            </p>
                          )}
                          <div className="category-delete-actions">
                            <button
                              type="button"
                              onClick={() => {
                                void deleteCategory(category.id);
                              }}
                              disabled={isWorking || isReordering}
                            >
                              Delete category
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setDeleteDraftCategoryId(null);
                                setDeleteReplacementCategoryId("");
                              }}
                              disabled={isWorking || isReordering}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })
              ) : (
                <li className="muted">{showArchived ? "No categories in this group yet." : "No active categories in this group."}</li>
              )}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
