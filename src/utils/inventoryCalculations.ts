import type { CoinRecord, CurrencyCode, PlatformFeePresetId, ResaleFeeSettings } from '../types/coin';
import { toUsdAmount } from './currency';
import { evaluateCoinMeltValue } from '../services/marketRatesService';

export const RESALE_FEE_STORAGE_KEY = 'coinscan_resale_fee_settings';

export const DEFAULT_RESALE_FEE_SETTINGS: ResaleFeeSettings = {
  defaultPreset: 'private_0',
  ebayAuPercent: 13.5,
  ebayAuFixedPostage: 0,
  customPercent: 10.0,
  customFixedPostage: 10.0,
};

export const PLATFORM_FEE_PRESET_LABELS: Record<PlatformFeePresetId, string> = {
  private_0: 'Private / Cash / Marketplace (0%)',
  ebay_au_13_5: 'eBay Australia (~13.5%)',
  custom: 'Custom % + Fixed Postage',
};

export function getResaleFeeSettings(): ResaleFeeSettings {
  try {
    const raw = localStorage.getItem(RESALE_FEE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_RESALE_FEE_SETTINGS,
        ...parsed,
      };
    }
  } catch {
    // Fallback to defaults
  }
  return { ...DEFAULT_RESALE_FEE_SETTINGS };
}

export function saveResaleFeeSettings(settings: ResaleFeeSettings): void {
  try {
    localStorage.setItem(RESALE_FEE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage error
  }
}

/**
 * Resolves fee preset & fixed postage in base USD (converting sellerPaidPostage from sellingCostsCurrency if needed).
 */
export function resolveCoinFeeConfig(
  coin: Partial<CoinRecord>,
  settings?: ResaleFeeSettings
): {
  presetId: PlatformFeePresetId;
  presetLabel: string;
  feePercent: number;
  fixedPostage: number;
} {
  const activeSettings = settings || getResaleFeeSettings();
  let presetId: PlatformFeePresetId = coin.platformFeePreset || activeSettings.defaultPreset || 'private_0';

  if (!coin.platformFeePreset && coin.listingPlatform) {
    const lower = coin.listingPlatform.toLowerCase();
    if (lower.includes('ebay')) {
      presetId = 'ebay_au_13_5';
    } else if (lower.includes('private') || lower.includes('cash') || lower.includes('marketplace')) {
      presetId = 'private_0';
    }
  }

  const costCur = coin.sellingCostsCurrency || coin.soldCurrency || coin.purchaseCurrency || 'USD';
  const sellerPostageUSD =
    coin.sellerPaidPostage !== undefined ? toUsdAmount(coin.sellerPaidPostage, costCur) : undefined;

  if (presetId === 'private_0') {
    return {
      presetId: 'private_0',
      presetLabel: PLATFORM_FEE_PRESET_LABELS.private_0,
      feePercent: 0,
      fixedPostage: sellerPostageUSD || 0,
    };
  }

  if (presetId === 'ebay_au_13_5') {
    const feePercent = activeSettings.ebayAuPercent ?? 13.5;
    const fixedPostage =
      sellerPostageUSD !== undefined ? sellerPostageUSD : activeSettings.ebayAuFixedPostage || 0;
    return {
      presetId: 'ebay_au_13_5',
      presetLabel: PLATFORM_FEE_PRESET_LABELS.ebay_au_13_5,
      feePercent,
      fixedPostage,
    };
  }

  // 'custom'
  const feePercent =
    coin.customFeePercent !== undefined ? coin.customFeePercent : activeSettings.customPercent ?? 10.0;
  const customFixedUSD =
    coin.customFixedPostage !== undefined ? toUsdAmount(coin.customFixedPostage, costCur) : undefined;
  const fixedPostage =
    customFixedUSD !== undefined
      ? customFixedUSD
      : sellerPostageUSD !== undefined
      ? sellerPostageUSD
      : activeSettings.customFixedPostage || 0;

  return {
    presetId: 'custom',
    presetLabel: PLATFORM_FEE_PRESET_LABELS.custom,
    feePercent,
    fixedPostage,
  };
}

export interface CollectionInventorySummary {
  // Counts
  totalItemsInCollection: number;
  totalPiecesOwned: number;
  listedCount: number;
  soldCount: number;
  wishlistCount: number;
  sampleCount: number;

  // Values in base USD (converted on display via formatCoinValue)
  totalOwnedEstimatedValue: number;
  totalAcquisitionCost: number;
  coinsWithKnownCost: number;

  // Profit / Loss in base USD (Net of selected platform fee presets)
  unrealizedGain: number;
  unrealizedGainPercentage: number;
  realizedGrossProceeds: number;
  realizedNetProfit: number;
  totalSellingCosts: number;
  totalBullionMeltValue: number;
  verifiedMeltCoinCount: number;
}

/**
 * Calculates remaining active pieces in collection (excluding sold portions and wishlists).
 */
export function getActiveOwnedQuantity(coin: CoinRecord): number {
  if (coin.status === 'wishlist') return 0;
  if (coin.status === 'sold') {
    const totalQty = Math.max(1, coin.quantity || 1);
    const soldQty = Math.min(totalQty, Math.max(0, coin.soldQuantity ?? totalQty));
    return Math.max(0, totalQty - soldQty);
  }

  const totalQty = Math.max(1, coin.quantity || 1);
  const soldQty = Math.max(0, coin.soldQuantity || 0);
  return Math.max(0, totalQty - soldQty);
}

/**
 * Converts stored valuation/estimated value of a coin from its stored `coin.currency` into base USD.
 */
export function getCoinEstimatedValueUSD(coin: CoinRecord): number {
  const sourceCur = coin.currency || 'USD';
  return toUsdAmount(coin.estimatedValue || 0, sourceCur);
}

/**
 * Converts asking price (if present) from its stored `askingCurrency` into base USD.
 */
export function getCoinAskingPriceUSD(coin: CoinRecord): number | undefined {
  if (coin.askingPrice === undefined || coin.askingPrice === null || coin.askingPrice < 0) return undefined;
  return toUsdAmount(coin.askingPrice, coin.askingCurrency || 'USD');
}

/**
 * Calculates allocated cost basis in base USD for a specific quantity of coins,
 * converting from `coin.purchaseCurrency` (defaulting to USD for legacy records)
 * and honoring `costBasisType` ('per_coin' vs 'total').
 */
export function calculateAllocatedCost(
  coin: CoinRecord,
  quantityToCost: number,
  _targetCurrency: CurrencyCode = 'USD'
): number {
  if (coin.purchasePrice === undefined || coin.purchasePrice === null || coin.purchasePrice < 0) {
    return 0;
  }

  const sourceCur = coin.purchaseCurrency || 'USD';
  const basePriceUSD = toUsdAmount(coin.purchasePrice, sourceCur);
  const totalQty = Math.max(1, coin.quantity || 1);

  if (coin.costBasisType === 'per_coin') {
    return basePriceUSD * quantityToCost;
  }

  const perPieceCost = basePriceUSD / totalQty;
  return perPieceCost * quantityToCost;
}

/**
 * Calculates realized net profit in base USD for a sold coin or sold portion of a lot,
 * converting proceeds, allocated purchase cost, selling fees, postage, and direct costs from their stored source currencies.
 */
export function calculateRealizedNetProfit(
  coin: CoinRecord,
  _targetCurrency: CurrencyCode = 'USD',
  feeSettings?: ResaleFeeSettings
): {
  grossSalePrice: number;
  allocatedCost: number;
  sellingFees: number;
  sellerPostage: number;
  otherCosts: number;
  totalDeductions: number;
  netProfit: number;
  hasRecordedCost: boolean;
  presetId: PlatformFeePresetId;
  presetLabel: string;
  feePercent: number;
} {
  const feeConfig = resolveCoinFeeConfig(coin, feeSettings);
  const soldQty =
    coin.soldQuantity !== undefined ? coin.soldQuantity : coin.status === 'sold' ? coin.quantity || 1 : 0;

  if (soldQty <= 0 && coin.status !== 'sold' && (coin.soldPrice === undefined || coin.soldPrice <= 0)) {
    return {
      grossSalePrice: 0,
      allocatedCost: 0,
      sellingFees: 0,
      sellerPostage: 0,
      otherCosts: 0,
      totalDeductions: 0,
      netProfit: 0,
      hasRecordedCost: false,
      presetId: feeConfig.presetId,
      presetLabel: feeConfig.presetLabel,
      feePercent: feeConfig.feePercent,
    };
  }

  const soldCur = coin.soldCurrency || 'USD';
  const costCur = coin.sellingCostsCurrency || soldCur;

  const grossSalePrice = toUsdAmount(coin.soldPrice || 0, soldCur);
  const hasRecordedCost = coin.purchasePrice !== undefined && coin.purchasePrice !== null && coin.purchasePrice >= 0;
  const allocatedCost = calculateAllocatedCost(coin, Math.max(1, soldQty));

  const computedPresetFee = grossSalePrice * (feeConfig.feePercent / 100);
  const explicitFeesUSD =
    coin.sellingFees !== undefined && coin.sellingFees !== null
      ? toUsdAmount(coin.sellingFees, costCur)
      : undefined;

  // Prefer explicit stored fee if non-zero or when preset matches manual entry; otherwise compute from preset
  const sellingFees =
    explicitFeesUSD !== undefined
      ? explicitFeesUSD
      : computedPresetFee;

  const sellerPostage =
    coin.sellerPaidPostage !== undefined && coin.sellerPaidPostage !== null
      ? toUsdAmount(coin.sellerPaidPostage, costCur)
      : feeConfig.fixedPostage;

  const otherCosts = toUsdAmount(coin.otherDirectCosts || 0, costCur);

  const totalDeductions = allocatedCost + sellingFees + sellerPostage + otherCosts;
  const netProfit = grossSalePrice - totalDeductions;

  return {
    grossSalePrice: Math.round(grossSalePrice * 100) / 100,
    allocatedCost: Math.round(allocatedCost * 100) / 100,
    sellingFees: Math.round(sellingFees * 100) / 100,
    sellerPostage: Math.round(sellerPostage * 100) / 100,
    otherCosts: Math.round(otherCosts * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    hasRecordedCost,
    presetId: feeConfig.presetId,
    presetLabel: feeConfig.presetLabel,
    feePercent: feeConfig.feePercent,
  };
}

/**
 * Calculates unrealized net profit in base USD on remaining active pieces in collection,
 * net of selected Platform Fee Preset and converted accurately from stored source currencies.
 */
export function calculateUnrealizedGain(
  coin: CoinRecord,
  _targetCurrency: CurrencyCode = 'USD',
  feeSettings?: ResaleFeeSettings
): {
  estimatedValueTotal: number;
  costBasisTotal: number;
  grossUnrealizedGain: number;
  estimatedSellingFees: number;
  estimatedPostage: number;
  netProceedsAfterFees: number;
  unrealizedGain: number;
  hasKnownCost: boolean;
  presetId: PlatformFeePresetId;
  presetLabel: string;
  feePercent: number;
} {
  const feeConfig = resolveCoinFeeConfig(coin, feeSettings);
  const activeQty = getActiveOwnedQuantity(coin);
  if (activeQty <= 0) {
    return {
      estimatedValueTotal: 0,
      costBasisTotal: 0,
      grossUnrealizedGain: 0,
      estimatedSellingFees: 0,
      estimatedPostage: 0,
      netProceedsAfterFees: 0,
      unrealizedGain: 0,
      hasKnownCost: false,
      presetId: feeConfig.presetId,
      presetLabel: feeConfig.presetLabel,
      feePercent: feeConfig.feePercent,
    };
  }

  const estValuePerPieceUSD = getCoinEstimatedValueUSD(coin);
  const estimatedValueTotal = estValuePerPieceUSD * activeQty;

  const hasKnownCost = coin.purchasePrice !== undefined && coin.purchasePrice !== null && coin.purchasePrice >= 0;
  const costBasisTotal = calculateAllocatedCost(coin, activeQty);

  const costCur = coin.sellingCostsCurrency || coin.purchaseCurrency || 'USD';
  const estimatedSellingFees = estimatedValueTotal * (feeConfig.feePercent / 100);
  const estimatedPostage = feeConfig.fixedPostage;
  const otherCosts = toUsdAmount(coin.otherDirectCosts || 0, costCur);

  const grossUnrealizedGain = estimatedValueTotal - costBasisTotal;
  const netProceedsAfterFees = estimatedValueTotal - estimatedSellingFees - estimatedPostage - otherCosts;
  const unrealizedGain = netProceedsAfterFees - costBasisTotal;

  return {
    estimatedValueTotal: Math.round(estimatedValueTotal * 100) / 100,
    costBasisTotal: Math.round(costBasisTotal * 100) / 100,
    grossUnrealizedGain: Math.round(grossUnrealizedGain * 100) / 100,
    estimatedSellingFees: Math.round(estimatedSellingFees * 100) / 100,
    estimatedPostage: Math.round(estimatedPostage * 100) / 100,
    netProceedsAfterFees: Math.round(netProceedsAfterFees * 100) / 100,
    unrealizedGain: Math.round(unrealizedGain * 100) / 100,
    hasKnownCost,
    presetId: feeConfig.presetId,
    presetLabel: feeConfig.presetLabel,
    feePercent: feeConfig.feePercent,
  };
}

/**
 * Computes comprehensive portfolio metrics in base USD, isolating demo items by default
 * and using verified bullion melt math identical to individual coin views.
 */
export function computeCollectionSummary(
  coins: CoinRecord[],
  _targetCurrency: CurrencyCode = 'USD',
  includeSampleCoins: boolean = false,
  feeSettings?: ResaleFeeSettings
): CollectionInventorySummary {
  const activeFeeSettings = feeSettings || getResaleFeeSettings();
  let totalItemsInCollection = 0;
  let totalPiecesOwned = 0;
  let listedCount = 0;
  let soldCount = 0;
  let wishlistCount = 0;
  let sampleCount = 0;

  let totalOwnedEstimatedValue = 0;
  let totalAcquisitionCost = 0;
  let coinsWithKnownCost = 0;
  let totalUnrealizedGain = 0;

  let realizedGrossProceeds = 0;
  let realizedNetProfit = 0;
  let totalSellingCosts = 0;
  let totalBullionMeltValue = 0;
  let verifiedMeltCoinCount = 0;

  coins.forEach((coin) => {
    const isSample = Boolean(coin.isSample);
    if (isSample) sampleCount += 1;

    if (isSample && !includeSampleCoins) {
      return;
    }

    const activeQty = getActiveOwnedQuantity(coin);

    if (coin.status === 'wishlist') {
      wishlistCount += 1;
      return;
    }

    if (coin.status === 'sold') {
      soldCount += 1;
    } else if (coin.status === 'listed') {
      listedCount += 1;
      totalItemsInCollection += 1;
      totalPiecesOwned += activeQty;
    } else {
      totalItemsInCollection += 1;
      totalPiecesOwned += activeQty;
    }

    if (activeQty > 0) {
      const perCoinValUSD = getCoinEstimatedValueUSD(coin);
      totalOwnedEstimatedValue += perCoinValUSD * activeQty;

      // Single source of truth for melt totals: verified melt evaluation
      const meltEval = evaluateCoinMeltValue(coin, 'USD');
      if (meltEval.available && meltEval.breakdown) {
        totalBullionMeltValue += meltEval.breakdown.meltValueUSD * activeQty;
        verifiedMeltCoinCount += 1;
      }

      if (coin.purchasePrice !== undefined && coin.purchasePrice !== null && coin.purchasePrice >= 0) {
        const allocatedCost = calculateAllocatedCost(coin, activeQty);
        totalAcquisitionCost += allocatedCost;
        coinsWithKnownCost += 1;
        const unrealizedResult = calculateUnrealizedGain(coin, 'USD', activeFeeSettings);
        totalUnrealizedGain += unrealizedResult.unrealizedGain;
      }
    }

    if (coin.status === 'sold' || (coin.soldQuantity && coin.soldQuantity > 0)) {
      const saleResult = calculateRealizedNetProfit(coin, 'USD', activeFeeSettings);
      realizedGrossProceeds += saleResult.grossSalePrice;
      realizedNetProfit += saleResult.netProfit;
      totalSellingCosts += saleResult.sellingFees + saleResult.sellerPostage + saleResult.otherCosts;
    }
  });

  const unrealizedGainPercentage =
    totalAcquisitionCost > 0 ? (totalUnrealizedGain / totalAcquisitionCost) * 100 : 0;

  return {
    totalItemsInCollection,
    totalPiecesOwned,
    listedCount,
    soldCount,
    wishlistCount,
    sampleCount,
    totalOwnedEstimatedValue: Math.round(totalOwnedEstimatedValue * 100) / 100,
    totalAcquisitionCost: Math.round(totalAcquisitionCost * 100) / 100,
    coinsWithKnownCost,
    unrealizedGain: Math.round(totalUnrealizedGain * 100) / 100,
    unrealizedGainPercentage: Math.round(unrealizedGainPercentage * 10) / 10,
    realizedGrossProceeds: Math.round(realizedGrossProceeds * 100) / 100,
    realizedNetProfit: Math.round(realizedNetProfit * 100) / 100,
    totalSellingCosts: Math.round(totalSellingCosts * 100) / 100,
    totalBullionMeltValue: Math.round(totalBullionMeltValue * 100) / 100,
    verifiedMeltCoinCount,
  };
}
