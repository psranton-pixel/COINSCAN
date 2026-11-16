import type {
  CurrencyCode,
  MetalCategory,
  BullionBreakdown,
  MeltCalculationResult,
  MetalConsistencyValidation,
  CoinIdentification,
  SpotPriceReference,
} from '../types/coin';
import {
  USD_FX_RATES as SHARED_USD_FX_RATES,
  FX_RATE_SOURCE,
  FX_RATE_TIMESTAMP,
  convertCurrencyWithMeta,
} from '../utils/currency';

export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const GRAMS_PER_AVOIRDUPOIS_POUND = 453.59237;

export interface SpotRateEntry {
  metal: MetalCategory;
  pricePerUnitUSD: number;
  unit: 'troy_oz' | 'pound';
  source: string;
  timestamp: string;
  status: 'benchmark_reference' | 'cached' | 'provisional';
}

export interface FxRateEntry {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  source: string;
  timestamp: string;
  direction: string;
}

// Dated benchmark reference spot prices in USD (not claimed as a live streaming market feed)
export const SPOT_PRICES_USD: Record<MetalCategory, SpotRateEntry> = {
  gold: {
    metal: 'gold',
    pricePerUnitUSD: 2685.5,
    unit: 'troy_oz',
    source: 'LBMA / COMEX Benchmark Reference Snapshot',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
  silver: {
    metal: 'silver',
    pricePerUnitUSD: 31.85,
    unit: 'troy_oz',
    source: 'LBMA / COMEX Benchmark Reference Snapshot',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
  platinum: {
    metal: 'platinum',
    pricePerUnitUSD: 985.0,
    unit: 'troy_oz',
    source: 'LPPM Benchmark Reference Snapshot',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
  palladium: {
    metal: 'palladium',
    pricePerUnitUSD: 995.0,
    unit: 'troy_oz',
    source: 'LPPM Benchmark Reference Snapshot',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
  copper: {
    metal: 'copper',
    pricePerUnitUSD: 4.35, // per avoirdupois pound
    unit: 'pound',
    source: 'COMEX Copper Reference Snapshot',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
  clad: {
    metal: 'clad',
    pricePerUnitUSD: 0,
    unit: 'troy_oz',
    source: 'Base Clad Metal (Non-precious)',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
  other: {
    metal: 'other',
    pricePerUnitUSD: 0,
    unit: 'troy_oz',
    source: 'Base / Alloy Metal',
    timestamp: '2026-11-10T14:00:00Z',
    status: 'benchmark_reference',
  },
};

export const SPOT_RATES = SPOT_PRICES_USD;
export const USD_FX_RATES = SHARED_USD_FX_RATES;

export const FX_METADATA = {
  source: FX_RATE_SOURCE,
  timestamp: FX_RATE_TIMESTAMP,
};

export const PRECIOUS_METALS: MetalCategory[] = ['gold', 'silver', 'platinum', 'palladium'];

export function isPreciousMetalCategory(cat?: MetalCategory | null): boolean {
  return Boolean(cat && PRECIOUS_METALS.includes(cat));
}

export function getSpotPriceEntry(metal: MetalCategory): SpotRateEntry {
  return SPOT_PRICES_USD[metal] || SPOT_PRICES_USD.other;
}

export function toSpotPriceReference(metal: MetalCategory): SpotPriceReference {
  const entry = getSpotPriceEntry(metal);
  return {
    metal: entry.metal,
    pricePerUnitUSD: entry.pricePerUnitUSD,
    unit: entry.unit,
    source: entry.source,
    timestamp: entry.timestamp,
  };
}

/**
 * Converts a monetary amount from a source currency to a target currency.
 * Crucial invariant: never mutates or overwrites the stored source amount.
 */
export function convertCurrency(
  amount: number | undefined | null,
  fromCurrency: CurrencyCode = 'USD',
  toCurrency: CurrencyCode = 'USD'
): number {
  return convertCurrencyWithMeta(amount, fromCurrency, toCurrency, USD_FX_RATES).convertedAmount;
}

/**
 * Returns exchange rate metadata including conversion direction, source, and timestamp.
 */
export function getExchangeRateInfo(fromCurrency: CurrencyCode, toCurrency: CurrencyCode): FxRateEntry {
  const { fx } = convertCurrencyWithMeta(1, fromCurrency, toCurrency, USD_FX_RATES);
  return {
    fromCurrency: fx.fromCurrency,
    toCurrency: fx.toCurrency,
    rate: fx.rate,
    source: fx.source,
    timestamp: fx.timestamp,
    direction: fx.direction,
  };
}

/**
 * Parses composition text strictly.
 * Detects metal category cleanly when explicitly mentioned, and ONLY extracts fineness
 * when a verifiable numeric/karat/standard purity expression is present (never silently guessing).
 */
export function parseMetalCompositionStrict(composition: string): {
  metalCategory?: MetalCategory;
  fineness?: number;
  finenessVerified: boolean;
} {
  const raw = (composition || '').trim();
  const lower = raw.toLowerCase();
  if (!lower) return { finenessVerified: false };

  // Extract explicit decimal fineness like .9167, 0.999, .925, .900
  const decimalMatch = lower.match(/(?:^|[^0-9])0?\.(\d{3,4})(?:[^0-9]|$)/);
  const parsedDecimal = decimalMatch ? parseFloat(`0.${decimalMatch[1]}`) : undefined;

  // Extract explicit percentage like 91.67%, 99.9%, 90%, 75%, 50%, 25% (must avoid false matches for plated/clad)
  const pctMatch = lower.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  const parsedPct = pctMatch ? parseFloat(pctMatch[1]) / 100 : undefined;

  // Disqualify plated / clad / filled items from precious bullion fineness
  const isPlatedOrClad =
    lower.includes('clad') ||
    lower.includes('plated') ||
    lower.includes('filled') ||
    lower.includes('cupronickel') ||
    lower.includes('cupro-nickel') ||
    lower.includes('nickel-clad') ||
    lower.includes('copper-nickel');

  // Detect Gold
  if (!isPlatedOrClad && (lower.includes('gold') || /\bau\b/.test(lower) || /\b24k\b|\b22k\b|\b21\.6k\b|\b18k\b|\b14k\b/.test(lower))) {
    let fineness = parsedDecimal && parsedDecimal <= 1 ? parsedDecimal : undefined;
    if (!fineness && parsedPct && parsedPct > 0 && parsedPct <= 1) fineness = parsedPct;
    if (!fineness) {
      if (lower.includes('24k') || lower.includes('24 kt') || lower.includes('24 carat') || lower.includes('pure gold')) {
        fineness = 0.9999;
      } else if (lower.includes('22k') || lower.includes('22 kt') || lower.includes('22 carat') || lower.includes('crown gold')) {
        fineness = 0.9167;
      } else if (lower.includes('21.6k') || lower.includes('21.6 kt')) {
        fineness = 0.900;
      } else if (lower.includes('18k') || lower.includes('18 kt')) {
        fineness = 0.750;
      } else if (lower.includes('14k') || lower.includes('14 kt')) {
        fineness = 0.5833;
      } else if (lower.includes('10k') || lower.includes('10 kt')) {
        fineness = 0.4167;
      } else if (lower.includes('9k') || lower.includes('9 kt') || lower.includes('9 carat')) {
        fineness = 0.375;
      }
    }
    return {
      metalCategory: 'gold',
      fineness: fineness ? Math.round(fineness * 10000) / 10000 : undefined,
      finenessVerified: Boolean(fineness && fineness > 0 && fineness <= 1),
    };
  }

  // Detect Silver
  if (!isPlatedOrClad && (lower.includes('silver') || /\bag\b/.test(lower) || lower.includes('sterling'))) {
    let fineness = parsedDecimal && parsedDecimal <= 1 ? parsedDecimal : undefined;
    if (!fineness && parsedPct && parsedPct > 0 && parsedPct <= 1) fineness = parsedPct;
    if (!fineness) {
      if (lower.includes('pure silver') || lower.includes('fine silver')) {
        fineness = 0.999;
      } else if (lower.includes('sterling')) {
        fineness = 0.925;
      } else if (lower.includes('coin silver')) {
        fineness = 0.900;
      }
    }
    return {
      metalCategory: 'silver',
      fineness: fineness ? Math.round(fineness * 10000) / 10000 : undefined,
      finenessVerified: Boolean(fineness && fineness > 0 && fineness <= 1),
    };
  }

  // Detect Platinum
  if (!isPlatedOrClad && (lower.includes('platinum') || /\bpt\b/.test(lower))) {
    const fineness =
      (parsedDecimal && parsedDecimal <= 1 ? parsedDecimal : undefined) ||
      (parsedPct && parsedPct > 0 && parsedPct <= 1 ? parsedPct : undefined) ||
      (lower.includes('pure platinum') ? 0.9995 : undefined);
    return {
      metalCategory: 'platinum',
      fineness: fineness ? Math.round(fineness * 10000) / 10000 : undefined,
      finenessVerified: Boolean(fineness && fineness > 0 && fineness <= 1),
    };
  }

  // Detect Palladium
  if (!isPlatedOrClad && (lower.includes('palladium') || /\bpd\b/.test(lower))) {
    const fineness =
      (parsedDecimal && parsedDecimal <= 1 ? parsedDecimal : undefined) ||
      (parsedPct && parsedPct > 0 && parsedPct <= 1 ? parsedPct : undefined) ||
      (lower.includes('pure palladium') ? 0.9995 : undefined);
    return {
      metalCategory: 'palladium',
      fineness: fineness ? Math.round(fineness * 10000) / 10000 : undefined,
      finenessVerified: Boolean(fineness && fineness > 0 && fineness <= 1),
    };
  }

  if (isPlatedOrClad || lower.includes('nickel') || lower.includes('brass') || lower.includes('zinc') || lower.includes('steel') || lower.includes('aluminium') || lower.includes('aluminum')) {
    return {
      metalCategory: 'clad',
      fineness: 0,
      finenessVerified: true,
    };
  }

  if (lower.includes('copper') || lower.includes('bronze')) {
    const fineness = parsedDecimal || parsedPct;
    return {
      metalCategory: 'copper',
      fineness: fineness && fineness > 0 && fineness <= 1 ? Math.round(fineness * 10000) / 10000 : undefined,
      finenessVerified: Boolean(fineness),
    };
  }

  return {
    metalCategory: undefined,
    fineness: undefined,
    finenessVerified: false,
  };
}

/**
 * Legacy helper retained for backward compatibility, now delegating to strict parser (fineness 0 if unverified).
 */
export function inferMetalAndFineness(composition: string): { metal: MetalCategory; fineness: number } {
  const strict = parseMetalCompositionStrict(composition);
  return {
    metal: strict.metalCategory || 'other',
    fineness: strict.fineness ?? 0,
  };
}

/**
 * Validates metal composition, category, fineness, and weight consistency before saving.
 * Blocks contradictory pairings like "22K Gold" composition + "Clad / Base" metalCategory.
 */
export function validateCoinMetalConsistency(coin: Partial<CoinIdentification>): MetalConsistencyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const composition = (coin.metalComposition || '').trim();
  const strict = parseMetalCompositionStrict(composition);
  const category = coin.metalCategory;

  // Check category contradiction vs explicit composition wording
  if (strict.metalCategory && category && strict.metalCategory !== category) {
    // Allow gold/silver/platinum/palladium category vs 'other' only with warning, NEVER vs 'clad' or mismatched precious metal
    if (
      isPreciousMetalCategory(strict.metalCategory) &&
      (category === 'clad' || category === 'copper' || category === 'other' || (isPreciousMetalCategory(category) && category !== strict.metalCategory))
    ) {
      errors.push(
        `Composition "${composition}" indicates ${strict.metalCategory.toUpperCase()}, which contradicts metal category "${category}".`
      );
    } else if (strict.metalCategory === 'clad' && isPreciousMetalCategory(category)) {
      errors.push(
        `Composition "${composition}" describes a clad/base alloy, which contradicts precious metal category "${category}".`
      );
    } else if (strict.metalCategory === 'copper' && (isPreciousMetalCategory(category) || category === 'clad')) {
      warnings.push(
        `Composition "${composition}" indicates copper/bronze while metal category is set to "${category}".`
      );
    }
  }

  const effectiveCategory = category || strict.metalCategory;
  const weight = coin.weightGrams;
  const fineness = coin.fineness;

  if (weight !== undefined && weight !== null && (Number.isNaN(weight) || weight < 0)) {
    errors.push('Coin weight in grams cannot be negative.');
  }

  if (fineness !== undefined && fineness !== null) {
    if (Number.isNaN(fineness) || fineness < 0 || fineness > 1) {
      errors.push('Fineness must be a decimal between 0 and 1 (for example, 0.9167 for 22K gold or 0.925 for sterling).');
    } else if (fineness > 0 && effectiveCategory === 'clad') {
      errors.push('Clad / Base category cannot have a precious metal fineness above 0.');
    } else if (
      strict.finenessVerified &&
      strict.fineness &&
      fineness > 0 &&
      Math.abs(fineness - strict.fineness) > 0.05
    ) {
      warnings.push(
        `Entered fineness (${fineness}) differs from composition specification (${strict.fineness}). Verify actual purity.`
      );
    }
  }

  if (isPreciousMetalCategory(effectiveCategory)) {
    if (!fineness || fineness <= 0) {
      warnings.push(
        `Precious metal "${effectiveCategory}" has no verified decimal fineness. Melt value will remain unavailable until fineness is entered.`
      );
    }
    if (!weight || weight <= 0) {
      warnings.push(
        `Coin weight (grams) is missing for ${effectiveCategory}. Melt value will remain unavailable until weight is entered.`
      );
    }
  }

  const effectiveFineness =
    fineness !== undefined && fineness !== null && fineness > 0
      ? fineness
      : strict.finenessVerified
      ? strict.fineness
      : undefined;

  const preciousMetalGrams =
    isPreciousMetalCategory(effectiveCategory) && weight && weight > 0 && effectiveFineness && effectiveFineness > 0
      ? Math.round(weight * effectiveFineness * 1000) / 1000
      : undefined;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestedCategory: strict.metalCategory,
    suggestedFineness: strict.fineness,
    preciousMetalGrams,
  };
}

/**
 * Deterministic, verified melt value calculation returning either a complete breakdown
 * OR an honest unavailable explanation when inputs are missing or contradictory.
 */
export function evaluateCoinMeltValue(
  coin: Partial<CoinIdentification>,
  targetCurrency: CurrencyCode = 'USD'
): MeltCalculationResult {
  const consistency = validateCoinMetalConsistency(coin);
  if (!consistency.valid) {
    return {
      available: false,
      unavailableReason: `Melt value unavailable: ${consistency.errors[0]}`,
    };
  }

  const strict = parseMetalCompositionStrict(coin.metalComposition || '');
  const metalType = coin.metalCategory || strict.metalCategory;

  if (!metalType || metalType === 'clad' || metalType === 'other' || metalType === 'copper') {
    if (metalType === 'copper') {
      return {
        available: false,
        unavailableReason: 'Base copper/bronze coinage carries nominal commodity value rather than precious bullion melt.',
      };
    }
    return {
      available: false,
      unavailableReason: metalType === 'clad' ? 'Clad / Base metal coin (no precious bullion content).' : 'Metal category not confirmed as precious bullion.',
    };
  }

  const weightGrams = coin.weightGrams;
  if (!weightGrams || weightGrams <= 0) {
    return {
      available: false,
      unavailableReason: 'Melt value unavailable: coin weight (g) is missing.',
    };
  }

  // Only accept explicit fineness or strictly verified fineness from composition (never guess 0.900 blindly)
  const fineFraction =
    coin.fineness && coin.fineness > 0 && coin.fineness <= 1
      ? coin.fineness
      : strict.finenessVerified && strict.fineness
      ? strict.fineness
      : undefined;

  if (!fineFraction || fineFraction <= 0) {
    return {
      available: false,
      unavailableReason: 'Melt value unavailable: precious metal fineness is not verified.',
    };
  }

  const spotEntry = getSpotPriceEntry(metalType);
  if (!spotEntry || spotEntry.pricePerUnitUSD <= 0) {
    return {
      available: false,
      unavailableReason: 'Melt value unavailable: spot reference price missing for metal.',
    };
  }

  const pureGrams =
    coin.preciousMetalGrams && coin.preciousMetalGrams > 0 && Math.abs(coin.preciousMetalGrams - weightGrams * fineFraction) <= 0.05
      ? Math.round(coin.preciousMetalGrams * 1000) / 1000
      : Math.round(weightGrams * fineFraction * 1000) / 1000;

  let meltValueUSD = 0;
  let pureTroyOunces = 0;

  if (spotEntry.unit === 'troy_oz') {
    pureTroyOunces = pureGrams / GRAMS_PER_TROY_OUNCE;
    meltValueUSD = pureTroyOunces * spotEntry.pricePerUnitUSD;
  } else if (spotEntry.unit === 'pound') {
    const pounds = pureGrams / GRAMS_PER_AVOIRDUPOIS_POUND;
    meltValueUSD = pounds * spotEntry.pricePerUnitUSD;
    pureTroyOunces = pureGrams / GRAMS_PER_TROY_OUNCE;
  }

  const { convertedAmount: meltValueDisplay, fx } = convertCurrencyWithMeta(
    meltValueUSD,
    'USD',
    targetCurrency,
    USD_FX_RATES
  );

  const spotAgeMs = Date.now() - new Date(spotEntry.timestamp).getTime();
  const isStale = Number.isNaN(spotAgeMs) ? false : spotAgeMs > 14 * 24 * 60 * 60 * 1000;

  return {
    available: true,
    preciousMetalGrams: pureGrams,
    breakdown: {
      metalType,
      weightGrams,
      fineness: Math.round(fineFraction * 10000) / 10000,
      pureGrams,
      pureTroyOunces: Math.round(pureTroyOunces * 10000) / 10000,
      spotPricePerOzUSD: spotEntry.pricePerUnitUSD,
      meltValueUSD: Math.round(meltValueUSD * 100) / 100,
      meltValueDisplayCurrency: Math.round(meltValueDisplay * 100) / 100,
      spotSource: spotEntry.source,
      spotTimestamp: spotEntry.timestamp,
      fxConversion: fx,
      isStale,
    },
  };
}

/**
 * Computes bullion melt breakdown only when metal, weight, and fineness are verified and non-contradictory.
 * Returns null rather than inventing numbers when inputs are incomplete or contradictory.
 */
export function calculateBullionMelt(
  weightGrams?: number | null,
  fineness?: number | null,
  metal?: MetalCategory | null,
  compositionText: string = '',
  targetCurrency: CurrencyCode = 'USD'
): BullionBreakdown | null {
  const result = evaluateCoinMeltValue(
    {
      weightGrams: weightGrams ?? undefined,
      fineness: fineness ?? undefined,
      metalCategory: metal ?? undefined,
      metalComposition: compositionText,
    },
    targetCurrency
  );
  return result.available && result.breakdown ? result.breakdown : null;
}
