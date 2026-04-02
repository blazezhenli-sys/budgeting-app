import type { Setting } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  DEFAULT_USD_TO_DISPLAY_RATE,
  normalizeDisplayCurrency,
  normalizeUsdRateMap,
  type UsdRateMap,
} from "@/lib/money";

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;
const FX_PROVIDER_URL = "https://api.frankfurter.app/latest?from=USD";

type FrankfurterResponse = {
  rates?: Record<string, number>;
};

function shouldRefreshRates(fetchedAt: Date | null): boolean {
  if (!fetchedAt) {
    return true;
  }
  return Date.now() - fetchedAt.getTime() >= ONE_WEEK_MS;
}

export function usdRateMapFromSettings(settings: { usdRates: unknown }): UsdRateMap {
  const parsed =
    settings.usdRates && typeof settings.usdRates === "object"
      ? (settings.usdRates as Record<string, number>)
      : null;

  return normalizeUsdRateMap(parsed);
}

async function fetchUsdRatesFromProvider(): Promise<UsdRateMap> {
  const response = await fetch(FX_PROVIDER_URL, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`FX provider request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as FrankfurterResponse;
  return normalizeUsdRateMap(payload.rates ?? {});
}

async function refreshUsdRates(setting: Setting): Promise<Setting> {
  try {
    const usdRates = await fetchUsdRatesFromProvider();
    return prisma.setting.update({
      where: { id: setting.id },
      data: {
        usdRates,
        usdRatesFetchedAt: new Date(),
      },
    });
  } catch {
    return setting;
  }
}

export async function ensureSettings(userId: string) {
  const existing = await prisma.setting.findUnique({ where: { userId } });
  if (!existing) {
    const created = await prisma.setting.create({
      data: {
        userId,
        currency: normalizeDisplayCurrency(process.env.APP_CURRENCY),
        timezone: process.env.APP_TIMEZONE ?? "UTC",
        monthStartDay: 1,
        usdRates: DEFAULT_USD_TO_DISPLAY_RATE,
        usdRatesFetchedAt: new Date(),
      },
    });

    return refreshUsdRates(created);
  }

  if (shouldRefreshRates(existing.usdRatesFetchedAt)) {
    return refreshUsdRates(existing);
  }

  return existing;
}
