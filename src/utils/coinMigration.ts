import type { AuctionComp, CoinRecord } from '../types/coin';
import { normalizeRarity } from './formatters';
import {
  evaluateCoinMeltValue,
  isPreciousMetalCategory,
  parseMetalCompositionStrict,
  toSpotPriceReference,
  validateCoinMetalConsistency,
} from '../services/marketRatesService';
import { normalizeCurrencyCode } from './currency';

/**
 * Safely migrates legacy or imported CoinRecord payloads without mutating
 * immutable IDs, allocated SKUs, barcodeIds, photos, entered transaction amounts, or history.
 */
export function migrateCoinRecord(raw: CoinRecord): CoinRecord {
  const strictParsed = parseMetalCompositionStrict(raw.metalComposition || '');

  // Determine metalCategory safely: repair obvious contradiction only when composition unambiguously
  // identifies a precious metal (e.g. "22K Gold" previously defaulted to 'clad')
  let nextCategory = raw.metalCategory;
  if (!nextCategory && strictParsed.metalCategory) {
    nextCategory = strictParsed.metalCategory;
  } else if (
    nextCategory &&
    strictParsed.metalCategory &&
    isPreciousMetalCategory(strictParsed.metalCategory) &&
    (nextCategory === 'clad' || nextCategory === 'other')
  ) {
    nextCategory = strictParsed.metalCategory;
  }

  let nextFineness = raw.fineness;
  if ((nextFineness === undefined || nextFineness === null || nextFineness <= 0) && strictParsed.finenessVerified && strictParsed.fineness) {
    nextFineness = strictParsed.fineness;
  }

  const candidate: CoinRecord = {
    ...raw,
    rarity: normalizeRarity(raw.rarity),
    currency: normalizeCurrencyCode(raw.currency, 'USD'),
    ...(raw.purchaseCurrency ? { purchaseCurrency: normalizeCurrencyCode(raw.purchaseCurrency, 'USD') } : {}),
    ...(raw.askingCurrency ? { askingCurrency: normalizeCurrencyCode(raw.askingCurrency, 'USD') } : {}),
    ...(raw.soldCurrency ? { soldCurrency: normalizeCurrencyCode(raw.soldCurrency, 'USD') } : {}),
    ...(raw.sellingCostsCurrency ? { sellingCostsCurrency: normalizeCurrencyCode(raw.sellingCostsCurrency, 'USD') } : {}),
    ...(nextCategory ? { metalCategory: nextCategory } : {}),
    ...(nextFineness !== undefined ? { fineness: nextFineness } : {}),
  };

  // Validate metal consistency and derive verified precious metal weight / melt if unambiguous
  const consistency = validateCoinMetalConsistency(candidate);
  const meltResult = evaluateCoinMeltValue(candidate, 'USD');

  const preciousMetalGrams =
    consistency.valid && consistency.preciousMetalGrams !== undefined
      ? consistency.preciousMetalGrams
      : raw.preciousMetalGrams;

  const metalVerified =
    consistency.valid &&
    Boolean(
      nextCategory &&
        (nextCategory === 'clad' ||
          (isPreciousMetalCategory(nextCategory) &&
            candidate.fineness !== undefined &&
            candidate.fineness > 0 &&
            candidate.weightGrams !== undefined &&
            candidate.weightGrams > 0))
    );

  // Separate confidences backfill without losing original confidenceScore
  const identificationConfidence =
    raw.identificationConfidence ?? raw.confidenceScore ?? undefined;
  const gradingConfidence =
    raw.gradingConfidence ??
    (raw.confidenceScore !== undefined ? Math.max(25, Math.min(85, raw.confidenceScore - 10)) : undefined);
  const valuationConfidence =
    raw.valuationConfidence ??
    (raw.confidenceScore !== undefined ? Math.max(20, Math.min(85, raw.confidenceScore - 15)) : undefined);

  // Sanitize legacy comps: a comp without a genuine URL must NEVER claim 'verified_sale'
  const cleanedComps: AuctionComp[] | undefined = Array.isArray(raw.recentAuctionComps)
    ? raw.recentAuctionComps.map((comp) => {
        const hasValidUrl = Boolean(comp.url && /^https?:\/\//i.test(comp.url.trim()));
        const sourceType =
          comp.sourceType ||
          (hasValidUrl && comp.verificationStatus === 'verified_sale'
            ? 'verified_auction'
            : comp.verificationStatus === 'verified_sale'
            ? 'ai_estimate'
            : 'ai_estimate');
        return {
          ...comp,
          sourceType,
          verificationStatus:
            hasValidUrl && comp.verificationStatus === 'verified_sale'
              ? 'verified_sale'
              : 'provisional_comp',
          originalCurrency: comp.originalCurrency || comp.currency || 'USD',
          originalPrice: comp.originalPrice ?? comp.realizedPrice,
          priceType:
            comp.priceType ||
            (comp.buyersPremiumIncluded === true
              ? 'buyer_inclusive'
              : comp.buyersPremiumIncluded === false
              ? 'hammer'
              : 'unknown'),
        };
      })
    : undefined;

  const verifiedCompCount = (cleanedComps || []).filter(
    (c) => c.sourceType === 'verified_auction' || c.sourceType === 'user_entered' || c.sourceType === 'dealer_ask'
  ).length;

  return {
    ...candidate,
    preciousMetalGrams,
    metalVerified,
    bullionMeltValue: meltResult.available && meltResult.breakdown ? meltResult.breakdown.meltValueUSD : undefined,
    bullionDetails: meltResult.available && meltResult.breakdown ? meltResult.breakdown : undefined,
    spotPriceReference:
      candidate.spotPriceReference ||
      (meltResult.available && meltResult.breakdown ? toSpotPriceReference(meltResult.breakdown.metalType) : undefined),
    identificationConfidence,
    gradingConfidence,
    valuationConfidence,
    evidenceCount: raw.evidenceCount ?? verifiedCompCount,
    recentAuctionComps: cleanedComps,
    valuationHistory: Array.isArray(raw.valuationHistory) ? raw.valuationHistory : [],
  };
}
