import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Trash2,
  LogOut,
  Globe,
  AlertTriangle,
  CheckCircle2,
  User,
  UploadCloud,
  FileSpreadsheet,
  FileJson,
  Barcode,
  Percent,
  HardDrive,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { FIRESTORE_QUOTA_CONSOLE_URL } from '../services/firebase';
import { BackupRestoreModal } from '../components/BackupRestoreModal';
import { SkuLabelSettingsModal } from '../components/SkuLabelSettingsModal';
import { PLATFORM_FEE_PRESET_LABELS } from '../utils/inventoryCalculations';
import { FX_RATE_SOURCE, FX_RATE_TIMESTAMP } from '../utils/currency';
import { getAdvancedStorageStats } from '../services/storageService';
import type { CurrencyCode, PlatformFeePresetId } from '../types/coin';

interface SettingsViewProps {
  onOpenAuth: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenAuth }) => {
  const { user, logout, deleteAccount, currency, setCurrency } = useAuth();
  const {
    coins,
    includeSampleCoins,
    exportCollection,
    resaleFeeSettings,
    updateResaleFeeSettings,
    backupStatus,
    cloudSyncStatus,
    cloudSyncError,
    isQuotaExceeded,
    retryCloudSync,
  } = useCollection();

  const [retryingCloudSync, setRetryingCloudSync] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupRestoreModalOpen, setBackupRestoreModalOpen] = useState(false);
  const [skuSettingsModalOpen, setSkuSettingsModalOpen] = useState(false);
  const [showAdvancedStorage, setShowAdvancedStorage] = useState(false);
  const [storageStats, setStorageStats] = useState<{
    indexedDbSupported: boolean;
    formattedIndexedDb: string;
    localStoragePercent: number;
    formattedLocalStorage: string;
    recordCount: number;
    photoCount: number;
  } | null>(null);
  const [loadingStorageStats, setLoadingStorageStats] = useState(false);

  const storageScopeKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';

  const loadStorageStats = async () => {
    setLoadingStorageStats(true);
    try {
      const stats = await getAdvancedStorageStats(storageScopeKey);
      setStorageStats(stats);
    } finally {
      setLoadingStorageStats(false);
    }
  };

  useEffect(() => {
    if (showAdvancedStorage) {
      loadStorageStats();
    }
  }, [showAdvancedStorage, coins.length, storageScopeKey]);

  const currencies: { code: CurrencyCode; label: string; symbol: string }[] = [
    { code: 'USD', label: 'US Dollar', symbol: '$' },
    { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
    { code: 'GBP', label: 'British Pound', symbol: '£' },
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  ];

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') {
      setError('Please type DELETE to confirm account removal');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete account. You may need to re-authenticate first.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4 sm:pb-5">
        <h1 className="text-xl sm:text-3xl font-bold font-serif-title text-slate-100">
          Account & Collection Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Manage currency preferences, resale fee presets, complete backups and restoration, and device storage.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Account Info Card */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-lg shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-200 truncate">
                {user ? user.displayName || 'Coin Collector' : 'Device-Only Guest Session'}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {user
                  ? user.email
                  : 'Coins saved locally on this device. Sign in to sync catalog records to your account.'}
              </p>
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => logout()}
              className="min-h-[44px] w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md cursor-pointer"
            >
              Sign In / Register
            </button>
          )}
        </div>

        {/* Cloud Sync Status & Manual Sync Controls when Signed In */}
        {user && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-200">
                <span>Cloud Backup Sync</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    cloudSyncStatus === 'synced'
                      ? 'text-emerald-400'
                      : cloudSyncStatus === 'reconnecting' || cloudSyncStatus === 'connecting'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }
                >
                  {cloudSyncStatus === 'synced'
                    ? 'Connected & Synced'
                    : cloudSyncStatus === 'connecting'
                    ? 'Connecting...'
                    : cloudSyncStatus === 'reconnecting'
                    ? 'Reconnecting (Local Vault Active)'
                    : 'Paused (Local Vault Active)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {cloudSyncError ||
                  'Your full-resolution collection is stored on this device and synced with your private Firestore account.'}
              </p>
              {isQuotaExceeded && (
                <a
                  href={FIRESTORE_QUOTA_CONSOLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 underline font-semibold pt-0.5"
                >
                  <span>Open Firebase Console (Quota &amp; Billing)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <button
              type="button"
              disabled={retryingCloudSync}
              onClick={async () => {
                setRetryingCloudSync(true);
                try {
                  await retryCloudSync();
                } finally {
                  setRetryingCloudSync(false);
                }
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${retryingCloudSync ? 'animate-spin' : ''}`} />
              <span>{retryingCloudSync ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        )}

        {/* Accurate Sync & Privacy Behavior Explanation */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-start gap-3 text-xs">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-200">How Sign-In &amp; Device Storage Work</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Your full-resolution photos and records are always saved first to this device’s local IndexedDB vault so your collection works offline and never pauses on mobile networks. When signed in, compact previews sync to your private Firestore account—export a Full JSON Backup anytime for a portable file with original-resolution photos.
            </p>
          </div>
        </div>
      </div>

      {/* Currency Preference */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Valuation & Display Currency</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select your preferred display currency. Stored purchase prices, asking prices, and sale proceeds keep their entered transaction currency and are converted on display using the {FX_RATE_SOURCE} ({FX_RATE_TIMESTAMP}).
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3 pt-1">
          {currencies.map((c) => (
            <button
              type="button"
              key={c.code}
              onClick={() => setCurrency(c.code)}
              className={`min-h-[64px] p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                currency === c.code
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <span className="block text-base sm:text-lg font-bold font-mono-num">{c.symbol}</span>
              <span className="block text-xs font-semibold mt-0.5">{c.code}</span>
              <span className="block text-[10px] text-slate-500 truncate">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Resale Platform Fee Presets */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2">
            <Percent className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Resale Platform Fee Presets</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure your default selling fee preset and rates used to calculate Unrealized and Realized Net Profit across your collection and CSV exports. Individual coins can override this preset in the Coin Detail "Resale" tab.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {(['private_0', 'ebay_au_13_5', 'custom'] as PlatformFeePresetId[]).map((presetId) => {
            const isSelected = resaleFeeSettings.defaultPreset === presetId;
            return (
              <button
                key={presetId}
                type="button"
                onClick={() => updateResaleFeeSettings({ defaultPreset: presetId })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{PLATFORM_FEE_PRESET_LABELS[presetId]}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                </div>
                <span className="text-[11px] text-slate-400">
                  {presetId === 'private_0'
                    ? '0% platform commission · Direct cash or local marketplace sale'
                    : presetId === 'ebay_au_13_5'
                    ? `${resaleFeeSettings.ebayAuPercent}% final value fee + $${resaleFeeSettings.ebayAuFixedPostage} USD fixed postage`
                    : `${resaleFeeSettings.customPercent}% commission + $${resaleFeeSettings.customFixedPostage} USD fixed postage`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Configurable Preset Rates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <span className="text-xs font-bold text-slate-200 block">
              eBay Australia (~13.5%) Preset Configuration
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Commission (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={resaleFeeSettings.ebayAuPercent}
                  onChange={(e) =>
                    updateResaleFeeSettings({
                      ebayAuPercent: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Default Postage (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={resaleFeeSettings.ebayAuFixedPostage}
                  onChange={(e) =>
                    updateResaleFeeSettings({
                      ebayAuFixedPostage: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <span className="text-xs font-bold text-slate-200 block">
              Custom % + Fixed Postage Defaults
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Custom Fee (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={resaleFeeSettings.customPercent}
                  onChange={(e) =>
                    updateResaleFeeSettings({
                      customPercent: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Fixed Postage (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={resaleFeeSettings.customFixedPostage}
                  onChange={(e) =>
                    updateResaleFeeSettings({
                      customFixedPostage: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SKU & Label Printing Settings */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2">
              <Barcode className="w-4 h-4 text-amber-400 shrink-0" />
              <span>SKU & Label Printing System</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure inventory numbering rules (Sequential, Descriptive, Storage-based), compact barcode ID linking, and exact physical label templates (A4 label sheets, custom sheet sizes, or single-label thermal rolls).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSkuSettingsModalOpen(true)}
            className="min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors shadow-md cursor-pointer shrink-0"
          >
            <Barcode className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Configure SKU & Labels</span>
          </button>
        </div>
      </div>

      {/* Complete Backup & Restoration Card */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Backup & Restore Hub</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Download a full restorable JSON v2 vault archive (includes original photos &amp; provenance), export a 16-column CSV accounting spreadsheet, or restore from file.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400">
                Last full backup:{' '}
                <strong className="text-slate-200">
                  {backupStatus.lastBackupAt
                    ? new Date(backupStatus.lastBackupAt).toLocaleString()
                    : 'Not yet backed up'}
                </strong>
              </span>
              <span
                className={`px-2 py-0.5 rounded font-semibold ${
                  backupStatus.hasChangesSinceBackup
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                    : backupStatus.lastBackupAt
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {backupStatus.hasChangesSinceBackup
                  ? 'Changes since last backup'
                  : backupStatus.lastBackupAt
                  ? 'Up to date'
                  : 'Backup recommended'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => exportCollection('json', includeSampleCoins)}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors shadow-md cursor-pointer"
            >
              <FileJson className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Full JSON Backup</span>
            </button>
            <button
              type="button"
              onClick={() => exportCollection('csv', includeSampleCoins)}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors shadow-md cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setBackupRestoreModalOpen(true)}
              className="min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors shadow-md cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 text-slate-950 shrink-0" />
              <span>Open Backup &amp; Restore Hub</span>
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Storage Diagnostics Panel */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedStorage((prev) => !prev)}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="text-sm font-bold text-slate-200 block">Advanced Storage Details</span>
              <span className="text-xs text-slate-400">
                Inspect browser IndexedDB photo vault and LocalStorage thumbnail cache metrics
              </span>
            </div>
          </div>
          {showAdvancedStorage ? (
            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          )}
        </button>

        {showAdvancedStorage && (
          <div className="px-4 sm:px-6 pb-5 pt-2 border-t border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">
                Active Device Store Key: <code className="text-slate-200">{storageScopeKey}</code>
              </span>
              <button
                type="button"
                onClick={loadStorageStats}
                disabled={loadingStorageStats}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStorageStats ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {storageStats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">IndexedDB Full Vault</span>
                  <strong className="text-slate-100 font-mono-num text-sm">
                    {storageStats.indexedDbSupported ? storageStats.formattedIndexedDb : 'Unavailable'}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">LocalStorage Cache</span>
                  <strong className="text-slate-100 font-mono-num text-sm">
                    {storageStats.formattedLocalStorage} ({storageStats.localStoragePercent}%)
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Stored Records</span>
                  <strong className="text-amber-400 font-mono-num text-sm">
                    {storageStats.recordCount}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Photo Assets</span>
                  <strong className="text-sky-400 font-mono-num text-sm">
                    {storageStats.photoCount}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 py-2">Measuring storage utilization...</div>
            )}
          </div>
        )}
      </div>

      {/* Account Deletion */}
      {user && (
        <div className="p-4 sm:p-6 rounded-3xl bg-rose-950/20 border border-rose-900/40 shadow-xl space-y-3">
          <h3 className="text-sm sm:text-base font-bold text-rose-400 flex items-center gap-2">
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Danger Zone: Account Deletion</span>
          </h3>
          <p className="text-xs text-slate-400">
            Permanently delete your CoinScan Pro collector account and purge all coins, photographs, and records from the database. This action is irreversible.
          </p>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            className="min-h-[42px] w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-900/40 hover:bg-rose-900/70 border border-rose-800 text-rose-300 font-semibold text-xs transition-colors cursor-pointer"
          >
            Delete Account & Purge Data
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-rose-800/80 rounded-t-3xl sm:rounded-2xl p-6 pb-safe shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-rose-400 font-serif-title flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Account Deletion</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently delete your authentication account and all{' '}
              <strong className="text-white">{coins.length} coin records</strong>. Type{' '}
              <strong className="text-rose-400">DELETE</strong> below to confirm.
            </p>
            <input
              type="text"
              placeholder="DELETE"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 border border-rose-800/80 rounded-xl text-sm text-slate-100 font-mono focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup & Restore Hub Modal */}
      <BackupRestoreModal
        isOpen={backupRestoreModalOpen}
        onClose={() => setBackupRestoreModalOpen(false)}
      />

      {/* SKU & Label Settings Modal */}
      <SkuLabelSettingsModal
        isOpen={skuSettingsModalOpen}
        onClose={() => setSkuSettingsModalOpen(false)}
        sampleCoin={coins[0]}
      />
    </div>
  );
};
