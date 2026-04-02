export const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "TWD"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

const USD_TO_DISPLAY_RATE: Record<DisplayCurrency, number> = {
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

export function usdCentsToDisplayCents(usdCents: number, currency: string): number {
  const normalized = normalizeDisplayCurrency(currency);
  return Math.round(usdCents * USD_TO_DISPLAY_RATE[normalized]);
}

export function displayCentsToUsdCents(displayCents: number, currency: string): number {
  const normalized = normalizeDisplayCurrency(currency);
  return Math.round(displayCents / USD_TO_DISPLAY_RATE[normalized]);
}

export function parseDisplayAmountToUsdCents(value: string | number, currency: string): number {
  return displayCentsToUsdCents(toCents(value), currency);
}

export function usdCentsToDisplayInput(usdCents: number, currency: string): string {
  return fromCents(usdCentsToDisplayCents(usdCents, currency));
}

export function formatUsdMoney(usdCents: number, currency = "USD"): string {
  const normalized = normalizeDisplayCurrency(currency);
  const valueInDisplayCurrency = usdCents / 100;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalized,
  }).format(valueInDisplayCurrency * USD_TO_DISPLAY_RATE[normalized]);
}

export function formatMoney(value: number, currency = "USD"): string {
  return formatUsdMoney(value, currency);
}
