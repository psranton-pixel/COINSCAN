import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  Download,
  Share2,
  Edit3,
  Trash2,
  Copy,
  RefreshCw,
  Award,
  TrendingUp,
  Info,
  Check,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileJson,
  LayoutGrid,
  ExternalLink,
  ShieldAlert,
  Coins,
  DollarSign,
  PackageCheck,
  ShoppingBag,
  Clock,
  Layers,
  Printer,
  Split,
  MoreVertical,
  Plus,
} from 'lucide-react';
import type {
  AuctionComp,
  CoinRecord,
  CompPriceType,
  CompSourceType,
  CurrencyCode,
  PlatformFeePresetId,
} from '../types/coin';
import { VALID_CURRENCIES } from '../types/coin';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { LabelPrintModal } from './LabelPrintModal';
import {
  getMethodologyLabel,
  getEvidenceQualityLabel,
  getRarityColor,
} from '../utils/formatters';
import {
  formatCoinValue,
  formatNativeCurrency,
  normalizeCurrencyCode,
  toUsdAmount,
  USD_FX_RATES,
} from '../utils/currency';
import { evaluateCoinMeltValue } from '../services/marketRatesService';
import { downloadDataUrl, generateCollectorSlabPNG } from '../utils/imageProcessor';
import {
  calculateRealizedNetProfit,
  calculateUnrealizedGain,
  getActiveOwnedQuantity,
  PLATFORM_FEE_PRESET_LABELS,
  resolveCoinFeeConfig,
} from '../utils/inventoryCalculations';

interface CoinDetailModalProps {
  coin: CoinRecord | null;
  onClose: () => void;
  onReturnToGallery?: () => void;
  onEdit?: (coin: CoinRecord) => void;
  onSelectCoin?: (coin: CoinRecord) => void;
}

export const CoinDetailModal: React.FC<CoinDetailModalProps> = ({
  coin,
  onClose,
  onReturnToGallery,
  onEdit,
  onSelectCoin,
}) => {
  const { currency } = useAuth();
  const {
    coins,
    toggleFavorite,
    duplicateCoin,
    deleteCoin,
    updateCoin,
    generateNextSku,
    splitCoinStock,
    resaleFeeSettings,
    refreshCoinValuation,
    importDemoCoinAsReal,
  } = useCollection();
  const [showReverse, setShowReverse] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingSlab, setDownloadingSlab] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportedPreviewUrl, setExportedPreviewUrl] = useState<{
    url: string;
    filename: string;
    label: string;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [refreshingValuation, setRefreshingValuation] = useState(false);
  const [showAddCompForm, setShowAddCompForm] = useState(false);
  const [newComp, setNewComp] = useState<{
    sourceType: CompSourceType;
    auctionHouse: string;
    lotNumber: string;
    coinVariety: string;
    date: string;
    grade: string;
    originalPrice: string;
    originalCurrency: CurrencyCode;
    priceType: CompPriceType;
    url: string;
  }>({
    sourceType: 'verified_auction',
    auctionHouse: '',
    lotNumber: '',
    coinVariety: '',
    date: new Date().toISOString().split('T')[0],
    grade: '',
    originalPrice: '',
    originalCurrency: currency,
    priceType: 'hammer',
    url: '',
  });
  const [activeTab, setActiveTab] = useState<'specs' | 'valuation' | 'inventory' | 'provenance'>('specs');

  useEffect(() => {
    setShowReverse(false);
    setExportMessage(null);
    setExportedPreviewUrl(null);
    setConfirmDeleteOpen(false);
    setActionsMenuOpen(false);
    setShowAddCompForm(false);
  }, [coin?.id]);

  useEffect(() => {
    if (!coin) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [coin, onClose]);

  if (!coin) return null;

  const liveCoin = coins.find((c) => c.id === coin.id) || coin;
  const currentIndex = coins.findIndex((c) => c.id === liveCoin.id);
  const prevCoin = currentIndex > 0 ? coins[currentIndex - 1] : null;
  const nextCoin = currentIndex >= 0 && currentIndex < coins.length - 1 ? coins[currentIndex + 1] : null;

  const displayImage = showReverse && liveCoin.reverseImage ? liveCoin.reverseImage : liveCoin.obverseImage;

  // Inventory & Profit Calculations (Net of selected platform fee preset)
  const activeOwnedQty = getActiveOwnedQuantity(liveCoin);
  const feeConfig = resolveCoinFeeConfig(liveCoin, resaleFeeSettings);
  const realizedNetProfit = calculateRealizedNetProfit(liveCoin, currency, resaleFeeSettings);
  const unrealizedGain = calculateUnrealizedGain(liveCoin, currency, resaleFeeSettings);

  const handleSelectFeePreset = async (presetId: PlatformFeePresetId) => {
    const grossRef =
      liveCoin.soldPrice && liveCoin.soldPrice > 0
        ? liveCoin.soldPrice
        : liveCoin.askingPrice && liveCoin.askingPrice > 0
        ? liveCoin.askingPrice
        : (liveCoin.estimatedValue || 0) * Math.max(1, liveCoin.quantity || 1);

    const nextPercent =
      presetId === 'private_0'
        ? 0
        : presetId === 'ebay_au_13_5'
        ? resaleFeeSettings.ebayAuPercent
        : liveCoin.customFeePercent ?? resaleFeeSettings.customPercent;

    const nextPostage =
      presetId === 'private_0'
        ? 0
        : presetId === 'ebay_au_13_5'
        ? resaleFeeSettings.ebayAuFixedPostage
        : liveCoin.customFixedPostage ?? liveCoin.sellerPaidPostage ?? resaleFeeSettings.customFixedPostage;

    await updateCoin({
      id: liveCoin.id,
      platformFeePreset: presetId,
      sellingFees: Math.round(grossRef * (nextPercent / 100) * 100) / 100,
      sellerPaidPostage: nextPostage,
      ...(presetId === 'private_0'
        ? { listingPlatform: liveCoin.listingPlatform || 'Private / Marketplace' }
        : presetId === 'ebay_au_13_5'
        ? { listingPlatform: 'eBay Australia' }
        : {}),
    });
  };

  const showTempMessage = (msg: string) => {
    setExportMessage(msg);
    setTimeout(() => {
      setExportMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleGenerateSku = async () => {
    try {
      const result = generateNextSku(liveCoin);
      await updateCoin({ id: liveCoin.id, sku: result.sku });
      showTempMessage(`Assigned SKU: ${result.sku}`);
    } catch (err) {
      console.error('Failed to generate SKU:', err);
      showTempMessage('Could not generate SKU.');
    }
  };

  const handleSplitStock = async () => {
    setSplitting(true);
    try {
      const results = await splitCoinStock(liveCoin.id);
      setSplitConfirmOpen(false);
      showTempMessage(`Split into ${results.length} individual specimen records!`);
    } catch (err) {
      console.error('Failed to split coin stock:', err);
      showTempMessage('Could not split coin stock.');
    } finally {
      setSplitting(false);
    }
  };

  const handleDownloadSinglePNG = async () => {
    try {
      setDownloadingPng(true);
      const targetImg = showReverse && liveCoin.reverseImage ? liveCoin.reverseImage : liveCoin.obverseImage;
      const sideLabel = showReverse ? 'reverse' : 'obverse';
      const filename = `${liveCoin.title.replace(/[^a-zA-Z0-9]/g, '_')}_${sideLabel}_transparent.png`;
      await downloadDataUrl(targetImg, filename);
      setExportedPreviewUrl({
        url: targetImg,
        filename,
        label: `${liveCoin.title} (${sideLabel.toUpperCase()} PNG)`,
      });
      showTempMessage(`Downloaded ${sideLabel} transparent PNG!`);
    } catch (err) {
      console.error('Failed to download PNG:', err);
      showTempMessage('Could not export PNG image.');
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleDownloadSlabPNG = async () => {
    try {
      setDownloadingSlab(true);
      const slabDataUrl = await generateCollectorSlabPNG(
        liveCoin.obverseImage,
        liveCoin.reverseImage,
        liveCoin.title,
        liveCoin.estimatedGrade || 'Authentic',
        liveCoin.year || '',
        liveCoin.country
      );
      const filename = `${liveCoin.title.replace(/[^a-zA-Z0-9]/g, '_')}_Collector_Slab.png`;
      await downloadDataUrl(slabDataUrl, filename);
      setExportedPreviewUrl({
        url: slabDataUrl,
        filename,
        label: `${liveCoin.title} — Collector Slab Card`,
      });
      showTempMessage('Collector Slab Card exported & downloaded!');
    } catch (err) {
      console.error('Failed to generate collector slab:', err);
      showTempMessage('Could not generate Collector Slab.');
    } finally {
      setDownloadingSlab(false);
    }
  };

  const handleExportCoinJson = () => {
    try {
      const filename = `${liveCoin.title.replace(/[^a-zA-Z0-9]/g, '_')}_record.json`;
      const blob = new Blob([JSON.stringify(liveCoin, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      showTempMessage('Coin JSON record exported!');
    } catch (err) {
      console.error('Failed to export coin JSON:', err);
    }
  };

  const handleNativeShare = async () => {
    if (!exportedPreviewUrl) return;
    try {
      const res = await fetch(exportedPreviewUrl.url);
      const blob = await res.blob();
      const file = new File([blob], exportedPreviewUrl.filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: liveCoin.title,
          text: `${liveCoin.title} (${liveCoin.estimatedGrade || 'Authentic'})`,
          files: [file],
        });
      } else {
        await downloadDataUrl(exportedPreviewUrl.url, exportedPreviewUrl.filename);
      }
    } catch {
      // User cancelled share or fallback
    }
  };

  const handleDuplicate = async () => {
    await duplicateCoin(liveCoin);
    showTempMessage('Duplicated coin in your collection!');
  };

  const handleDelete = async () => {
    await deleteCoin(liveCoin.id);
    setConfirmDeleteOpen(false);
    onClose();
  };

  const handleBackToGalleryClick = () => {
    if (onReturnToGallery) {
      onReturnToGallery();
    } else {
      onClose();
    }
  };

  const methodologyInfo = getMethodologyLabel(liveCoin.valuationMethodology);
  const evidenceInfo = getEvidenceQualityLabel(liveCoin.evidenceQuality);
  const meltEval = evaluateCoinMeltValue(liveCoin, currency);
  const estimatedUsd = toUsdAmount(liveCoin.estimatedValue, normalizeCurrencyCode(liveCoin.currency, 'USD'));
  const lowUsd = toUsdAmount(liveCoin.lowValue, normalizeCurrencyCode(liveCoin.currency, 'USD'));
  const highUsd = toUsdAmount(liveCoin.highValue, normalizeCurrencyCode(liveCoin.currency, 'USD'));

  const valTimestamp = liveCoin.lastValuationUpdate || liveCoin.valuationDate;
  const valAgeDays = valTimestamp ? Math.floor((Date.now() - new Date(valTimestamp).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isValuationStale = !Number.isNaN(valAgeDays) && valAgeDays > 30;

  const idConfidence = liveCoin.identificationConfidence ?? liveCoin.confidenceScore;
  const gradingConfidence = liveCoin.gradingConfidence ?? liveCoin.confidenceScore;
  const valuationConfidence = liveCoin.valuationConfidence ?? liveCoin.confidenceScore;

  const handleRefreshValuation = async () => {
    setRefreshingValuation(true);
    try {
      await refreshCoinValuation(liveCoin.id, currency);
      showTempMessage('Spot melt floor & FX reference refreshed.');
    } finally {
      setRefreshingValuation(false);
    }
  };

  const handleImportSampleToReal = async () => {
    const imported = await importDemoCoinAsReal(liveCoin.id);
    if (imported && onSelectCoin) {
      onSelectCoin(imported);
      showTempMessage(`Imported "${imported.title}" into your real collection with SKU ${imported.sku || ''}.`);
    }
  };

  const handleAddComparable = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(newComp.originalPrice);
    if (!newComp.auctionHouse.trim() || Number.isNaN(priceNum) || priceNum <= 0) return;
    const entry: AuctionComp = {
      sourceType: newComp.sourceType,
      auctionHouse: newComp.auctionHouse.trim(),
      lotNumber: newComp.lotNumber.trim() || undefined,
      coinVariety: newComp.coinVariety.trim() || liveCoin.title,
      date: newComp.date || new Date().toISOString().split('T')[0],
      grade: newComp.grade.trim() || liveCoin.estimatedGradeRange || liveCoin.estimatedGrade,
      realizedPrice: priceNum,
      originalPrice: priceNum,
      originalCurrency: newComp.originalCurrency,
      currency: newComp.originalCurrency,
      priceType: newComp.priceType,
      buyersPremiumIncluded: newComp.priceType === 'buyer_inclusive',
      url: newComp.url.trim() || undefined,
      verificationStatus: newComp.sourceType === 'verified_auction' ? 'verified_sale' : 'historical_comp',
    };
    const nextComps = [entry, ...(liveCoin.recentAuctionComps || [])];
    await updateCoin({
      id: liveCoin.id,
      recentAuctionComps: nextComps,
      evidenceCount: nextComps.length,
    });
    setShowAddCompForm(false);
    setNewComp({
      ...newComp,
      auctionHouse: '',
      lotNumber: '',
      originalPrice: '',
      url: '',
    });
    showTempMessage('Documented comparable added.');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[94dvh] sm:h-auto sm:max-h-[92vh]"
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-full pt-2 pb-0.5 bg-slate-950 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full" />
        </div>

        {/* Clean Responsive Header Toolbar (Zero Clipping at 320px+) */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-800 bg-slate-950/95 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleBackToGalleryClick}
              aria-label="Back to collection gallery"
              className="min-h-[44px] flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline sm:inline">Gallery</span>
            </button>

            {/* Prev / Next Specimen Switcher */}
            {coins.length > 1 && onSelectCoin && (
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 shrink-0">
                <button
                  type="button"
                  disabled={!prevCoin}
                  onClick={() => prevCoin && onSelectCoin(prevCoin)}
                  aria-label="Previous Coin"
                  className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-1 text-[11px] font-mono-num text-slate-400 whitespace-nowrap">
                  {currentIndex + 1}/{coins.length}
                </span>
                <button
                  type="button"
                  disabled={!nextCoin}
                  onClick={() => nextCoin && onSelectCoin(nextCoin)}
                  aria-label="Next Coin"
                  className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {liveCoin.isSample && (
              <span className="hidden md:inline-flex px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0">
                Demo Record
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 relative">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(liveCoin)}
                aria-label="Edit coin details"
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Edit</span>
              </button>
            )}

            {/* Labeled Overflow Actions Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={actionsMenuOpen}
                aria-label="More coin actions"
                className="min-h-[44px] flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                <MoreVertical className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Actions</span>
              </button>

              {actionsMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-56 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50 space-y-0.5 text-xs"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      toggleFavorite(liveCoin.id);
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Star className={`w-4 h-4 ${liveCoin.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                    <span>{liveCoin.isFavorite ? 'Remove Favorite' : 'Mark Favorite'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setPrintModalOpen(true);
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Print Label</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleRefreshValuation();
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span>Refresh Spot Valuation</span>
                  </button>

                  {liveCoin.isSample && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        handleImportSampleToReal();
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-2 text-left cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>Import to My Collection</span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleDuplicate();
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>Duplicate Record</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleDownloadSinglePNG();
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-sky-400" />
                    <span>Download Coin PNG</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleDownloadSlabPNG();
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>Download Slab Card</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleExportCoinJson();
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <FileJson className="w-4 h-4 text-amber-400" />
                    <span>Export Record JSON</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setConfirmDeleteOpen(true);
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-rose-950/60 text-rose-400 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Coin</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 border border-slate-700 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Confirmation Banner */}
        {confirmDeleteOpen && (
          <div className="px-4 sm:px-6 py-3 bg-rose-950/90 border-b border-rose-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-rose-200 font-medium">
              Delete <strong className="text-white">"{liveCoin.title}"</strong> from your collection?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}

        {/* Split Stock Confirmation Banner */}
        {splitConfirmOpen && (
          <div className="px-4 sm:px-6 py-3 bg-amber-950/90 border-b border-amber-700/80 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-amber-200 font-medium">
              Split lot into <strong className="text-white">{liveCoin.quantity} individual specimen records</strong> with sequential SKUs?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSplitConfirmOpen(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSplitStock}
                disabled={splitting}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
              >
                {splitting ? 'Splitting...' : 'Confirm Split'}
              </button>
            </div>
          </div>
        )}

        {/* Action Feedback Toast */}
        {exportMessage && (
          <div className="px-4 sm:px-6 py-2.5 bg-emerald-950/90 border-b border-emerald-700/60 flex items-center justify-between text-xs text-emerald-300 shrink-0">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setExportMessage(null)}
              className="text-emerald-400 hover:text-white text-[11px] font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Scrollable Modal Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          {/* Left Column: Transparent Coin Showcase */}
          <div className="lg:col-span-5 p-4 sm:p-6 bg-slate-950 flex flex-col items-center justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
            <div className="w-full flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-amber-400">
                {showReverse ? 'Reverse (Back)' : 'Obverse (Front)'}
              </span>
              <div className="flex items-center gap-1.5">
                {liveCoin.isSample && (
                  <span className="sm:hidden px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold uppercase">
                    Sample data
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${getRarityColor(liveCoin.rarity)}`}>
                  {liveCoin.rarity || 'Common'}
                </span>
              </div>
            </div>

            {/* Interactive Coin Display */}
            <div className="relative my-3 sm:my-4 w-full max-w-[230px] sm:max-w-[280px] aspect-square flex items-center justify-center group">
              <div className="absolute inset-0 bg-radial from-amber-500/15 via-transparent to-transparent blur-xl pointer-events-none" />

              <img
                src={displayImage}
                alt={liveCoin.title}
                className="relative max-h-full max-w-full object-contain filter drop-shadow-[0_20px_35px_rgba(0,0,0,0.8)] select-none"
              />

              {liveCoin.reverseImage && (
                <button
                  type="button"
                  onClick={() => setShowReverse(!showReverse)}
                  aria-label={`Flip coin to ${showReverse ? 'Obverse' : 'Reverse'}`}
                  className="absolute bottom-1 right-1 min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/95 hover:bg-slate-800 border border-amber-500/30 text-xs font-semibold text-amber-300 rounded-xl shadow-xl backdrop-blur-md transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Flip to {showReverse ? 'Obverse' : 'Reverse'}</span>
                </button>
              )}
            </div>

            {/* Front / Back Switcher */}
            {liveCoin.reverseImage && (
              <div className="flex items-center gap-2.5 mb-3">
                <button
                  type="button"
                  onClick={() => setShowReverse(false)}
                  className={`min-h-[40px] flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    !showReverse
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <img src={liveCoin.obverseImage} alt="Obverse thumbnail" className="w-5 h-5 object-contain" />
                  <span>Obverse</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReverse(true)}
                  className={`min-h-[40px] flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    showReverse
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <img src={liveCoin.reverseImage} alt="Reverse thumbnail" className="w-5 h-5 object-contain" />
                  <span>Reverse</span>
                </button>
              </div>
            )}

            {/* Download & Export Buttons */}
            <div className="w-full space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSinglePNG}
                  disabled={downloadingPng}
                  aria-label="Save transparent PNG"
                  className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{downloadingPng ? 'Saving...' : 'Save PNG'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSlabPNG}
                  disabled={downloadingSlab}
                  aria-label="Generate Collector Slab Card"
                  className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-xs font-semibold text-amber-300 whitespace-nowrap transition-colors"
                >
                  <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{downloadingSlab ? 'Creating...' : 'Slab Card'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportCoinJson}
                aria-label="Export Coin JSON record"
                className="w-full min-h-[40px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/70 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors"
              >
                <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Export Structured Record (JSON)</span>
              </button>

              {/* Exported Image Preview for Mobile */}
              {exportedPreviewUrl && (
                <div className="mt-2 p-3 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-300 truncate">
                      {exportedPreviewUrl.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExportedPreviewUrl(null)}
                      aria-label="Close export preview"
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-36 bg-slate-950 rounded-xl p-2 flex items-center justify-center overflow-hidden border border-slate-800">
                    <img
                      src={exportedPreviewUrl.url}
                      alt={exportedPreviewUrl.label}
                      className="max-h-32 object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-slate-400">
                      Long-press or tap Share to save image.
                    </span>
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      aria-label="Share exported image"
                      className="min-h-[36px] flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shrink-0"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Coin Data, Transparent Valuations & Resale Tracking */}
          <div className="lg:col-span-7 p-4 sm:p-6 space-y-5 bg-slate-900/50">
            {/* Title & Core Metadata */}
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mb-1">
                <span className="font-semibold text-amber-400">{liveCoin.country}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{liveCoin.year || 'Undated'}</span>
                {liveCoin.mintMark && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num font-semibold text-slate-300">
                      Mint: {liveCoin.mintMark}
                    </span>
                  </>
                )}
                {liveCoin.category && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-300">{liveCoin.category}</span>
                  </>
                )}
                {liveCoin.isSample && (
                  <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold uppercase tracking-wider">
                    Sample data
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-100 font-serif-title tracking-wide">
                {liveCoin.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                {liveCoin.denomination} {liveCoin.series ? `· ${liveCoin.series}` : ''}
              </p>
            </div>

            {/* Valuation Header Card with Explicit Currency, Converted Range & Stale/Refresh Bar */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border border-amber-500/30 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-amber-400/90 font-semibold uppercase tracking-wider">
                      Valuation Estimate ({currency})
                    </span>
                    <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 text-[10px] font-bold rounded">
                      {currency}
                    </span>
                    {isValuationStale && (
                      <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold rounded">
                        Stale (&gt;30d)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono-num">
                      {formatCoinValue(estimatedUsd, currency, USD_FX_RATES, true)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono-num">
                      (Range: {formatCoinValue(lowUsd, currency, USD_FX_RATES, true)} –{' '}
                      {formatCoinValue(highUsd, currency, USD_FX_RATES, true)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Methodology</span>
                    <span className="text-xs font-bold text-amber-300 block">
                      {methodologyInfo.label}
                    </span>
                  </div>
                  {meltEval.available && meltEval.breakdown ? (
                    <div className="text-right pl-3 border-l border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Verified Melt</span>
                      <span className="text-sm font-bold text-slate-200 font-mono-num">
                        {formatCoinValue(meltEval.breakdown.meltValueUSD, currency, USD_FX_RATES, true)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-right pl-3 border-l border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Melt Floor</span>
                      <span className="text-[11px] text-slate-400">Unavailable</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Traceability & Date Bar */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    Valuation:{' '}
                    <strong className="text-slate-300">
                      {liveCoin.valuationDate ? liveCoin.valuationDate.split('T')[0] : 'Recorded'}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Evidence Refs: <strong className="text-slate-200">{liveCoin.evidenceCount ?? (liveCoin.recentAuctionComps?.length || 0)}</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${evidenceInfo.color}`}>
                    {evidenceInfo.label}
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshValuation}
                    disabled={refreshingValuation}
                    className="min-h-[28px] px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshingValuation ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4-Tab Navigation */}
            <div className="grid grid-cols-4 border-b border-slate-800 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() => setActiveTab('specs')}
                className={`min-h-[42px] pb-2 font-semibold transition-colors border-b-2 whitespace-nowrap text-center ${
                  activeTab === 'specs'
                    ? 'text-amber-400 border-amber-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                Specs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('valuation')}
                className={`min-h-[42px] pb-2 font-semibold transition-colors border-b-2 whitespace-nowrap text-center ${
                  activeTab === 'valuation'
                    ? 'text-amber-400 border-amber-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                Valuation
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className={`min-h-[42px] pb-2 font-semibold transition-colors border-b-2 whitespace-nowrap text-center ${
                  activeTab === 'inventory'
                    ? 'text-amber-400 border-amber-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                Resale
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('provenance')}
                className={`min-h-[42px] pb-2 font-semibold transition-colors border-b-2 whitespace-nowrap text-center ${
                  activeTab === 'provenance'
                    ? 'text-amber-400 border-amber-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                Notes
              </button>
            </div>

            {/* TAB 1: Specs & Grading */}
            {activeTab === 'specs' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Composition</span>
                    <span className="text-xs font-semibold text-slate-200 mt-0.5 block truncate">
                      {liveCoin.metalComposition || 'Unspecified'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Weight</span>
                    <span className="text-xs font-semibold text-slate-200 font-mono-num mt-0.5 block">
                      {liveCoin.weightGrams ? `${liveCoin.weightGrams} g` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Diameter</span>
                    <span className="text-xs font-semibold text-slate-200 font-mono-num mt-0.5 block">
                      {liveCoin.diameterMm ? `${liveCoin.diameterMm} mm` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Metal Category</span>
                    <span className="text-xs font-semibold text-slate-200 capitalize mt-0.5 block">
                      {liveCoin.metalCategory || 'Clad / Base'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Bullion Class</span>
                    <span className="text-xs font-semibold text-slate-200 capitalize mt-0.5 block">
                      {liveCoin.bullionType ? liveCoin.bullionType.replace('_', ' ') : 'Standard'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Rarity Tier</span>
                    <span className={`text-xs font-semibold mt-0.5 block ${getRarityColor(liveCoin.rarity)}`}>
                      {liveCoin.rarity}
                    </span>
                  </div>
                </div>

                {/* Provisional Grading Notice */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">Sheldon Grade Assessment</span>
                    <span className="text-xs font-mono-num font-bold text-slate-200">
                      {liveCoin.estimatedGrade || 'Authentic / Ungraded'}
                    </span>
                  </div>
                  {liveCoin.conditionDetails && (
                    <p className="text-xs text-slate-300 pt-1 leading-relaxed">
                      {liveCoin.conditionDetails}
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-800/80 flex items-start gap-1.5 text-[10px] text-slate-500">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400/80 shrink-0 mt-0.5" />
                    <span>
                      Photo grading is provisional and does not establish authenticity or professional certification from PCGS, NGC or ANACS.
                    </span>
                  </div>
                </div>

                {liveCoin.historicalSignificance && (
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800">
                    <h4 className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>Historical Significance</span>
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {liveCoin.historicalSignificance}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Valuation, Traceability & Documented Comps */}
            {activeTab === 'valuation' && (
              <div className="space-y-4">
                {/* Separate Confidence Metrics */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">ID Confidence</span>
                    <span className="font-mono-num font-bold text-slate-100 mt-0.5 block">
                      {idConfidence !== undefined ? `${idConfidence}%` : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">Grading Confidence</span>
                    <span className="font-mono-num font-bold text-slate-100 mt-0.5 block">
                      {gradingConfidence !== undefined ? `${gradingConfidence}%` : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">Valuation Confidence</span>
                    <span className="font-mono-num font-bold text-slate-100 mt-0.5 block">
                      {valuationConfidence !== undefined ? `${valuationConfidence}%` : '—'}
                    </span>
                  </div>
                </div>

                {/* Methodology & Rationale */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <span>Valuation Methodology & Estimate Rationale</span>
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {liveCoin.valuationRationale || methodologyInfo.description}
                  </p>
                  {liveCoin.supportingSources && liveCoin.supportingSources.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 text-xs">
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                        Supporting Sources & Reference Records:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                        {liveCoin.supportingSources.map((source, idx) => (
                          <li key={idx} className="truncate">{source}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Bullion Melt Calculation or Honest Unavailable State */}
                {meltEval.available && meltEval.breakdown ? (
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Verified Precious Metal Melt Calculation</span>
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono-num">
                        {meltEval.breakdown.pureGrams} g pure ({meltEval.breakdown.pureTroyOunces.toFixed(4)} oz t)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Pure Metal</span>
                        <span className="font-semibold text-slate-200 font-mono-num">
                          {meltEval.breakdown.pureTroyOunces.toFixed(4)} oz t
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Fineness</span>
                        <span className="font-semibold text-slate-200 font-mono-num">
                          {(meltEval.breakdown.fineness * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Spot Snapshot (USD)</span>
                        <span className="font-semibold text-slate-200 font-mono-num">
                          {formatCoinValue(meltEval.breakdown.spotPricePerOzUSD, 'USD', USD_FX_RATES)}/oz
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Melt in {currency}</span>
                        <span className="font-bold text-amber-300 font-mono-num">
                          {formatCoinValue(meltEval.breakdown.meltValueUSD, currency, USD_FX_RATES, true)}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500">
                      Snapshot: {meltEval.breakdown.spotSource} ({meltEval.breakdown.spotTimestamp.split('T')[0]}) · FX: {meltEval.breakdown.fxConversion?.direction || 'USD -> USD'} ({meltEval.breakdown.fxConversion?.source || 'Benchmark'})
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                    <strong className="text-slate-300 block mb-0.5">Melt value unavailable</strong>
                    <span className="text-[11px]">{meltEval.unavailableReason || 'Insufficient verified metal inputs.'}</span>
                  </div>
                )}

                {/* Traceable Comparable Sales & Dealer Asks */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-300">
                      Comparable Auction Sales & Documented References
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddCompForm((prev) => !prev)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showAddCompForm ? 'Cancel' : 'Add Comparable'}</span>
                    </button>
                  </div>

                  {showAddCompForm && (
                    <form
                      onSubmit={handleAddComparable}
                      className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2.5 text-xs"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          value={newComp.sourceType}
                          onChange={(e) => setNewComp({ ...newComp, sourceType: e.target.value as CompSourceType })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        >
                          <option value="verified_auction">Verified Auction Result</option>
                          <option value="dealer_ask">Dealer Asking Price</option>
                          <option value="user_entered">User-Entered Sale / Quote</option>
                        </select>
                        <input
                          type="text"
                          required
                          placeholder="Auction house or dealer (e.g. Heritage)"
                          value={newComp.auctionHouse}
                          onChange={(e) => setNewComp({ ...newComp, auctionHouse: e.target.value })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="Lot # (if available)"
                          value={newComp.lotNumber}
                          onChange={(e) => setNewComp({ ...newComp, lotNumber: e.target.value })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="Coin / Variety"
                          value={newComp.coinVariety}
                          onChange={(e) => setNewComp({ ...newComp, coinVariety: e.target.value })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="Grade (e.g. PCGS MS-63)"
                          value={newComp.grade}
                          onChange={(e) => setNewComp({ ...newComp, grade: e.target.value })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        />
                        <input
                          type="date"
                          value={newComp.date}
                          onChange={(e) => setNewComp({ ...newComp, date: e.target.value })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            required
                            step="0.01"
                            placeholder="Price"
                            value={newComp.originalPrice}
                            onChange={(e) => setNewComp({ ...newComp, originalPrice: e.target.value })}
                            className="flex-1 min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono"
                          />
                          <select
                            value={newComp.originalCurrency}
                            onChange={(e) => setNewComp({ ...newComp, originalCurrency: e.target.value as CurrencyCode })}
                            className="w-20 min-h-[38px] px-1.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold"
                          >
                            {VALID_CURRENCIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <select
                          value={newComp.priceType}
                          onChange={(e) => setNewComp({ ...newComp, priceType: e.target.value as CompPriceType })}
                          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        >
                          <option value="hammer">Hammer Price</option>
                          <option value="buyer_inclusive">Buyer-Inclusive Realized</option>
                          <option value="asking">Dealer Asking Price</option>
                        </select>
                        <input
                          type="url"
                          placeholder="Source URL (https://...)"
                          value={newComp.url}
                          onChange={(e) => setNewComp({ ...newComp, url: e.target.value })}
                          className="sm:col-span-2 min-h-[38px] px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="min-h-[36px] px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold cursor-pointer"
                        >
                          Save Comparable Reference
                        </button>
                      </div>
                    </form>
                  )}

                  {liveCoin.recentAuctionComps && liveCoin.recentAuctionComps.length > 0 ? (
                    <div className="space-y-2">
                      {liveCoin.recentAuctionComps.map((comp, idx) => {
                        const origCur = normalizeCurrencyCode(comp.originalCurrency || comp.currency, 'USD');
                        const origAmt = comp.originalPrice ?? comp.realizedPrice;
                        const usdAmt = toUsdAmount(origAmt, origCur);
                        const sourceLabel =
                          comp.sourceType === 'verified_auction'
                            ? 'Verified Auction'
                            : comp.sourceType === 'dealer_ask'
                            ? 'Dealer Ask'
                            : comp.sourceType === 'ai_estimate'
                            ? 'AI Estimate'
                            : 'User-Entered';
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[9px] font-bold uppercase">
                                  {sourceLabel}
                                </span>
                                <span className="font-bold text-slate-200">{comp.auctionHouse}</span>
                                {comp.lotNumber && (
                                  <span className="text-[11px] text-slate-400 font-mono-num">Lot {comp.lotNumber}</span>
                                )}
                                {comp.priceType && comp.priceType !== 'unknown' && (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] capitalize">
                                    {comp.priceType.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                              {comp.coinVariety && (
                                <div className="text-[11px] text-slate-300 truncate">{comp.coinVariety}</div>
                              )}
                              <div className="text-slate-500 text-[11px]">
                                {comp.date} · Grade: <span className="text-slate-300 font-medium">{comp.grade}</span>
                                {origCur !== currency && ` · Orig: ${formatNativeCurrency(origAmt, origCur, true)}`}
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                              <div className="text-right">
                                <span className="text-[10px] text-slate-500 block">Converted ({currency})</span>
                                <span className="font-bold text-amber-400 font-mono-num text-sm">
                                  {formatCoinValue(usdAmt, currency, USD_FX_RATES, true)}
                                </span>
                              </div>

                              {comp.url && (
                                <a
                                  href={comp.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open original auction lot at ${comp.auctionHouse}`}
                                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center gap-1"
                                >
                                  <span>Lot Source</span>
                                  <ExternalLink className="w-3 h-3 text-amber-400" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 text-center">
                      No verified comparable sales available.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Inventory & Resale Tracking */}
            {activeTab === 'inventory' && (
              <div className="space-y-4">
                {/* Financial Overview Card */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Owned Quantity</span>
                    <span className="text-sm font-bold text-slate-200 font-mono-num mt-0.5 block">
                      {activeOwnedQty} {liveCoin.quantity > 1 ? `(of ${liveCoin.quantity} total)` : ''}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Entered Cost Basis</span>
                    <span className="text-sm font-bold text-slate-200 font-mono-num mt-0.5 block">
                      {liveCoin.purchasePrice
                        ? formatCoinValue(
                            toUsdAmount(liveCoin.purchasePrice, normalizeCurrencyCode(liveCoin.purchaseCurrency, 'USD')),
                            currency,
                            USD_FX_RATES,
                            true
                          )
                        : 'Not specified'}
                    </span>
                    {liveCoin.purchasePrice && liveCoin.purchaseCurrency && liveCoin.purchaseCurrency !== currency && (
                      <span className="text-[10px] text-slate-500 block">
                        Orig: {formatNativeCurrency(liveCoin.purchasePrice, liveCoin.purchaseCurrency, true)}
                      </span>
                    )}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Cost Basis Type</span>
                    <span className="text-xs font-semibold text-slate-300 capitalize mt-0.5 block">
                      {liveCoin.costBasisType === 'total' ? 'Total Lot Cost' : 'Per-Coin Unit Cost'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Storage Location</span>
                    <span className="text-xs font-semibold text-slate-200 mt-0.5 block truncate">
                      {liveCoin.storageLocation || 'Vault / Album'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 block">SKU / Item #</span>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-xs font-mono font-bold text-amber-300 truncate">
                        {liveCoin.sku || 'No SKU'}
                      </span>
                      {!liveCoin.sku && (
                        <button
                          type="button"
                          onClick={handleGenerateSku}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold cursor-pointer"
                        >
                          Generate
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">
                      Unrealized Net Profit (After Fees)
                    </span>
                    <span
                      className={`text-sm font-bold font-mono-num mt-0.5 block ${
                        unrealizedGain.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatCoinValue(unrealizedGain.unrealizedGain, currency, USD_FX_RATES, true)}
                    </span>
                  </div>
                </div>

                {/* Configurable Platform Fee Presets */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        Platform Fee Preset (Net Profit Deduction)
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Select a selling channel preset to calculate Unrealized & Realized Net Profit net of fees and postage.
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                      {feeConfig.presetLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(['private_0', 'ebay_au_13_5', 'custom'] as PlatformFeePresetId[]).map((presetId) => {
                      const active = feeConfig.presetId === presetId;
                      return (
                        <button
                          key={presetId}
                          type="button"
                          onClick={() => handleSelectFeePreset(presetId)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            active
                              ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold">
                              {PLATFORM_FEE_PRESET_LABELS[presetId]}
                            </span>
                            {active && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {presetId === 'private_0'
                              ? '0% fee · No platform commission'
                              : presetId === 'ebay_au_13_5'
                              ? `~${resaleFeeSettings.ebayAuPercent}% fee${
                                  resaleFeeSettings.ebayAuFixedPostage > 0
                                    ? ` + ${formatCoinValue(resaleFeeSettings.ebayAuFixedPostage, currency, USD_FX_RATES)}`
                                    : ''
                                }`
                              : `${liveCoin.customFeePercent ?? resaleFeeSettings.customPercent}% + ${formatCoinValue(
                                  liveCoin.customFixedPostage ??
                                    liveCoin.sellerPaidPostage ??
                                    resaleFeeSettings.customFixedPostage,
                                  currency,
                                  USD_FX_RATES
                                )} postage`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {feeConfig.presetId === 'custom' && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Custom Platform Fee (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={liveCoin.customFeePercent ?? resaleFeeSettings.customPercent}
                          onChange={(e) => {
                            const pct = Math.max(0, parseFloat(e.target.value) || 0);
                            const grossRef =
                              liveCoin.soldPrice && liveCoin.soldPrice > 0
                                ? liveCoin.soldPrice
                                : (liveCoin.estimatedValue || 0) * Math.max(1, liveCoin.quantity || 1);
                            updateCoin({
                              id: liveCoin.id,
                              platformFeePreset: 'custom',
                              customFeePercent: pct,
                              sellingFees: Math.round(grossRef * (pct / 100) * 100) / 100,
                            });
                          }}
                          className="w-full min-h-[36px] px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Fixed Postage (USD Base)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={
                            liveCoin.customFixedPostage ??
                            liveCoin.sellerPaidPostage ??
                            resaleFeeSettings.customFixedPostage
                          }
                          onChange={(e) => {
                            const post = Math.max(0, parseFloat(e.target.value) || 0);
                            updateCoin({
                              id: liveCoin.id,
                              platformFeePreset: 'custom',
                              customFixedPostage: post,
                              sellerPaidPostage: post,
                            });
                          }}
                          className="w-full min-h-[36px] px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Net Profit Breakdown Summary */}
                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">Est. Platform Fee ({feeConfig.feePercent}%)</span>
                      <span className="font-bold text-rose-300 font-mono-num">
                        -{formatCoinValue(unrealizedGain.estimatedSellingFees, currency, USD_FX_RATES, true)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">Fixed Postage</span>
                      <span className="font-bold text-rose-300 font-mono-num">
                        -{formatCoinValue(unrealizedGain.estimatedPostage, currency, USD_FX_RATES, true)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">Net Proceeds (Est.)</span>
                      <span className="font-bold text-slate-200 font-mono-num">
                        {formatCoinValue(unrealizedGain.netProceedsAfterFees, currency, USD_FX_RATES, true)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">Unrealized Net Profit</span>
                      <span
                        className={`font-bold font-mono-num ${
                          unrealizedGain.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatCoinValue(unrealizedGain.unrealizedGain, currency, USD_FX_RATES, true)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Multi-Quantity Stock Splitting Action (Requirement 4) */}
                {liveCoin.quantity > 1 && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <Split className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 block">
                          Grouped Stock ({liveCoin.quantity} pieces share this record)
                        </span>
                        <p className="text-slate-300 text-[11px] mt-0.5">
                          Want individual specimen tracking? Split this lot into {liveCoin.quantity} distinct records with individual sequential SKUs, preserving photos and allocating unit cost basis.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSplitConfirmOpen(true)}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer shadow-md transition-all"
                    >
                      Split into Specimens
                    </button>
                  </div>
                )}

                {/* Listing & Sale Section */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                      <span>Marketplace Listing & Resale Details</span>
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                      {liveCoin.listingStatus || 'Unlisted'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Platform</span>
                      <span className="font-semibold text-slate-200 mt-0.5 block truncate">
                        {liveCoin.listingPlatform || feeConfig.presetLabel}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Asking Price</span>
                      <span className="font-semibold text-slate-200 font-mono-num mt-0.5 block">
                        {liveCoin.askingPrice
                          ? formatCoinValue(
                              toUsdAmount(liveCoin.askingPrice, normalizeCurrencyCode(liveCoin.askingCurrency, 'USD')),
                              currency,
                              USD_FX_RATES,
                              true
                            )
                          : 'N/A'}
                      </span>
                      {liveCoin.askingPrice && liveCoin.askingCurrency && liveCoin.askingCurrency !== currency && (
                        <span className="text-[10px] text-slate-500 block">
                          Orig: {formatNativeCurrency(liveCoin.askingPrice, liveCoin.askingCurrency, true)}
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Realized Net Profit (After Fees)</span>
                      <span
                        className={`font-bold font-mono-num mt-0.5 block ${
                          (liveCoin.status === 'sold' || (liveCoin.soldQuantity || 0) > 0) && realizedNetProfit.netProfit >= 0
                            ? 'text-emerald-400'
                            : liveCoin.status === 'sold' || (liveCoin.soldQuantity || 0) > 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {liveCoin.status === 'sold' || (liveCoin.soldQuantity || 0) > 0
                          ? formatCoinValue(realizedNetProfit.netProfit, currency, USD_FX_RATES, true)
                          : 'Not sold'}
                      </span>
                    </div>
                  </div>

                  {liveCoin.listingUrl && (
                    <div className="pt-2">
                      <a
                        href={liveCoin.listingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline"
                      >
                        <span>View Active Listing Link</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  {/* Partial Sale Details if Sold */}
                  {(liveCoin.status === 'sold' || (liveCoin.soldPrice !== undefined && liveCoin.soldPrice > 0)) && (
                    <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Sold Price</span>
                        <span className="font-bold text-slate-200 font-mono-num">
                          {formatCoinValue(realizedNetProfit.grossSalePrice, currency, USD_FX_RATES, true)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Sold Quantity</span>
                        <span className="font-bold text-slate-200 font-mono-num">
                          {liveCoin.soldQuantity || 1}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Selling Fees ({realizedNetProfit.feePercent}%)</span>
                        <span className="font-bold text-rose-300 font-mono-num">
                          -{formatCoinValue(realizedNetProfit.sellingFees, currency, USD_FX_RATES, true)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Seller Postage</span>
                        <span className="font-bold text-rose-300 font-mono-num">
                          -{formatCoinValue(realizedNetProfit.sellerPostage, currency, USD_FX_RATES, true)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: Provenance & Personal Notes */}
            {activeTab === 'provenance' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Purchase Date</span>
                    <span className="text-xs font-semibold text-slate-200 mt-0.5 block">
                      {liveCoin.purchaseDate || 'Not recorded'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Acquisition Cost</span>
                    <span className="text-xs font-semibold text-slate-200 font-mono-num mt-0.5 block">
                      {liveCoin.purchasePrice
                        ? formatCoinValue(
                            toUsdAmount(liveCoin.purchasePrice, normalizeCurrencyCode(liveCoin.purchaseCurrency, 'USD')),
                            currency,
                            USD_FX_RATES,
                            true
                          )
                        : 'N/A'}
                    </span>
                    {liveCoin.purchasePrice && liveCoin.purchaseCurrency && liveCoin.purchaseCurrency !== currency && (
                      <span className="text-[10px] text-slate-500 block">
                        Orig: {formatNativeCurrency(liveCoin.purchasePrice, liveCoin.purchaseCurrency, true)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <h4 className="text-xs font-bold text-slate-300 mb-1.5">
                    Personal Notes & Provenance
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    {liveCoin.personalNotes || 'No provenance notes added yet for this coin.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Footer Bar for Easy Navigation */}
        <div className="px-3 sm:px-6 pt-2.5 pb-safe bg-slate-950/95 border-t border-slate-800 flex items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleBackToGalleryClick}
            aria-label="Back to Gallery"
            className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
          >
            <LayoutGrid className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Back to Gallery</span>
          </button>

          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(liveCoin)}
              aria-label="Edit coin details"
              className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap transition-colors shadow-md cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>Edit Details</span>
            </button>
          )}
        </div>
      </div>

      {/* Label Print Modal */}
      <LabelPrintModal
        coinsToPrint={[liveCoin]}
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
      />
    </div>
  );
};
