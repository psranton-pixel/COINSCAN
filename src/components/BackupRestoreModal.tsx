import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useCollection } from '../context/CollectionContext';
import { useAuth } from '../context/AuthContext';
import { validateBackupFile } from '../services/backupService';
import type { BackupValidationResult } from '../types/coin';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { coins, exportCollection, restoreBackup, backupStatus } = useCollection();

  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');
  const [includeSamplesInExport, setIncludeSamplesInExport] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [mergeChoice, setMergeChoice] = useState<'update_and_add' | 'add_only' | 'replace_all'>('update_and_add');
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const formattedLastBackup = backupStatus.lastBackupAt
    ? new Date(backupStatus.lastBackupAt).toLocaleString()
    : 'No full JSON backup created yet on this device';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setRestoreSummary(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileContent(text);
      try {
        const result = validateBackupFile(text, coins, user?.uid || 'guest');
        setValidationResult(result);
        if (!result.valid && result.errors.length > 0) {
          setError(result.errors.join(' '));
        }
      } catch (err: any) {
        setError(`Failed to process backup file: ${err?.message || 'Invalid format'}`);
      }
    };
    reader.onerror = () => {
      setError('Could not read the selected file.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteRestore = async () => {
    if (!validationResult) return;
    setRestoring(true);
    setError(null);

    try {
      const summary = await restoreBackup(validationResult, mergeChoice);
      setRestoreSummary(summary);
      setValidationResult(null);
      setFileContent(null);
      setFileName(null);
    } catch (err: any) {
      console.error('Restore error:', err);
      setError(err?.message || 'Failed to restore backup.');
    } finally {
      setRestoring(false);
    }
  };

  const handleResetRestore = () => {
    setFileContent(null);
    setFileName(null);
    setValidationResult(null);
    setRestoreSummary(null);
    setError(null);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 font-serif-title">
                Backup & Restore Hub
              </h2>
              <span className="text-[11px] text-slate-400">
                Full JSON backups include photos &amp; provenance; CSV is a spreadsheet summary
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white bg-slate-800 border border-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setError(null);
            }}
            className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'export'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export Backup / CSV</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('restore');
              setError(null);
            }}
            className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'restore'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Restore / Import</span>
          </button>
        </div>

        {/* Modal Body (Single Scroll Area) */}
        <div className="p-4 sm:p-6 pb-safe overflow-y-auto space-y-5 flex-1">
          {/* Backup Status Bar */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Last Full JSON Backup</span>
              <strong className="text-slate-200">{formattedLastBackup}</strong>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold self-start sm:self-center ${
                backupStatus.hasChangesSinceBackup
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                  : backupStatus.lastBackupAt
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {backupStatus.hasChangesSinceBackup
                ? 'Modified since last backup'
                : backupStatus.lastBackupAt
                ? 'Up to date'
                : 'Backup recommended'}
            </span>
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="include-samples"
                  checked={includeSamplesInExport}
                  onChange={(e) => setIncludeSamplesInExport(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-400"
                />
                <label htmlFor="include-samples" className="text-slate-300 font-medium cursor-pointer">
                  Include sample / demo specimens in export (excluded by default)
                </label>
              </div>

              {/* JSON Format Card — Full Restorable Vault */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                    <FileJson className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100 text-sm">Complete Restorable Vault Backup (JSON v2)</h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Includes original &amp; cutout photos, immutable IDs &amp; SKUs, valuation provenance, currency conversion metadata, inventory costs, categories, and label settings.
                    </p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold">
                      Full Restorable Archive · Includes Original Photos
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => exportCollection('json', includeSamplesInExport)}
                  className="min-h-[44px] w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Full JSON</span>
                </button>
              </div>

              {/* CSV Format Card — Spreadsheet Export Only */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 mt-0.5 sm:mt-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100 text-sm">CSV Spreadsheet Export (Accounting Only)</h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Outputs tabular USD-normalized columns (<code className="text-slate-300 text-[11px]">SKU, Title, Country, Year, MintMark, Metal, WeightGrams, Fineness, GradeRange, CostBasis, MeltValue, MarketValue, PlatformFeePreset, NetProfit, StorageLocation, Status</code>) for Excel or tax prep.
                    </p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                      Spreadsheet Only · Does NOT include photos or full backup history
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => exportCollection('csv', includeSamplesInExport)}
                  className="min-h-[44px] w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs whitespace-nowrap transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'restore' && (
            <div className="space-y-4">
              {/* Success Result Banner */}
              {restoreSummary && (
                <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/60 text-emerald-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Backup Restored Successfully</span>
                  </div>
                  <p>
                    Added: <strong>{restoreSummary.added}</strong> new · Updated:{' '}
                    <strong>{restoreSummary.updated}</strong> existing · Skipped:{' '}
                    <strong>{restoreSummary.skipped}</strong> duplicate records.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetRestore}
                    className="mt-2 min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-semibold cursor-pointer"
                  >
                    Restore Another File
                  </button>
                </div>
              )}

              {/* Upload Dropzone */}
              {!validationResult && !restoreSummary && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 sm:p-10 border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-3xl bg-slate-950/60 text-center cursor-pointer space-y-3 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-200 text-sm block">
                        Select a CoinScan Pro JSON Backup (or CSV Spreadsheet)
                      </span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Preview records, photo counts, and duplicate handling before applying changes (.json, .csv)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="min-h-[42px] px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 inline-block"
                    >
                      Browse Backup File
                    </button>
                  </div>

                  {/* Account Isolation Notice */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-slate-400 text-xs flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Account Ownership Scope:</strong> Restored records are assigned to your active session ({user?.email || 'This Device'}) and validated before saving.
                    </p>
                  </div>
                </div>
              )}

              {/* Validation & Preview Screen */}
              {validationResult && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                      <span className="text-xs font-bold text-slate-200 truncate">
                        Preview: <span className="text-amber-400">{fileName}</span>
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono-num">
                        {validationResult.isCsv ? 'CSV Metadata Only' : `JSON Schema v${validationResult.version}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Records</span>
                        <strong className="text-slate-200 text-sm font-mono-num">
                          {validationResult.totalCoins}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/30">
                        <span className="text-[10px] text-sky-400 block">Photos Included</span>
                        <strong className="text-sky-300 text-sm font-mono-num">
                          {validationResult.photoCount}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-400 block">New To Add</span>
                        <strong className="text-emerald-300 text-sm font-mono-num">
                          {validationResult.recordsToAdd.length}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/30">
                        <span className="text-[10px] text-amber-400 block">Matching IDs</span>
                        <strong className="text-amber-300 text-sm font-mono-num">
                          {validationResult.recordsToUpdate.length}
                        </strong>
                      </div>
                    </div>

                    {validationResult.isCsv && (
                      <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] flex items-start gap-2">
                        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          You selected a CSV spreadsheet. CSV restores catalog fields only—original coin photos and valuation history are not present in CSV files. Use JSON v2 for full restorations.
                        </span>
                      </div>
                    )}

                    {validationResult.duplicateSkuCount > 0 && (
                      <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-[11px] flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          {validationResult.duplicateSkuCount} imported row(s) share a SKU with existing records or duplicate rows. Review the merge policy below before executing import.
                        </span>
                      </div>
                    )}

                    {validationResult.warnings && validationResult.warnings.length > 0 && !validationResult.isCsv && (
                      <div className="space-y-1 text-[11px] text-amber-300">
                        {validationResult.warnings.map((w, idx) => (
                          <div key={idx} className="flex items-start gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Merge Options */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                    <span className="font-bold text-slate-200 block">Duplicate &amp; Merge Handling:</span>
                    <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-xl hover:bg-slate-900">
                      <input
                        type="radio"
                        name="merge-policy"
                        checked={mergeChoice === 'update_and_add'}
                        onChange={() => setMergeChoice('update_and_add')}
                        className="mt-0.5 text-amber-500 focus:ring-amber-400"
                      />
                      <div>
                        <strong className="text-slate-200 block">Update existing &amp; add new records (Recommended)</strong>
                        <span className="text-slate-400 text-[11px]">
                          Inserts new coins and updates existing records matching stable IDs.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-xl hover:bg-slate-900">
                      <input
                        type="radio"
                        name="merge-policy"
                        checked={mergeChoice === 'add_only'}
                        onChange={() => setMergeChoice('add_only')}
                        className="mt-0.5 text-amber-500 focus:ring-amber-400"
                      />
                      <div>
                        <strong className="text-slate-200 block">Add new records only (Skip duplicate IDs)</strong>
                        <span className="text-slate-400 text-[11px]">
                          Keeps existing records untouched and skips matching IDs from the file.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-xl hover:bg-slate-900">
                      <input
                        type="radio"
                        name="merge-policy"
                        checked={mergeChoice === 'replace_all'}
                        onChange={() => setMergeChoice('replace_all')}
                        className="mt-0.5 text-rose-500 focus:ring-rose-400"
                      />
                      <div>
                        <strong className="text-rose-300 block">Replace entire collection with backup</strong>
                        <span className="text-slate-400 text-[11px]">
                          Caution: Clears current records and imports the backup file as the vault contents.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleResetRestore}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={restoring}
                      onClick={handleExecuteRestore}
                      className="min-h-[42px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50"
                    >
                      {restoring ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Restoring...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          <span>Execute Import ({validationResult.totalCoins} records)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
