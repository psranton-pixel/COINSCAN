import React, { useState, useMemo } from 'react';
import {
  X,
  Barcode,
  Check,
  AlertTriangle,
  Info,
  Layers,
  Printer,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { CoinRecord } from '../types/coin';
import { useCollection } from '../context/CollectionContext';
import { formatSku, getNextAvailableSequence } from '../services/skuService';

interface BatchSkuModalProps {
  selectedCoins: CoinRecord[];
  isOpen: boolean;
  onClose: () => void;
  onOpenLabelPrint?: (coins: CoinRecord[]) => void;
}

export const BatchSkuModal: React.FC<BatchSkuModalProps> = ({
  selectedCoins,
  isOpen,
  onClose,
  onOpenLabelPrint,
}) => {
  const { coins, skuSettings, batchApplySkus } = useCollection();

  const [mode, setMode] = useState<'fill_missing' | 'overwrite_all'>('fill_missing');
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [batchStorage, setBatchStorage] = useState<string>('');
  const [applyBatchStorage, setApplyBatchStorage] = useState(false);

  // Per-coin custom storage overrides
  const [storageOverrides, setStorageOverrides] = useState<Record<string, string>>({});

  const [isApplying, setIsApplying] = useState(false);
  const [resultSummary, setResultSummary] = useState<{
    applied: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // Compute proposed allocations without consuming atomic sequence numbers yet
  const allocations = useMemo(() => {
    let seq = getNextAvailableSequence(coins, skuSettings);

    return selectedCoins.map((coin) => {
      const hasExistingSku = Boolean(coin.sku && coin.sku.trim());
      const shouldGenerate = mode === 'overwrite_all' || !hasExistingSku;

      let proposed = coin.sku || '';
      if (shouldGenerate) {
        proposed = formatSku(coin, seq, skuSettings);
        seq++;
      }

      const storage = applyBatchStorage
        ? batchStorage
        : storageOverrides[coin.id] !== undefined
        ? storageOverrides[coin.id]
        : coin.storageLocation || skuSettings.defaultStorageLocation || 'Vault 1';

      return {
        coin,
        hasExistingSku,
        willChange: shouldGenerate,
        proposedSku: proposed,
        storageLocation: storage,
      };
    });
  }, [selectedCoins, coins, skuSettings, mode, applyBatchStorage, batchStorage, storageOverrides]);

  if (!isOpen || selectedCoins.length === 0) return null;

  const countToGenerate = allocations.filter((a) => a.willChange).length;
  const countToSkip = allocations.filter((a) => !a.willChange).length;

  const handleApply = async () => {
    if (mode === 'overwrite_all' && !overwriteConfirmed) return;

    try {
      setIsApplying(true);
      const itemsToUpdate = allocations
        .filter((a) => a.willChange || applyBatchStorage)
        .map((a) => ({
          coinId: a.coin.id,
          proposedSku: a.proposedSku,
          storageLocation: a.storageLocation,
        }));

      await batchApplySkus(itemsToUpdate);

      setResultSummary({
        applied: itemsToUpdate.length,
        skipped: countToSkip,
        failed: 0,
      });
    } catch (err) {
      console.error('Batch SKU generation failed:', err);
      setResultSummary({
        applied: 0,
        skipped: countToSkip,
        failed: countToGenerate,
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-sku-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 id="batch-sku-modal-title" className="text-base sm:text-lg font-bold text-slate-100 font-serif-title">
                Batch SKU Generator
              </h2>
              <p className="text-xs text-slate-400">
                Preview and allocate sequential inventory SKUs for {selectedCoins.length} selected record{selectedCoins.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close batch SKU modal"
            className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-200 text-xs sm:text-sm">
          {/* Result Summary Banner if applied */}
          {resultSummary && (
            <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-700 text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Batch SKUs Applied Successfully!</span>
              </div>
              <div className="text-xs text-emerald-300/90 flex flex-wrap gap-4">
                <span>Updated / Assigned: <strong>{resultSummary.applied}</strong></span>
                <span>Skipped (Already Had SKU): <strong>{resultSummary.skipped}</strong></span>
                {resultSummary.failed > 0 && <span>Failed: <strong>{resultSummary.failed}</strong></span>}
              </div>
              {onOpenLabelPrint && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenLabelPrint(selectedCoins);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Labels for These {selectedCoins.length} Coins Now →</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Allocation Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('fill_missing')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                mode === 'fill_missing'
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-bold text-xs ${mode === 'fill_missing' ? 'text-amber-400' : 'text-slate-200'}`}>
                  Fill Missing SKUs Only (Default)
                </span>
                {mode === 'fill_missing' && <Check className="w-4 h-4 text-amber-400" />}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Safely preserves all pre-existing SKUs. Only assigns new sequential numbers to coins that currently have no SKU.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('overwrite_all');
                setOverwriteConfirmed(false);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                mode === 'overwrite_all'
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-bold text-xs ${mode === 'overwrite_all' ? 'text-amber-400' : 'text-slate-200'}`}>
                  Overwrite Existing SKUs
                </span>
                {mode === 'overwrite_all' && <Check className="w-4 h-4 text-amber-400" />}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Re-assigns fresh sequential SKUs to all selected coins, replacing any prior identifiers.
              </p>
            </button>
          </div>

          {/* Overwrite Confirmation Checkbox */}
          {mode === 'overwrite_all' && (
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Explicit Overwrite Confirmation Required</span>
              </div>
              <p className="text-[11px] text-rose-300/90">
                Overwriting existing SKUs will replace saved inventory identifiers and invalidate previously printed physical barcode tags.
              </p>
              <label className="flex items-center gap-2 cursor-pointer pt-1 select-none font-semibold text-rose-200">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={(e) => setOverwriteConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-500 bg-slate-900 border-rose-700 focus:ring-rose-400"
                />
                <span>I understand and confirm re-generating SKUs for all selected coins</span>
              </label>
            </div>
          )}

          {/* Optional Batch Storage Assignment */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
              <input
                type="checkbox"
                checked={applyBatchStorage}
                onChange={(e) => setApplyBatchStorage(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-400"
              />
              <span className="font-semibold">Assign uniform storage location to all selected</span>
            </label>

            {applyBatchStorage && (
              <input
                type="text"
                placeholder="e.g. Vault 1, Box B, Album 3"
                value={batchStorage}
                onChange={(e) => setBatchStorage(e.target.value)}
                className="w-full sm:w-64 min-h-[36px] px-3 py-1 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            )}
          </div>

          {/* Preview Table of Records to Update */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Proposed Allocations ({countToGenerate} to update, {countToSkip} to keep existing)
              </span>
              <span className="text-[11px] text-amber-400 font-mono">
                Numbers are provisional until applied
              </span>
            </div>

            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-800 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Coin Title</th>
                      <th className="py-2.5 px-3">Existing SKU</th>
                      <th className="py-2.5 px-3">Proposed SKU</th>
                      <th className="py-2.5 px-3">Storage Location</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                    {allocations.map((item, idx) => (
                      <tr key={item.coin.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-3 font-sans text-slate-200 font-medium max-w-xs truncate">
                          {item.coin.title} ({item.coin.year || 'Unknown'})
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {item.coin.sku ? (
                            <span className="text-slate-300 font-bold">{item.coin.sku}</span>
                          ) : (
                            <span className="text-slate-600 italic">None</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`font-bold ${item.willChange ? 'text-amber-400' : 'text-slate-400'}`}>
                            {item.proposedSku}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={item.storageLocation}
                            onChange={(e) =>
                              setStorageOverrides({
                                ...storageOverrides,
                                [item.coin.id]: e.target.value,
                              })
                            }
                            className="px-2 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-sans text-slate-200 w-28 focus:outline-none focus:border-amber-500"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              item.willChange
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.willChange ? (item.hasExistingSku ? 'Overwrite' : 'Assign') : 'Keep Existing'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0 gap-3">
          <div className="text-xs text-slate-400">
            {countToGenerate > 0 ? (
              <span>
                Ready to allocate <strong className="text-amber-400 font-mono">{countToGenerate}</strong> sequential SKU{countToGenerate === 1 ? '' : 's'}.
              </span>
            ) : (
              <span>All selected coins already have SKUs.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying || countToGenerate === 0 || (mode === 'overwrite_all' && !overwriteConfirmed)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{isApplying ? 'Applying SKUs...' : `Apply SKUs (${countToGenerate})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
