import React, { useState } from 'react';
import { Globe, Check, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { CurrencyCode } from '../types/coin';
import { CURRENCY_SYMBOLS, USD_FX_RATES } from '../utils/currency';

const CURRENCY_OPTIONS: { code: CurrencyCode; label: string; region: string; highlight?: string }[] = [
  { code: 'AUD', label: 'Australian Dollar', region: 'Australia', highlight: 'Popular for AU dealers & sovereigns' },
  { code: 'USD', label: 'US Dollar', region: 'United States', highlight: 'Catalogue reference base' },
  { code: 'GBP', label: 'British Pound', region: 'United Kingdom' },
  { code: 'EUR', label: 'Euro', region: 'Eurozone' },
  { code: 'CAD', label: 'Canadian Dollar', region: 'Canada' },
];

export const FirstRunCurrencyModal: React.FC = () => {
  const { currency, needsCurrencySetup, confirmFirstRunCurrency, dismissCurrencySetup } = useAuth();
  const [selected, setSelected] = useState<CurrencyCode>(currency || 'AUD');
  const [isSaving, setIsSaving] = useState(false);

  if (!needsCurrencySetup) return null;

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await confirmFirstRunCurrency(selected);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-currency-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto">
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 id="first-run-currency-title" className="text-base sm:text-lg font-bold text-slate-100 font-serif-title">
                Choose Your Display Currency
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Your choice is remembered on this device and never overwrites original purchase or sale currencies.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissCurrencySetup}
            aria-label="Keep current display currency"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800/80 text-slate-400 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {CURRENCY_OPTIONS.map((opt) => {
            const isActive = selected === opt.code;
            const rateVsUsd = USD_FX_RATES[opt.code] ?? 1;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setSelected(opt.code)}
                className={`w-full min-h-[54px] p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500/15 border-amber-500/60 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-10 h-10 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {CURRENCY_SYMBOLS[opt.code]}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-100">{opt.code}</span>
                      <span className="text-xs text-slate-300">{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {opt.region}
                      {opt.highlight ? ` · ${opt.highlight}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-slate-400">
                    1 USD = {rateVsUsd.toFixed(3)} {opt.code}
                  </span>
                  {isActive && <Check className="w-4 h-4 text-amber-400" />}
                </div>
              </button>
            );
          })}

          <p className="text-[11px] text-slate-500 pt-1">
            Display totals use indicative benchmark FX conversion tables. You can change this anytime in the header or Settings.
          </p>
        </div>

        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <span>Use {selected} Display Currency</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
