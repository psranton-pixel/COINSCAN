import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  ArrowLeft,
  Upload,
  AlertTriangle,
  Star,
  ChevronDown,
  ChevronUp,
  Tag,
  Sparkles,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import type {
  CoinRecord,
  RarityTier,
  BullionType,
  MetalCategory,
  ListingStatus,
  CostBasisType,
  CoinStatus,
  PlatformFeePresetId,
  CurrencyCode,
} from '../types/coin';
import { VALID_CURRENCIES, VALID_RARITIES } from '../types/coin';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { allocateShortBarcodeId, checkSkuUniqueness } from '../services/skuService';
import {
  evaluateCoinMeltValue,
  toSpotPriceReference,
  validateCoinMetalConsistency,
} from '../services/marketRatesService';
import {
  autoDetectCoinCircle,
  createTransparentCoinPNG,
  loadImage,
  normalizeRawImage,
} from '../utils/imageProcessor';
import { normalizeRarity } from '../utils/formatters';
import { formatCoinValue, USD_FX_RATES } from '../utils/currency';
import {
  calculateRealizedNetProfit,
  calculateUnrealizedGain,
  PLATFORM_FEE_PRESET_LABELS,
  resolveCoinFeeConfig,
} from '../utils/inventoryCalculations';
import { UnsavedChangesModal } from './UnsavedChangesModal';

interface CoinEditModalProps {
  coin: CoinRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (updated: CoinRecord) => void;
}

export const CoinEditModal: React.FC<CoinEditModalProps> = ({ coin, isOpen, onClose, onSave }) => {
  const { currency } = useAuth();
  const { coins, updateCoin, addCoin, categories, generateNextSku, resaleFeeSettings } = useCollection();

  const [formData, setFormData] = useState<CoinRecord | null>(null);
  const [initialData, setInitialData] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingSide, setUploadingSide] = useState<'obverse' | 'reverse' | null>(null);
  const [showResaleSection, setShowResaleSection] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const obverseInputRef = useRef<HTMLInputElement | null>(null);
  const reverseInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (coin && isOpen) {
      const normalized: CoinRecord = {
        ...coin,
        rarity: normalizeRarity(coin.rarity),
        currency: coin.currency || 'USD',
        bullionType: coin.bullionType || 'none',
        metalCategory: coin.metalCategory || 'other',
        costBasisType: coin.costBasisType || 'total',
        listingStatus: coin.listingStatus || 'unlisted',
        purchaseCurrency: coin.purchaseCurrency || currency,
        askingCurrency: coin.askingCurrency || currency,
        soldCurrency: coin.soldCurrency || currency,
        sellingCostsCurrency: coin.sellingCostsCurrency || currency,
        status: coin.status || 'in_collection',
        quantity: coin.quantity || 1,
      };
      setFormData(normalized);
      setInitialData(JSON.stringify(normalized));
      setError(null);
      setShowUnsavedPrompt(false);
      // Auto-expand resale section if coin is listed, sold, or has resale details
      if (
        normalized.status === 'listed' ||
        normalized.status === 'sold' ||
        normalized.listingPlatform ||
        normalized.askingPrice ||
        normalized.soldPrice
      ) {
        setShowResaleSection(true);
      }
    }
  }, [coin, isOpen, currency]);

  const isDirty = formData ? JSON.stringify(formData) !== initialData : false;

  const handleRequestClose = () => {
    if (isDirty) {
      setShowUnsavedPrompt(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUnsavedPrompt) {
          setShowUnsavedPrompt(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, showUnsavedPrompt]);

  if (!isOpen || !coin || !formData) return null;

  const isExistingCoin = coins.some((c) => c.id === formData.id);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: 'obverse' | 'reverse') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSide(side);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) {
        setUploadingSide(null);
        return;
      }
      try {
        const normalized = await normalizeRawImage(dataUrl, 800, 0.75);
        const img = await loadImage(normalized);
        const boundary = autoDetectCoinCircle(img);
        const png = await createTransparentCoinPNG(img, boundary, 420);
        setFormData((prev) =>
          prev
            ? {
                ...prev,
                ...(side === 'obverse'
                  ? { obverseImage: png, originalObverseImage: normalized }
                  : { reverseImage: png, originalReverseImage: normalized }),
              }
            : null
        );
      } catch (err) {
        console.error('Photo processing failed:', err);
        setError('Could not process replacement photo.');
      } finally {
        setUploadingSide(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const previewNetProfit = calculateRealizedNetProfit(formData, currency, resaleFeeSettings);
  const previewUnrealizedProfit = calculateUnrealizedGain(formData, currency, resaleFeeSettings);
  const activeFeeConfig = resolveCoinFeeConfig(formData, resaleFeeSettings);
  const skuValidation = checkSkuUniqueness(formData?.sku || '', formData?.id, coins);
  const metalValidation = validateCoinMetalConsistency(formData);
  const meltPreview = evaluateCoinMeltValue(formData, currency);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    if (formData.sku && !skuValidation.isUnique) {
      setError(`Duplicate SKU: "${formData.sku}" is already assigned to "${skuValidation.conflictCoin?.title}". Unresolved duplicates cannot be saved.`);
      return;
    }

    if (!metalValidation.valid) {
      setError(`Metal validation failed: ${metalValidation.errors[0]} Align category, composition, and fineness before saving.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const updatedRecord: CoinRecord = {
        ...formData,
        title: formData.title.trim() || 'Untitled Coin',
        country: formData.country.trim() || 'Unknown',
        rarity: normalizeRarity(formData.rarity),
        preciousMetalGrams: meltPreview.preciousMetalGrams ?? metalValidation.preciousMetalGrams,
        metalVerified: Boolean(meltPreview.available),
        bullionMeltValue: meltPreview.available && meltPreview.breakdown ? meltPreview.breakdown.meltValueUSD : undefined,
        bullionDetails: meltPreview.available ? meltPreview.breakdown : undefined,
        spotPriceReference: formData.metalCategory ? toSpotPriceReference(formData.metalCategory) : undefined,
        updatedAt: now,
      };

      if (isExistingCoin) {
        await updateCoin(updatedRecord);
      } else {
        await addCoin(updatedRecord);
      }

      if (onSave) onSave(updatedRecord);
      onClose();
    } catch (err: any) {
      console.error('Failed to save coin:', err);
      let errorMsg = 'Failed to save changes. Please try again.';
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          errorMsg = parsed?.error || err.message;
        } catch {
          errorMsg = err.message;
        }
      }
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        onClick={handleRequestClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-3xl bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[94dvh] sm:h-auto sm:max-h-[92vh]"
        >
          {/* Mobile Grab Handle */}
          <div className="sm:hidden w-full pt-2 pb-0.5 bg-slate-950 flex justify-center shrink-0">
            <div className="w-10 h-1 bg-slate-700 rounded-full" />
          </div>

          {/* Hidden Photo Upload Inputs */}
          <input
            ref={obverseInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoUpload(e, 'obverse')}
            className="hidden"
          />
          <input
            ref={reverseInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoUpload(e, 'reverse')}
            className="hidden"
          />

          {/* Sticky Top Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-950/95 shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label="Cancel editing"
                className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Cancel</span>
              </button>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100 font-serif-title">
                  {isExistingCoin ? 'Edit Coin Record' : 'Add Coin to Collection'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isFavorite: !formData.isFavorite })}
                aria-label={formData.isFavorite ? 'Remove Favorite' : 'Mark Favorite'}
                className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition-colors ${
                  formData.isFavorite
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                <Star className={`w-4 h-4 ${formData.isFavorite ? 'fill-amber-400' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label="Close edit modal"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Form Body */}
          <form id="coin-edit-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Photos Preview & Replace Row */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-900 border border-slate-700 p-1.5 flex items-center justify-center shrink-0">
                  <img
                    src={formData.obverseImage}
                    alt="Obverse"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-200 block truncate">Front Photo</span>
                  <button
                    type="button"
                    onClick={() => obverseInputRef.current?.click()}
                    disabled={uploadingSide === 'obverse'}
                    className="mt-1 min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-amber-300 border border-slate-700 whitespace-nowrap cursor-pointer"
                  >
                    <Upload className="w-3 h-3 shrink-0" />
                    <span>{uploadingSide === 'obverse' ? 'Wait...' : 'Replace'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-900 border border-slate-700 p-1.5 flex items-center justify-center shrink-0">
                  {formData.reverseImage ? (
                    <img
                      src={formData.reverseImage}
                      alt="Reverse"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-500 text-center">None</span>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-200 block truncate">Back Photo</span>
                  <button
                    type="button"
                    onClick={() => reverseInputRef.current?.click()}
                    disabled={uploadingSide === 'reverse'}
                    className="mt-1 min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-amber-300 border border-slate-700 whitespace-nowrap cursor-pointer"
                  >
                    <Upload className="w-3 h-3 shrink-0" />
                    <span>
                      {uploadingSide === 'reverse'
                        ? 'Wait...'
                        : formData.reverseImage
                        ? 'Replace'
                        : 'Add Back'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Core Identification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Coin Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Country of Origin</label>
                <input
                  type="text"
                  required
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Denomination</label>
                <input
                  type="text"
                  value={formData.denomination || ''}
                  onChange={(e) => setFormData({ ...formData, denomination: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Year</label>
                  <input
                    type="number"
                    value={formData.year || ''}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || 0 })}
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Mint Mark</label>
                  <input
                    type="text"
                    value={formData.mintMark || ''}
                    onChange={(e) => setFormData({ ...formData, mintMark: e.target.value })}
                    placeholder="e.g. S, D, P, CC"
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Series / Coin Type</label>
                <input
                  type="text"
                  value={formData.series || ''}
                  onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                  placeholder="e.g. Morgan Dollar, Florin, Sovereign"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Rarity Tier: strictly standardized to VALID_RARITIES */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Rarity Classification</label>
                <select
                  value={formData.rarity}
                  onChange={(e) => setFormData({ ...formData, rarity: e.target.value as RarityTier })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {VALID_RARITIES.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </div>

              {/* Metal Category & Bullion Classification separated */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Metal Category</label>
                <select
                  value={formData.metalCategory || 'clad'}
                  onChange={(e) => setFormData({ ...formData, metalCategory: e.target.value as MetalCategory })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="platinum">Platinum</option>
                  <option value="palladium">Palladium</option>
                  <option value="copper">Copper / Bronze</option>
                  <option value="clad">Cupro-Nickel / Clad</option>
                  <option value="other">Other / Mixed</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Bullion Classification</label>
                <select
                  value={formData.bullionType || 'none'}
                  onChange={(e) => setFormData({ ...formData, bullionType: e.target.value as BullionType })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="none">Numismatic (Non-Bullion)</option>
                  <option value="semi_numismatic">Semi-Numismatic (Melt + Collector Premium)</option>
                  <option value="bullion">Pure Bullion (Track Melt Floor)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Metal Fineness (0.0 to 1.0)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  placeholder="e.g. 0.900 for 90% Silver, 0.9167 for 22K Gold"
                  value={formData.fineness ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fineness: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Composition Text</label>
                <input
                  type="text"
                  value={formData.metalComposition || ''}
                  onChange={(e) => setFormData({ ...formData, metalComposition: e.target.value })}
                  placeholder="e.g. 90% Silver, 10% Copper"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Weight (g)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.weightGrams ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        weightGrams: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Diameter (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.diameterMm ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        diameterMm: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Metal Consistency Guard & Verified Melt Preview */}
              <div className="sm:col-span-2">
                {!metalValidation.valid ? (
                  <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block">Contradictory Metal Data</strong>
                        <span className="text-[11px]">{metalValidation.errors[0]}</span>
                      </div>
                    </div>
                    {metalValidation.suggestedCategory && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            metalCategory: metalValidation.suggestedCategory,
                            ...(metalValidation.suggestedFineness !== undefined
                              ? { fineness: metalValidation.suggestedFineness }
                              : {}),
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                      >
                        Align to {metalValidation.suggestedCategory.toUpperCase()}
                        {metalValidation.suggestedFineness ? ` (${metalValidation.suggestedFineness})` : ''}
                      </button>
                    )}
                  </div>
                ) : meltPreview.available && meltPreview.breakdown ? (
                  <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 text-xs flex flex-wrap items-center justify-between gap-2 text-emerald-200">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Verified Melt Floor: {formatCoinValue(meltPreview.breakdown.meltValueUSD, currency, USD_FX_RATES, true)} ({meltPreview.breakdown.pureGrams}g pure {meltPreview.breakdown.metalType})
                      </span>
                    </span>
                    <span className="text-[10px] text-emerald-300/80">
                      {meltPreview.breakdown.spotSource} ({meltPreview.breakdown.spotTimestamp.split('T')[0]})
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
                    {meltPreview.unavailableReason || 'Melt value unavailable'}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Estimated Grade (Sheldon Scale)</label>
                <input
                  type="text"
                  value={formData.estimatedGrade || ''}
                  onChange={(e) => setFormData({ ...formData, estimatedGrade: e.target.value })}
                  placeholder="e.g. MS-63, AU-55, VF-20"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Collection Status</label>
                <select
                  value={formData.status || 'in_collection'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as CoinStatus })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="in_collection">In Collection</option>
                  <option value="listed">Listed for Resale</option>
                  <option value="sold">Sold</option>
                  <option value="wishlist">Wishlist</option>
                </select>
              </div>

              {/* Valuation & Cost Fields */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-amber-400">
                  Central Valuation ({formData.currency || 'USD'} Base)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.estimatedValue ?? ''}
                  onChange={(e) => setFormData({ ...formData, estimatedValue: parseFloat(e.target.value) || 0 })}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-amber-500/50 rounded-xl text-sm text-amber-300 font-bold font-mono-num focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Conservative Low ({formData.currency || 'USD'})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.lowValue ?? ''}
                    onChange={(e) => setFormData({ ...formData, lowValue: parseFloat(e.target.value) || 0 })}
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Upper High ({formData.currency || 'USD'})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.highValue ?? ''}
                    onChange={(e) => setFormData({ ...formData, highValue: parseFloat(e.target.value) || 0 })}
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:col-span-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Acquisition Cost & Source Currency</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchasePrice ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          purchasePrice: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className="flex-1 min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                    <select
                      value={formData.purchaseCurrency || currency}
                      onChange={(e) =>
                        setFormData({ ...formData, purchaseCurrency: e.target.value as CurrencyCode })
                      }
                      aria-label="Purchase Currency"
                      className="w-24 min-h-[44px] px-2 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-bold"
                    >
                      {VALID_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Quantity Owned</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity ?? 1}
                    onChange={(e) => setFormData({ ...formData, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Category Tag</label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g. Silver Dollars, Ancient, Australian Pre-Decimal"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <datalist id="category-suggestions">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Acquisition Date</label>
                <input
                  type="date"
                  value={formData.purchaseDate || ''}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Condition Notes & Strike Details</label>
                <textarea
                  rows={2}
                  value={formData.conditionDetails || ''}
                  onChange={(e) => setFormData({ ...formData, conditionDetails: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Expandable Resale and Inventory Tracking Section */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowResaleSection(!showResaleSection)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xs sm:text-sm font-bold text-amber-400 hover:bg-slate-900/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span>Resale & Inventory Tracking</span>
                  {formData.listingStatus && formData.listingStatus !== 'unlisted' && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 uppercase">
                      {formData.listingStatus}
                    </span>
                  )}
                </div>
                {showResaleSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showResaleSection && (
                <div className="p-4 pt-1 space-y-4 border-t border-slate-800 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label className="text-xs font-semibold text-slate-300">SKU / Inventory ID</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const result = generateNextSku(formData, false);
                              setFormData({ ...formData, sku: result.sku });
                            }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Next SKU</span>
                          </button>
                          {!formData.barcodeId && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormData({ ...formData, barcodeId: allocateShortBarcodeId(coins) })
                              }
                              className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <QrCode className="w-3 h-3" />
                              <span>Link Barcode ID</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={formData.sku || ''}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                        placeholder="e.g. COIN-AUS-1966-50C-000001"
                        className={`w-full min-h-[40px] px-3 py-2 bg-slate-900 border rounded-xl text-xs text-slate-100 font-mono focus:outline-none uppercase ${
                          !skuValidation.isUnique ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700 focus:border-amber-500'
                        }`}
                      />
                      {formData.barcodeId && (
                        <span className="text-[10px] text-sky-300 font-mono block">
                          Linked Compact Barcode ID: {formData.barcodeId} (Immutable)
                        </span>
                      )}
                      {!skuValidation.isUnique && (
                        <span className="text-[11px] text-rose-400 flex items-center gap-1 pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>SKU already exists on "{skuValidation.conflictCoin?.title}". Duplicate SKUs are prevented.</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Storage Location</label>
                      <input
                        type="text"
                        value={formData.storageLocation || ''}
                        onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                        placeholder="e.g. Safe Box 2, Binder A Page 4"
                        className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Cost Basis Allocation</label>
                      <select
                        value={formData.costBasisType || 'total'}
                        onChange={(e) => setFormData({ ...formData, costBasisType: e.target.value as CostBasisType })}
                        className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        <option value="total">Total Lot Amount (shared across all {formData.quantity || 1} coins)</option>
                        <option value="per_coin">Per-Coin Unit Price (multiplied by quantity)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Listing Status</label>
                      <select
                        value={formData.listingStatus || 'unlisted'}
                        onChange={(e) => setFormData({ ...formData, listingStatus: e.target.value as ListingStatus })}
                        className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        <option value="unlisted">Unlisted</option>
                        <option value="listed">Active Listing</option>
                        <option value="pending">Sale Pending</option>
                        <option value="sold">Sold</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Listing Platform</label>
                      <input
                        type="text"
                        value={formData.listingPlatform || ''}
                        onChange={(e) => setFormData({ ...formData, listingPlatform: e.target.value })}
                        placeholder="e.g. eBay, Heritage, MA-Shops, Private Sale"
                        className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Asking Price & Currency</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={formData.askingPrice ?? ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              askingPrice: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                          className="flex-1 min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                        <select
                          value={formData.askingCurrency || currency}
                          onChange={(e) =>
                            setFormData({ ...formData, askingCurrency: e.target.value as CurrencyCode })
                          }
                          aria-label="Asking currency"
                          className="w-20 min-h-[40px] px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-bold"
                        >
                          {VALID_CURRENCIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Listing URL</label>
                      <input
                        type="url"
                        value={formData.listingUrl || ''}
                        onChange={(e) => setFormData({ ...formData, listingUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Platform Fee Preset</label>
                      <select
                        value={activeFeeConfig.presetId}
                        onChange={(e) => {
                          const presetId = e.target.value as PlatformFeePresetId;
                          const grossRef =
                            formData.soldPrice && formData.soldPrice > 0
                              ? formData.soldPrice
                              : formData.askingPrice && formData.askingPrice > 0
                              ? formData.askingPrice
                              : (formData.estimatedValue || 0) * Math.max(1, formData.quantity || 1);
                          const pct =
                            presetId === 'private_0'
                              ? 0
                              : presetId === 'ebay_au_13_5'
                              ? resaleFeeSettings.ebayAuPercent
                              : formData.customFeePercent ?? resaleFeeSettings.customPercent;
                          const post =
                            presetId === 'private_0'
                              ? 0
                              : presetId === 'ebay_au_13_5'
                              ? resaleFeeSettings.ebayAuFixedPostage
                              : formData.customFixedPostage ??
                                formData.sellerPaidPostage ??
                                resaleFeeSettings.customFixedPostage;
                          setFormData({
                            ...formData,
                            platformFeePreset: presetId,
                            sellingFees: Math.round(grossRef * (pct / 100) * 100) / 100,
                            sellerPaidPostage: post,
                          });
                        }}
                        className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        <option value="private_0">{PLATFORM_FEE_PRESET_LABELS.private_0}</option>
                        <option value="ebay_au_13_5">{PLATFORM_FEE_PRESET_LABELS.ebay_au_13_5}</option>
                        <option value="custom">{PLATFORM_FEE_PRESET_LABELS.custom}</option>
                      </select>
                    </div>

                    {activeFeeConfig.presetId === 'custom' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300">Custom Fee (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={formData.customFeePercent ?? resaleFeeSettings.customPercent}
                            onChange={(e) => {
                              const pct = Math.max(0, parseFloat(e.target.value) || 0);
                              const grossRef =
                                formData.soldPrice && formData.soldPrice > 0
                                  ? formData.soldPrice
                                  : (formData.estimatedValue || 0) * Math.max(1, formData.quantity || 1);
                              setFormData({
                                ...formData,
                                platformFeePreset: 'custom',
                                customFeePercent: pct,
                                sellingFees: Math.round(grossRef * (pct / 100) * 100) / 100,
                              });
                            }}
                            className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300">Custom Fixed Postage (USD)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={
                              formData.customFixedPostage ??
                              formData.sellerPaidPostage ??
                              resaleFeeSettings.customFixedPostage
                            }
                            onChange={(e) => {
                              const post = Math.max(0, parseFloat(e.target.value) || 0);
                              setFormData({
                                ...formData,
                                platformFeePreset: 'custom',
                                customFixedPostage: post,
                                sellerPaidPostage: post,
                              });
                            }}
                            className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Realized Sale Proceeds & Costs */}
                  <div className="pt-3 border-t border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-200 block">
                        Realized Sale Proceeds & Expense Deductions
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <label className="text-slate-400">Expense Currency:</label>
                        <select
                          value={formData.sellingCostsCurrency || formData.soldCurrency || currency}
                          onChange={(e) =>
                            setFormData({ ...formData, sellingCostsCurrency: e.target.value as CurrencyCode })
                          }
                          aria-label="Selling costs currency"
                          className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold"
                        >
                          {VALID_CURRENCIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Sold Price & Currency</label>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={formData.soldPrice ?? ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                soldPrice: e.target.value ? parseFloat(e.target.value) : undefined,
                              })
                            }
                            className="flex-1 min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                          />
                          <select
                            value={formData.soldCurrency || currency}
                            onChange={(e) =>
                              setFormData({ ...formData, soldCurrency: e.target.value as CurrencyCode })
                            }
                            aria-label="Sold price currency"
                            className="w-18 min-h-[40px] px-1.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-bold"
                          >
                            {VALID_CURRENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Sold Quantity (Partial)</label>
                        <input
                          type="number"
                          min="1"
                          max={formData.quantity || 1}
                          value={formData.soldQuantity ?? 1}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              soldQuantity: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Sold Date</label>
                        <input
                          type="date"
                          value={formData.soldDate || ''}
                          onChange={(e) => setFormData({ ...formData, soldDate: e.target.value })}
                          className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          Selling Fees ({formData.sellingCostsCurrency || formData.soldCurrency || currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.sellingFees ?? ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sellingFees: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                          placeholder="e.g. 13.5% eBay fee"
                          className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          Seller Postage ({formData.sellingCostsCurrency || formData.soldCurrency || currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.sellerPaidPostage ?? ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sellerPaidPostage: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                          className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          Other Direct Costs ({formData.sellingCostsCurrency || formData.soldCurrency || currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.otherDirectCosts ?? ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              otherDirectCosts: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                          placeholder="Slab fee, insurance..."
                          className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Unrealized Net Profit (After Fees):</span>
                        <span
                          className={`font-bold font-mono-num text-sm ${
                            previewUnrealizedProfit.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatCoinValue(previewUnrealizedProfit.unrealizedGain, currency, USD_FX_RATES, true)}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Realized Net Profit (After Fees):</span>
                        <span
                          className={`font-bold font-mono-num text-sm ${
                            previewNetProfit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatCoinValue(previewNetProfit.netProfit, currency, USD_FX_RATES, true)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Personal Notes */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Personal Notes & Provenance</label>
              <textarea
                rows={2}
                value={formData.personalNotes || ''}
                onChange={(e) => setFormData({ ...formData, personalNotes: e.target.value })}
                placeholder="Dealer name, receipt details, pedigree..."
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </form>

          {/* Sticky Bottom Actions */}
          <div className="px-4 sm:px-6 pt-3 pb-safe border-t border-slate-800 bg-slate-950/95 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRequestClose}
              className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              form="coin-edit-form"
              disabled={saving || !!uploadingSide || !metalValidation.valid}
              className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 hover:brightness-110 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : isExistingCoin ? 'Save Changes' : 'Add to Collection'}</span>
            </button>
          </div>
        </div>
      </div>

      <UnsavedChangesModal
        isOpen={showUnsavedPrompt}
        onConfirmDiscard={() => {
          setShowUnsavedPrompt(false);
          onClose();
        }}
        onKeepEditing={() => setShowUnsavedPrompt(false)}
      />
    </>
  );
};
