import type { CurrencyCode, FxConversionReference } from '../types/coin';
import { VALID_CURRENCIES } from '../types/coin';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  AUD: 'A$',
  GBP: '£',
  EUR: '€',
  CAD: 'C$',
};

export const USD_FX_RATES: Record<CurrencyCode, number> = {
  USD: 1.0,
  AUD: 1.545,
  GBP: 0.792,
  EUR: 0.948,
  CAD: 1.402,
};

export const FX_RATE_SOURCE = 'Benchmark Indicative FX Reference (Static Table)';
export const FX_RATE_TIMESTAMP = '2026-11-10T14:00:00Z';

export const DEFAULT_USD_RATES = USD_FX_RATES;

export function normalizeCurrencyCode(code?: string | null, fallback: CurrencyCode = 'USD'): CurrencyCode {
  const upper = String(code || '').trim().toUpperCase() as CurrencyCode;
  return VALID_CURRENCIES.includes(upper) ? upper : fallback;
}

/**
 * Converts an amount from `fromCurrency` into USD base without mutating the source value.
 */
export function toUsdAmount(
  amount: number | undefined | null,
  fromCurrency: CurrencyCode = 'USD',
  rates: Record<string, number> = USD_FX_RATES
): number {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return 0;
  const normalizedFrom = normalizeCurrencyCode(fromCurrency, 'USD');
  if (normalizedFrom === 'USD') return amount;
  const fromRate = rates?.[normalizedFrom] || USD_FX_RATES[normalizedFrom] || 1.0;
  return amount / fromRate;
}

/**
 * Converts an amount directly between any two currencies via USD base, preserving FX provenance metadata.
 */
export function convertCurrencyWithMeta(
  amount: number | undefined | null,
  fromCurrency: CurrencyCode = 'USD',
  toCurrency: CurrencyCode = 'USD',
  rates: Record<string, number> = USD_FX_RATES
): {
  convertedAmount: number;
  fx: FxConversionReference;
} {
  const from = normalizeCurrencyCode(fromCurrency, 'USD');
  const to = normalizeCurrencyCode(toCurrency, 'USD');
  const fromRate = rates?.[from] || USD_FX_RATES[from] || 1.0;
  const toRate = rates?.[to] || USD_FX_RATES[to] || 1.0;
  const crossRate = Math.round((toRate / fromRate) * 10000) / 10000;

  const safeAmount = amount === undefined || amount === null || Number.isNaN(amount) ? 0 : amount;
  const inUsd = safeAmount / fromRate;
  const convertedAmount = from === to ? safeAmount : Math.round(inUsd * toRate * 100) / 100;

  return {
    convertedAmount,
    fx: {
      fromCurrency: from,
      toCurrency: to,
      rate: from === to ? 1 : crossRate,
      source: FX_RATE_SOURCE,
      timestamp: FX_RATE_TIMESTAMP,
      direction: `${from} -> ${to}`,
    },
  };
}

/**
 * Shared utility function that ALWAYS converts from the base USD value
 * into the target currency using `rates` before formatting with the target currency symbol.
 */
export function formatCoinValue(
  usdAmount: number | undefined | null,
  targetCurrency: CurrencyCode = 'USD',
  rates: Record<string, number> = USD_FX_RATES,
  showCode: boolean = false
): string {
  const code: CurrencyCode = CURRENCY_SYMBOLS[targetCurrency] ? targetCurrency : 'USD';
  const symbol = CURRENCY_SYMBOLS[code] || '$';

  if (usdAmount === undefined || usdAmount === null || Number.isNaN(usdAmount)) {
    return showCode ? `${symbol}0.00 ${code}` : `${symbol}0.00`;
  }

  const rate = rates?.[code] ?? USD_FX_RATES[code] ?? 1.0;
  const converted = Math.round(usdAmount * rate * 100) / 100;
  const absConverted = Math.abs(converted);

  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: absConverted % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absConverted);

  const signPrefix = converted < 0 ? '-' : '';
  return showCode
    ? `${signPrefix}${symbol}${formattedNumber} ${code}`
    : `${signPrefix}${symbol}${formattedNumber}`;
}

/**
 * Formats an already-entered native currency amount without re-converting from USD.
 */
export function formatNativeCurrency(
  amount: number | undefined | null,
  sourceCurrency: CurrencyCode = 'USD',
  showCode: boolean = false
): string {
  const code = normalizeCurrencyCode(sourceCurrency, 'USD');
  const symbol = CURRENCY_SYMBOLS[code] || '$';
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return showCode ? `${symbol}0.00 ${code}` : `${symbol}0.00`;
  }
  const rounded = Math.round(amount * 100) / 100;
  const absVal = Math.abs(rounded);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absVal);
  const signPrefix = rounded < 0 ? '-' : '';
  return showCode ? `${signPrefix}${symbol}${formatted} ${code}` : `${signPrefix}${symbol}${formatted}`;
}
