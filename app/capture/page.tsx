import { FastCapture } from "@/lib/components/fast-capture";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";

export default async function CapturePage() {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);

  const [settings, accounts, categories] = await Promise.all([
    ensureSettings(user.id),
    prisma.account.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { name: "asc" },
    }),
  ]);
  const inflowCategory = categories.find((category) => category.specialType === "INFLOW");
  const initialDate = todayInTimeZone(settings.timezone);
  const usdRateMap = usdRateMapFromSettings(settings);

  return (
    <div className="grid">
      <h1>Capture</h1>
      <FastCapture
        currency={settings.currency}
        accounts={accounts}
        categories={categories}
        inflowCategoryId={inflowCategory?.id ?? null}
        inflowCategoryName={inflowCategory?.name ?? "Inflow: Ready to Assign"}
        initialDate={initialDate}
        usdRateMap={usdRateMap}
      />
    </div>
  );
}
