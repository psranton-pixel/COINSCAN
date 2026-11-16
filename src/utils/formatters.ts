import type { CurrencyCode, RarityTier, CoinStatus, ValuationMethodology, EvidenceQuality } from '../types/coin';
import { VALID_RARITIES } from '../types/coin';
import { formatCoinValue, USD_FX_RATES } from './currency';

export const CURRENCY_LABELS: Record<CurrencyCode, { symbol: string; code: string; name: string }> = {
  USD: { symbol: '$', code: 'USD', name: 'US Dollar' },
  AUD: { symbol: 'A$', code: 'AUD', name: 'Australian Dollar' },
  GBP: { symbol: '£', code: 'GBP', name: 'British Pound' },
  EUR: { symbol: '€', code: 'EUR', name: 'Euro' },
  CAD: { symbol: 'C$', code: 'CAD', name: 'Canadian Dollar' },
};

/**
 * Formats a base USD currency amount into the target currency using formatCoinValue.
 */
export function formatCurrency(
  amount: number | undefined | null,
  currency: CurrencyCode = 'USD',
  showCode: boolean = false
): string {
  return formatCoinValue(amount, currency, USD_FX_RATES, showCode);
}

/**
 * Safely normalizes and migrates any legacy or informal rarity values to the official standard tier set:
 * 'Common' | 'Uncommon' | 'Scarce' | 'Rare' | 'Very Rare' | 'Key Date'
 */
export function normalizeRarity(raw?: string): RarityTier {
  if (!raw) return 'Common';
  const trimmed = raw.trim();

  // If already exact match
  if (VALID_RARITIES.includes(trimmed as RarityTier)) {
    return trimmed as RarityTier;
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('key date') || lower.includes('ultra rare') || lower.includes('unique')) {
    return 'Key Date';
  }
  if (lower.includes('very rare') || lower.includes('museum')) {
    return 'Very Rare';
  }
  if (lower.includes('rare')) {
    return 'Rare';
  }
  if (lower.includes('scarce')) {
    return 'Scarce';
  }
  if (lower.includes('uncommon')) {
    return 'Uncommon';
  }
  // Common Date, Bullion Standard, Bullion & Collector Grade, etc.
  return 'Common';
}

export function getRarityColor(rarity?: string): { bg: string; text: string; border: string } {
  const norm = normalizeRarity(rarity);
  switch (norm) {
    case 'Key Date':
      return { bg: 'bg-rose-950/70', text: 'text-rose-400', border: 'border-rose-500/50' };
    case 'Very Rare':
      return { bg: 'bg-amber-950/70', text: 'text-amber-400', border: 'border-amber-500/50' };
    case 'Rare':
      return { bg: 'bg-amber-900/60', text: 'text-amber-300', border: 'border-amber-400/40' };
    case 'Scarce':
      return { bg: 'bg-emerald-950/70', text: 'text-emerald-400', border: 'border-emerald-500/50' };
    case 'Uncommon':
      return { bg: 'bg-sky-950/70', text: 'text-sky-300', border: 'border-sky-500/40' };
    case 'Common':
    default:
      return { bg: 'bg-slate-800/70', text: 'text-slate-300', border: 'border-slate-700/60' };
  }
}

export function getStatusBadge(status?: CoinStatus): { label: string; bg: string; text: string; border: string } {
  switch (status) {
    case 'listed':
      return { label: 'Listed for Sale', bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' };
    case 'sold':
      return { label: 'Sold', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'wishlist':
      return { label: 'Wishlist', bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' };
    case 'in_collection':
    default:
      return { label: 'In Collection', bg: 'bg-slate-800/60', text: 'text-slate-300', border: 'border-slate-700/50' };
  }
}

export function getMethodologyLabel(methodology?: ValuationMethodology): { label: string; description: string } {
  switch (methodology) {
    case 'comparable_sales':
      return {
        label: 'Comparable Sales Comps',
        description: 'Estimated based on historical realized completed auction sales for similar grade and variety.',
      };
    case 'bullion_melt':
      return {
        label: 'Intrinsic Bullion Melt Floor',
        description: 'Calculated directly from exact weight, metal fineness, and precious metal benchmark spot prices.',
      };
    case 'catalogue_reference':
      return {
        label: 'Numismatic Catalogue Benchmark',
        description: 'Derived from published catalogue reference price guide ranges.',
      };
    case 'provisional_ai_inference':
    default:
      return {
        label: 'Provisional AI Inference',
        description: 'Preliminary visual estimation from photograph. Not an authenticated appraisal or certified guarantee.',
      };
  }
}

export function getEvidenceQualityLabel(quality?: EvidenceQuality): { label: string; color: string } {
  switch (quality) {
    case 'high_confidence':
      return { label: 'Multiple Historical Comps', color: 'text-emerald-400' };
    case 'moderate_confidence':
      return { label: 'Reference Baseline', color: 'text-amber-400' };
    case 'provisional_estimate':
    default:
      return { label: 'Provisional (Photo Assessment)', color: 'text-slate-300' };
  }
}

export function getGradeBadge(grade?: string): { label: string; tier: 'gem' | 'choice' | 'circulated' | 'worn' } {
  const g = String(grade || '').toUpperCase();
  if (
    g.includes('MS-65') ||
    g.includes('MS-66') ||
    g.includes('MS-67') ||
    g.includes('MS-68') ||
    g.includes('MS-69') ||
    g.includes('MS-70') ||
    g.includes('PR-68') ||
    g.includes('PR-70')
  ) {
    return { label: grade || 'Gem MS', tier: 'gem' };
  }
  if (g.includes('MS-') || g.includes('UNC') || g.includes('AU-')) {
    return { label: grade || 'Choice AU/MS', tier: 'choice' };
  }
  if (g.includes('XF-') || g.includes('EF-') || g.includes('VF-')) {
    return { label: grade || 'Fine / Very Fine', tier: 'circulated' };
  }
  return { label: grade || 'Circulated', tier: 'worn' };
}
