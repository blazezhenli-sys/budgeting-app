import { CategoriesManager } from "@/lib/components/categories-manager";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";

export default async function CategoriesPage() {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);

  const [groups, categories, settings] = await Promise.all([
    prisma.categoryGroup.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    ensureSettings(user.id),
  ]);
  const usdRateMap = usdRateMapFromSettings(settings);

  return (
    <div className="grid">
      <h1>Categories</h1>
      <CategoriesManager
        initialGroups={groups}
        initialCategories={categories}
        currency={settings.currency}
        usdRateMap={usdRateMap}
      />
    </div>
  );
}
