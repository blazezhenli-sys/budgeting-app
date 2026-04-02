"use client";

import { Category, CategoryGroup } from "@prisma/client";
import { FormEvent, useMemo, useState } from "react";

import { parseDisplayAmountToUsdCents, usdCentsToDisplayInput } from "@/lib/money";

type Props = {
  initialGroups: CategoryGroup[];
  initialCategories: Category[];
  currency: string;
};

export function CategoriesManager({ initialGroups, initialCategories, currency }: Props) {
  const [groups, setGroups] = useState(initialGroups);
  const [categories, setCategories] = useState(initialCategories);
  const [groupName, setGroupName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryTarget, setCategoryTarget] = useState("");
  const [groupId, setGroupId] = useState(initialGroups[0]?.id ?? "");
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      initialCategories.map((category) => [
        category.id,
        category.targetMonthly === null ? "" : usdCentsToDisplayInput(category.targetMonthly, currency),
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        categories: categories.filter((category) => category.groupId === group.id),
      })),
    [groups, categories],
  );

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "group", name: groupName, sortOrder: groups.length + 1 }),
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
        targetMonthly = parseDisplayAmountToUsdCents(categoryTarget, currency);
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
          : usdCentsToDisplayInput(payload.category.targetMonthly, currency),
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
        targetMonthly = parseDisplayAmountToUsdCents(draft, currency);
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
          : usdCentsToDisplayInput(payload.category.targetMonthly, currency),
    }));
  }

  async function deleteGroup(groupIdToDelete: string) {
    setError(null);
    const response = await fetch(
      `/api/categories?kind=group&id=${encodeURIComponent(groupIdToDelete)}`,
      { method: "DELETE" },
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete category group");
      return;
    }

    setGroups((previous) => {
      const nextGroups = previous.filter((group) => group.id !== groupIdToDelete);
      if (groupId === groupIdToDelete) {
        setGroupId(nextGroups[0]?.id ?? "");
      }
      return nextGroups;
    });
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Create category group</h2>
        <form onSubmit={createGroup}>
          <label>
            Group name
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} required />
          </label>
          <button type="submit">Add group</button>
        </form>

        <h2 style={{ marginTop: "1rem" }}>Create category</h2>
        <form onSubmit={createCategory}>
          <label>
            Group
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} required disabled={!groups.length}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category name
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required disabled={!groups.length} />
          </label>
          <label>
            Monthly target ({currency})
            <input
              value={categoryTarget}
              onChange={(event) => setCategoryTarget(event.target.value)}
              placeholder="Optional"
              disabled={!groups.length}
            />
          </label>
          {error ? <p className="alert">{error}</p> : null}
          <button type="submit" disabled={!groups.length}>Add category</button>
        </form>
      </section>

      <section className="card">
        <h2>Categories</h2>
        {grouped.map((group) => (
          <div key={group.id} className="category-group-block">
            <div className="inline-row category-group-header">
              <h3>{group.name}</h3>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (confirm(`Delete group \"${group.name}\"? This only works if the group has no categories.`)) {
                    void deleteGroup(group.id);
                  }
                }}
              >
                Delete group
              </button>
            </div>
            <ul className="category-list">
              {group.categories.map((category) => (
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
                        <button type="button" className="secondary" onClick={() => saveTarget(category)}>
                          Save target
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="category-actions">
                    {category.specialType === "INFLOW" ? (
                      <span className="muted">Locked</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          if (confirm(`Delete category \"${category.name}\"?`)) {
                            void deleteCategory(category.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
