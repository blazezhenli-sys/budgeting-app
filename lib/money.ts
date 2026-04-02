export const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "TWD"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export type UsdRateMap = Record<DisplayCurrency, number>;

export const DEFAULT_USD_TO_DISPLAY_RATE: UsdRateMap = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.5,
  CAD: 1.36,
  AUD: 1.52,
  TWD: 32.1,
};

export function toCents(value: string | number): number {
  if (typeof value === "number") {
    return Math.round(value * 100);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number.parseFloat(trimmed.replace(/,/g, ""));
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return Math.round(parsed * 100);
}

export function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export function normalizeDisplayCurrency(currency: string | null | undefined): DisplayCurrency {
  const normalized = (currency ?? "").toUpperCase() as DisplayCurrency;
  return DISPLAY_CURRENCIES.includes(normalized) ? normalized : "USD";
}

export function normalizeUsdRateMap(input?: Partial<Record<string, number>> | null): UsdRateMap {
  const next: UsdRateMap = { ...DEFAULT_USD_TO_DISPLAY_RATE };
  if (!input || typeof input !== "object") {
    return next;
  }

  for (const currency of DISPLAY_CURRENCIES) {
    const candidate = input[currency];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      next[currency] = candidate;
    }
  }

  next.USD = 1;
  return next;
}

function getRateMap(rateMap?: UsdRateMap): UsdRateMap {
  return rateMap ?? DEFAULT_USD_TO_DISPLAY_RATE;
}

export function usdCentsToDisplayCents(usdCents: number, currency: string, rateMap?: UsdRateMap): number {
  const normalized = normalizeDisplayCurrency(currency);
  return Math.round(usdCents * getRateMap(rateMap)[normalized]);
}

export function displayCentsToUsdCents(displayCents: number, currency: string, rateMap?: UsdRateMap): number {
  const normalized = normalizeDisplayCurrency(currency);
  return Math.round(displayCents / getRateMap(rateMap)[normalized]);
}

export function parseDisplayAmountToUsdCents(value: string | number, currency: string, rateMap?: UsdRateMap): number {
  return displayCentsToUsdCents(toCents(value), currency, rateMap);
}

export function usdCentsToDisplayInput(usdCents: number, currency: string, rateMap?: UsdRateMap): string {
  return fromCents(usdCentsToDisplayCents(usdCents, currency, rateMap));
}

export function formatUsdMoney(usdCents: number, currency = "USD", rateMap?: UsdRateMap): string {
  const normalized = normalizeDisplayCurrency(currency);
  const valueInDisplayCurrency = usdCents / 100;
  const rates = getRateMap(rateMap);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalized,
  }).format(valueInDisplayCurrency * rates[normalized]);
}

export function formatMoney(value: number, currency = "USD", rateMap?: UsdRateMap): string {
  return formatUsdMoney(value, currency, rateMap);
}
