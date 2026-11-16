import React, { useState, useMemo } from 'react';
import {
  Coins,
  Search,
  Plus,
  Star,
  LayoutGrid,
  List,
  Download,
  FolderPlus,
  RotateCcw,
  Edit3,
  FileSpreadsheet,
  Check,
  Camera,
  UploadCloud,
  Sparkles,
  Trash2,
  Barcode,
  Printer,
  CheckSquare,
  FolderInput,
  Tag,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { CoinCard } from '../components/CoinCard';
import { BackupRestoreModal } from '../components/BackupRestoreModal';
import { GuestMigrationBanner } from '../components/GuestMigrationBanner';
import { SkuLabelSettingsModal } from '../components/SkuLabelSettingsModal';
import { LabelPrintModal } from '../components/LabelPrintModal';
import { BatchSkuModal } from '../components/BatchSkuModal';
import { BarcodeScannerBar } from '../components/BarcodeScannerBar';
import { exportLabelsCsv } from '../services/labelService';
import { normalizeRarity } from '../utils/formatters';
import { formatCoinValue, USD_FX_RATES } from '../utils/currency';
import { getCoinEstimatedValueUSD } from '../utils/inventoryCalculations';
import { VALID_RARITIES } from '../types/coin';
import type { CoinRecord, CoinStatus, ListingStatus } from '../types/coin';

interface CollectionViewProps {
  onScanClick: () => void;
  onOpenCoin: (coin: CoinRecord) => void;
  onEditCoin: (coin: CoinRecord) => void;
  onAddManualCoin: () => void;
  onOpenAuth?: () => void;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  onScanClick,
  onOpenCoin,
  onEditCoin,
  onAddManualCoin,
  onOpenAuth,
}) => {
  const { currency } = useAuth();
  const {
    coins,
    categories,
    loading,
    addCategory,
    includeSampleCoins,
    setIncludeSampleCoins,
    removeSampleCoins,
    bulkUpdateCoins,
    bulkDeleteCoins,
  } = useCollection();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<
    'value_desc' | 'value_asc' | 'year_desc' | 'year_asc' | 'title' | 'date_desc'
  >('date_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [backupRestoreModalOpen, setBackupRestoreModalOpen] = useState(false);
  const [skuSettingsModalOpen, setSkuSettingsModalOpen] = useState(false);
  const [labelPrintModalOpen, setLabelPrintModalOpen] = useState(false);
  const [batchSkuModalOpen, setBatchSkuModalOpen] = useState(false);
  const [selectedCoinIds, setSelectedCoinIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [coinsForLabels, setCoinsForLabels] = useState<CoinRecord[]>([]);

  // Bulk Action Modals & Menus State
  const [bulkStatusMenuOpen, setBulkStatusMenuOpen] = useState(false);
  const [bulkMoveModalOpen, setBulkMoveModalOpen] = useState(false);
  const [bulkStorageTarget, setBulkStorageTarget] = useState('');
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkToast, setBulkToast] = useState<string | null>(null);

  const triggerBulkToast = (msg: string) => {
    setBulkToast(msg);
    setTimeout(() => {
      setBulkToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const existingStorageLocations = useMemo(() => {
    const locs = new Set<string>(['Vault / Album', 'Safe Box 1', 'Display Case']);
    coins.forEach((c) => {
      if (c.storageLocation && c.storageLocation.trim()) {
        locs.add(c.storageLocation.trim());
      }
    });
    return Array.from(locs);
  }, [coins]);

  const handleBulkStatusChange = async (target: 'vault' | 'listed' | 'sold') => {
    const ids = Array.from(selectedCoinIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkStatusMenuOpen(false);
    try {
      const statusMap: Record<'vault' | 'listed' | 'sold', { status: CoinStatus; listingStatus: ListingStatus; label: string }> = {
        vault: { status: 'in_collection', listingStatus: 'unlisted', label: 'Vault (In Collection)' },
        listed: { status: 'listed', listingStatus: 'listed', label: 'Listed' },
        sold: { status: 'sold', listingStatus: 'sold', label: 'Sold' },
      };
      const chosen = statusMap[target];
      await bulkUpdateCoins(ids, {
        status: chosen.status,
        listingStatus: chosen.listingStatus,
      });
      triggerBulkToast(`Updated status to "${chosen.label}" for ${ids.length} specimen${ids.length === 1 ? '' : 's'}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkMoveStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = Array.from(selectedCoinIds);
    const trimmed = bulkStorageTarget.trim();
    if (ids.length === 0 || !trimmed) return;
    setBulkBusy(true);
    try {
      await bulkUpdateCoins(ids, { storageLocation: trimmed });
      setBulkMoveModalOpen(false);
      setBulkStorageTarget('');
      triggerBulkToast(`Moved ${ids.length} specimen${ids.length === 1 ? '' : 's'} to "${trimmed}".`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedCoinIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await bulkDeleteCoins(ids);
      setBulkDeleteConfirmOpen(false);
      clearSelection();
      triggerBulkToast(`Deleted ${ids.length} specimen${ids.length === 1 ? '' : 's'} from collection.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelectCoin = (id: string) => {
    setSelectedCoinIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedCoinIds(new Set(filteredCoins.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedCoinIds(new Set());
    setIsSelectionMode(false);
  };

  const sampleCount = coins.filter((c) => Boolean(c.isSample)).length;

  const countries = useMemo(() => {
    const set = new Set<string>();
    coins.forEach((c) => {
      if (c.country) set.add(c.country);
    });
    return Array.from(set).sort();
  }, [coins]);

  const filteredCoins = useMemo(() => {
    return coins
      .filter((c) => {
        // Sample isolation filter: if not including samples, hide samples
        if (!includeSampleCoins && c.isSample) {
          return false;
        }

        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchTitle = (c.title || '').toLowerCase().includes(term);
          const matchCountry = (c.country || '').toLowerCase().includes(term);
          const matchSeries = (c.series || '').toLowerCase().includes(term);
          const matchNotes = (c.personalNotes || '').toLowerCase().includes(term);
          const matchSku = (c.sku || '').toLowerCase().includes(term);
          const matchStorage = (c.storageLocation || '').toLowerCase().includes(term);
          const matchYear = String(c.year || '').includes(term);
          if (
            !matchTitle &&
            !matchCountry &&
            !matchSeries &&
            !matchNotes &&
            !matchSku &&
            !matchStorage &&
            !matchYear
          ) {
            return false;
          }
        }

        if (selectedCategory !== 'all' && c.category !== selectedCategory) {
          return false;
        }

        if (selectedCountry !== 'all' && c.country !== selectedCountry) {
          return false;
        }

        if (selectedRarity !== 'all') {
          const coinRarity = normalizeRarity(c.rarity);
          if (coinRarity !== selectedRarity) return false;
        }

        if (favoritesOnly && !c.isFavorite) {
          return false;
        }

        if (statusFilter !== 'all') {
          const coinStatus = c.status || 'in_collection';
          if (coinStatus !== statusFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'value_desc') return getCoinEstimatedValueUSD(b) - getCoinEstimatedValueUSD(a);
        if (sortBy === 'value_asc') return getCoinEstimatedValueUSD(a) - getCoinEstimatedValueUSD(b);
        if (sortBy === 'year_desc') return (b.year || 0) - (a.year || 0);
        if (sortBy === 'year_asc') return (a.year || 0) - (b.year || 0);
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [
    coins,
    includeSampleCoins,
    searchTerm,
    selectedCategory,
    selectedCountry,
    selectedRarity,
    favoritesOnly,
    statusFilter,
    sortBy,
  ]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim());
    setSelectedCategory(newCatName.trim());
    setNewCatName('');
    setNewCategoryModalOpen(false);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedCountry('all');
    setSelectedRarity('all');
    setFavoritesOnly(false);
    setStatusFilter('all');
    setSortBy('date_desc');
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Guest Storage & Cloud Migration Banner */}
      <GuestMigrationBanner onOpenAuth={onOpenAuth} />

      {/* Explicit Demo Data Isolation Banner */}
      {sampleCount > 0 && (
        <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 font-bold uppercase text-[10px]">
              DEMO DATA
            </span>
            <span className="text-slate-200">
              {sampleCount} example coin{sampleCount === 1 ? '' : 's'} loaded (excluded from real totals unless imported to your collection).
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="min-h-[34px] flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={includeSampleCoins}
                onChange={(e) => setIncludeSampleCoins(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-400"
              />
              <span>Show demo coins</span>
            </label>
            <button
              type="button"
              onClick={removeSampleCoins}
              className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-rose-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Exit Demo Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Header & Collection Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-xl sm:text-3xl font-bold font-serif-title text-slate-100">
              My Coin Collection
            </h1>
            <span className="text-xs sm:text-sm font-mono-num text-amber-400 font-semibold">
              {filteredCoins.length} specimen{filteredCoins.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Tap any coin to inspect transparent valuations, edit records, or export collector slabs.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSkuSettingsModalOpen(true)}
            className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors cursor-pointer"
            title="Configure SKU rules and label printer templates"
          >
            <Barcode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>SKU & Labels</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isSelectionMode) {
                clearSelection();
              } else {
                setIsSelectionMode(true);
              }
            }}
            className={`min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              isSelectionMode || selectedCoinIds.size > 0
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            <span>{selectedCoinIds.size > 0 ? `Selected (${selectedCoinIds.size})` : 'Select Mode'}</span>
          </button>

          <button
            type="button"
            onClick={() => setBackupRestoreModalOpen(true)}
            className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-xs font-semibold text-amber-300 whitespace-nowrap transition-colors cursor-pointer"
            title="Restore backup or export collection"
          >
            <UploadCloud className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Backup & Restore</span>
          </button>

          <button
            type="button"
            onClick={onAddManualCoin}
            className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Add Coin</span>
          </button>

          <button
            type="button"
            onClick={onScanClick}
            className="min-h-[42px] flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 whitespace-nowrap transition-all cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span>Scan Coin</span>
          </button>
        </div>
      </div>

      {/* Bulk Operation Confirmation Toast */}
      {bulkToast && (
        <div className="p-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{bulkToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkToast(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold px-1.5 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Floating Bulk Action Bar for Selected Coins / Select Mode */}
      {(isSelectionMode || selectedCoinIds.size > 0) && (
        <div className="sticky top-16 z-30 p-3 sm:p-4 bg-slate-900/95 border border-amber-500/50 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-200">
            <span className="font-bold text-amber-400 font-mono-num text-sm">
              {selectedCoinIds.size}
            </span>
            <span>specimen{selectedCoinIds.size === 1 ? '' : 's'} selected</span>
            <span className="text-slate-600">·</span>
            <button
              type="button"
              onClick={selectAllFiltered}
              className="text-amber-400 hover:underline cursor-pointer font-semibold"
            >
              Select All ({filteredCoins.length})
            </button>
            {selectedCoinIds.size > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedCoinIds(new Set())}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Deselect All
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Change Status (Vault / Listed / Sold) */}
            <div className="relative">
              <button
                type="button"
                disabled={selectedCoinIds.size === 0 || bulkBusy}
                onClick={() => setBulkStatusMenuOpen((prev) => !prev)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Change Status</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {bulkStatusMenuOpen && selectedCoinIds.size > 0 && (
                <div className="absolute left-0 sm:right-0 top-10 z-40 w-48 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl py-1.5 text-xs text-slate-200">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    Set Status ({selectedCoinIds.size})
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusChange('vault')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer"
                  >
                    <span>Vault (In Collection)</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusChange('listed')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center justify-between text-amber-300 cursor-pointer"
                  >
                    <span>Listed</span>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusChange('sold')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center justify-between text-sky-300 cursor-pointer"
                  >
                    <span>Sold</span>
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                  </button>
                </div>
              )}
            </div>

            {/* Move Storage Location */}
            <button
              type="button"
              disabled={selectedCoinIds.size === 0 || bulkBusy}
              onClick={() => {
                setBulkStatusMenuOpen(false);
                setBulkMoveModalOpen(true);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45"
            >
              <FolderInput className="w-3.5 h-3.5 text-sky-400" />
              <span>Move Storage Location</span>
            </button>

            {/* Bulk Delete */}
            <button
              type="button"
              disabled={selectedCoinIds.size === 0 || bulkBusy}
              onClick={() => {
                setBulkStatusMenuOpen(false);
                setBulkDeleteConfirmOpen(true);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-800/70 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Bulk Delete ({selectedCoinIds.size})</span>
            </button>

            <button
              type="button"
              disabled={selectedCoinIds.size === 0}
              onClick={() => {
                const selectedList = coins.filter((c) => selectedCoinIds.has(c.id));
                setCoinsForLabels(selectedList);
                setLabelPrintModalOpen(true);
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all disabled:opacity-45"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Labels ({selectedCoinIds.size})</span>
            </button>

            <button
              type="button"
              disabled={selectedCoinIds.size === 0}
              onClick={() => setBatchSkuModalOpen(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45"
            >
              <Barcode className="w-3.5 h-3.5 text-amber-400" />
              <span>Generate SKUs</span>
            </button>

            <button
              type="button"
              disabled={selectedCoinIds.size === 0}
              onClick={() => {
                const selectedList = coins.filter((c) => selectedCoinIds.has(c.id));
                exportLabelsCsv(selectedList, currency);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={clearSelection}
              className="min-h-[36px] px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 cursor-pointer font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/70 p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
        {/* Hardware Barcode Scanner & SKU Direct Lookup Bar */}
        <BarcodeScannerBar onOpenCoin={onOpenCoin} />

        <div className="flex flex-col md:flex-row items-center gap-2.5">
          {/* Keyword Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="search"
              placeholder="Search title, country, series, year, SKU, storage location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Horizontal Touch-Scrollable Filter Selectors */}
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-0.5 md:pb-0">
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-300 shrink-0 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Countries</option>
              {countries.map((ctry) => (
                <option key={ctry} value={ctry}>
                  {ctry}
                </option>
              ))}
            </select>

            {/* Standard Shared Rarity Tiers */}
            <select
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-300 shrink-0 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Rarities</option>
              {VALID_RARITIES.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>

            {/* Collection Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-300 shrink-0 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="in_collection">In Collection</option>
              <option value="listed">Listed for Resale</option>
              <option value="sold">Sold</option>
              <option value="wishlist">Wishlist</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="min-h-[40px] px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-300 font-medium shrink-0 focus:outline-none focus:border-amber-500"
            >
              <option value="date_desc">Newest</option>
              <option value="value_desc">Highest Value</option>
              <option value="value_asc">Lowest Value</option>
              <option value="year_desc">Year (New-Old)</option>
              <option value="year_asc">Year (Old-New)</option>
              <option value="title">Title (A-Z)</option>
            </select>

            <button
              type="button"
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              aria-label={favoritesOnly ? 'Showing favorites only' : 'Filter by favorites'}
              className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border shrink-0 transition-colors ${
                favoritesOnly
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              <Star className={`w-4 h-4 ${favoritesOnly ? 'fill-amber-400' : ''}`} />
            </button>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg ${
                  viewMode === 'grid' ? 'bg-slate-800 text-amber-400' : 'text-slate-500'
                }`}
                aria-label="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg ${
                  viewMode === 'list' ? 'bg-slate-800 text-amber-400' : 'text-slate-500'
                }`}
                aria-label="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Categories Carousel Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap shrink-0 transition-colors ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap shrink-0 transition-colors ${
                selectedCategory === cat.name
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNewCategoryModalOpen(true)}
            className="min-h-[36px] flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-950 text-amber-400 hover:bg-slate-800 border border-dashed border-amber-500/40 text-xs whitespace-nowrap shrink-0 font-medium"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Category</span>
          </button>
        </div>
      </div>

      {/* Coins Results */}
      {loading && coins.length === 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>Synchronizing private coin collection...</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse space-y-3">
                <div className="w-full aspect-square rounded-xl bg-slate-800/50" />
                <div className="h-4 bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-800/70 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredCoins.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {filteredCoins.map((coin) => (
              <CoinCard
                key={coin.id}
                coin={coin}
                onClick={() => onOpenCoin(coin)}
                onEdit={onEditCoin}
                selected={selectedCoinIds.has(coin.id)}
                showSelectCheckbox={isSelectionMode || selectedCoinIds.size > 0}
                onToggleSelect={() => toggleSelectCoin(coin.id)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden divide-y divide-slate-800/80">
            {filteredCoins.map((coin) => (
              <div
                key={coin.id}
                onClick={() => onOpenCoin(coin)}
                className={`flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-800/50 cursor-pointer transition-colors gap-3 ${
                  selectedCoinIds.has(coin.id) ? 'bg-amber-500/10' : ''
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  {(isSelectionMode || selectedCoinIds.size > 0) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectCoin(coin.id);
                      }}
                      className="p-1 text-slate-400 hover:text-amber-400 shrink-0 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCoinIds.has(coin.id)}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-400 cursor-pointer"
                      />
                    </button>
                  )}
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl bg-slate-900 overflow-hidden border border-slate-700 flex items-center justify-center p-1 shrink-0">
                    <img
                      src={coin.obverseImage}
                      alt={coin.title}
                      className="max-h-full max-w-full object-contain filter drop-shadow-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-serif-title font-bold text-slate-100 text-xs sm:text-sm hover:text-amber-300 truncate">
                        {coin.title}
                      </h3>
                      {coin.isSample && (
                        <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold uppercase shrink-0">
                          Sample data
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-400 mt-0.5">
                      <span>{coin.country}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num">{coin.year || 'Undated'}</span>
                      {coin.estimatedGrade && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num text-amber-300">
                            {String(coin.estimatedGrade).split(' ')[0]}
                          </span>
                        </>
                      )}
                      {coin.sku && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[10px] text-amber-400/90 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
                            SKU: {coin.sku}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Est. Value</span>
                    <span className="text-sm sm:text-base font-bold text-amber-400 font-mono-num">
                      {formatCoinValue(getCoinEstimatedValueUSD(coin), currency, USD_FX_RATES, true)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditCoin(coin);
                    }}
                    aria-label="Edit coin"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : coins.length === 0 ? (
        <div className="p-10 sm:p-14 text-center bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
            <Coins className="w-7 h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-bold font-serif-title text-slate-200">
            Your Coin Collection is Empty
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Start cataloging your coins by scanning with your camera or adding details manually.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onScanClick}
              className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Scan First Coin</span>
            </button>
            <button
              type="button"
              onClick={onAddManualCoin}
              className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Add Manually</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-10 sm:p-12 text-center bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 space-y-3">
          <Coins className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No coins match your filters</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Try adjusting your search keywords, country selection, or clearing active filters.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 mx-auto cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear Filters</span>
          </button>
        </div>
      )}

      {/* Backup and Restoration Modal */}
      <BackupRestoreModal
        isOpen={backupRestoreModalOpen}
        onClose={() => setBackupRestoreModalOpen(false)}
      />

      {/* SKU & Label Settings Modal */}
      <SkuLabelSettingsModal
        isOpen={skuSettingsModalOpen}
        onClose={() => setSkuSettingsModalOpen(false)}
        sampleCoin={filteredCoins[0] || coins[0]}
      />

      {/* Label Printing Modal */}
      <LabelPrintModal
        isOpen={labelPrintModalOpen}
        onClose={() => {
          setLabelPrintModalOpen(false);
          setCoinsForLabels([]);
        }}
        coinsToPrint={coinsForLabels}
        onOpenSettings={() => setSkuSettingsModalOpen(true)}
      />

      {/* Batch SKU Generation Modal */}
      <BatchSkuModal
        isOpen={batchSkuModalOpen}
        onClose={() => {
          setBatchSkuModalOpen(false);
          clearSelection();
        }}
        selectedCoins={coins.filter((c) => selectedCoinIds.has(c.id))}
        onOpenLabelPrint={(coinsToPrint) => {
          setCoinsForLabels(coinsToPrint);
          setLabelPrintModalOpen(true);
        }}
      />

      {/* Create Category Modal */}
      {newCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-6 pb-safe shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 font-serif-title">Create Custom Category</h3>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <input
                type="text"
                required
                placeholder="e.g. Morgan Dollars, Ancient Rome, Bullion"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewCategoryModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Move Storage Location Modal */}
      {bulkMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-6 pb-safe shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <FolderInput className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 font-serif-title">
                  Move Storage Location
                </h3>
                <span className="text-xs text-slate-400">
                  Assign a storage location to {selectedCoinIds.size} selected specimen{selectedCoinIds.size === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <form onSubmit={handleBulkMoveStorage} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Quick Select Existing Location
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {existingStorageLocations.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setBulkStorageTarget(loc)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        bulkStorageTarget === loc
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Storage Location Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Safe Box 2, Tray B, Album 1 Page 3"
                  value={bulkStorageTarget}
                  onChange={(e) => setBulkStorageTarget(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBulkMoveModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkBusy || !bulkStorageTarget.trim()}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {bulkBusy ? 'Moving...' : `Move ${selectedCoinIds.size} Specimen${selectedCoinIds.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-rose-800/80 rounded-t-3xl sm:rounded-2xl p-6 pb-safe shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-rose-400 font-serif-title flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Bulk Delete</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">{selectedCoinIds.size} selected specimen{selectedCoinIds.size === 1 ? '' : 's'}</strong>{' '}
              from your collection? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkDeleteConfirmOpen(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={handleBulkDeleteConfirm}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {bulkBusy ? 'Deleting...' : `Delete ${selectedCoinIds.size} Specimen${selectedCoinIds.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
