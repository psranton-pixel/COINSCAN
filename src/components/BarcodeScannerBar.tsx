import React, { useState, useEffect, useRef } from 'react';
import { Barcode, Search, AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { CoinRecord } from '../types/coin';
import { useCollection } from '../context/CollectionContext';

interface BarcodeScannerBarProps {
  onOpenCoin: (coin: CoinRecord) => void;
  className?: string;
}

export const BarcodeScannerBar: React.FC<BarcodeScannerBarProps> = ({ onOpenCoin, className = '' }) => {
  const { coins, lookupCoinBySku } = useCollection();
  const [skuInput, setSkuInput] = useState('');
  const [scanStatus, setScanStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // USB/Bluetooth scanner hardware keyboard-wedge listener
  // Scanners send keystrokes with < 50ms intervals followed by 'Enter'
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing inside textareas or other inputs (unless it's rapid scanner input)
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3 && timeDiff < 90) {
          // Hardware scanner completed scan!
          const scannedSku = barcodeBufferRef.current.trim();
          barcodeBufferRef.current = '';
          handleLookup(scannedSku);
          e.preventDefault();
        } else {
          barcodeBufferRef.current = '';
        }
        return;
      }

      // Check rapid character input
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (timeDiff < 70 || barcodeBufferRef.current.length === 0) {
          barcodeBufferRef.current += e.key;
        } else {
          // Reset buffer if human typing slowly
          barcodeBufferRef.current = e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [coins]);

  const handleLookup = (targetSku: string) => {
    const cleaned = targetSku.trim();
    if (!cleaned) return;

    const match = lookupCoinBySku(cleaned);
    if (match) {
      const matchedIdentifier =
        match.barcodeId && match.barcodeId.toLowerCase() === cleaned.toLowerCase()
          ? `${match.sku || match.barcodeId} [ID: ${match.barcodeId}]`
          : match.sku || match.barcodeId || cleaned;
      setScanStatus({
        type: 'success',
        message: `Found: ${match.title} (${matchedIdentifier})`,
      });
      setSkuInput('');
      onOpenCoin(match);
      setTimeout(() => setScanStatus(null), 3500);
    } else {
      setScanStatus({
        type: 'error',
        message: `No record found for SKU / Barcode ID "${cleaned}". Try manual search below.`,
      });
      setTimeout(() => setScanStatus(null), 6000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup(skuInput);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center gap-1.5 pointer-events-none text-amber-400">
          <Barcode className="w-4 h-4 shrink-0" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={skuInput}
          onChange={(e) => setSkuInput(e.target.value.toUpperCase())}
          placeholder="Scan barcode or enter SKU / Barcode ID..."
          className="w-full min-h-[42px] pl-10 pr-24 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 uppercase transition-all shadow-inner"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {skuInput && (
            <button
              type="button"
              onClick={() => setSkuInput('')}
              className="p-1 text-slate-500 hover:text-slate-300 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="submit"
            disabled={!skuInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-sm"
          >
            Lookup
          </button>
        </div>
      </form>

      {/* Instant Feedback Toast */}
      {scanStatus && (
        <div
          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
            scanStatus.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {scanStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{scanStatus.message}</span>
          </div>

          <button
            type="button"
            onClick={() => setScanStatus(null)}
            className="text-slate-400 hover:text-white p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
