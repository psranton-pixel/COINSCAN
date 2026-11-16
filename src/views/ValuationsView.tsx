import React from 'react';
import {
  Scale,
  Sparkles,
  Award,
  Info,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { CURRENCY_LABELS } from '../utils/formatters';
import {
  formatCoinValue,
  formatNativeCurrency,
  FX_RATE_SOURCE,
  FX_RATE_TIMESTAMP,
  normalizeCurrencyCode,
  toUsdAmount,
  USD_FX_RATES,
} from '../utils/currency';
import { SPOT_RATES, GRAMS_PER_TROY_OUNCE } from '../services/marketRatesService';
import {
  computeCollectionSummary,
  getActiveOwnedQuantity,
  getCoinEstimatedValueUSD,
} from '../utils/inventoryCalculations';
import type { AuctionComp, CoinRecord } from '../types/coin';

interface ValuationsViewProps {
  onOpenCoin: (coin: CoinRecord) => void;
  onScanClick: () => void;
}

export const ValuationsView: React.FC<ValuationsViewProps> = ({ onOpenCoin, onScanClick }) => {
  const { currency } = useAuth();
  const { coins, includeSampleCoins, resaleFeeSettings } = useCollection();

  // Exclude sample coins from valuations by default unless user toggled them on
  const summary = computeCollectionSummary(coins, currency, includeSampleCoins, resaleFeeSettings);
  const activeCoins = includeSampleCoins ? coins : coins.filter((c) => !c.isSample);
  const activeOwned = activeCoins.filter((c) => getActiveOwnedQuantity(c) > 0);

  const totalValue = summary.totalOwnedEstimatedValue;
  const totalMelt = summary.totalBullionMeltValue;
  const numismaticPremium = totalValue > totalMelt ? totalValue - totalMelt : 0;
  const numismaticPremiumPercent = totalMelt > 0 ? (numismaticPremium / totalMelt) * 100 : 0;

  const goldCoins = activeOwned.filter((c) => c.metalCategory === 'gold');
  const silverCoins = activeOwned.filter((c) => c.metalCategory === 'silver');
  const otherCoins = activeOwned.filter(
    (c) => c.metalCategory !== 'gold' && c.metalCategory !== 'silver'
  );

  const goldTotal = goldCoins.reduce(
    (acc, c) => acc + getCoinEstimatedValueUSD(c) * getActiveOwnedQuantity(c),
    0
  );
  const silverTotal = silverCoins.reduce(
    (acc, c) => acc + getCoinEstimatedValueUSD(c) * getActiveOwnedQuantity(c),
    0
  );
  const otherTotal = otherCoins.reduce(
    (acc, c) => acc + getCoinEstimatedValueUSD(c) * getActiveOwnedQuantity(c),
    0
  );

  const allComps: { comp: AuctionComp; coin: CoinRecord }[] = [];
  activeCoins.forEach((c) => {
    if (c.recentAuctionComps) {
      c.recentAuctionComps.forEach((comp) => {
        allComps.push({ comp, coin: c });
      });
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-400">
              Traceable Numismatic Valuations
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">
              {CURRENCY_LABELS[currency]?.name || currency} ({currency})
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl font-bold font-serif-title text-slate-100 mt-0.5">
            Valuations &amp; Bullion Melt Benchmarks
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Documented estimates, verified precious metal melt calculations (1 oz t = {GRAMS_PER_TROY_OUNCE.toFixed(4)} g), and traceable comparable sales.
          </p>
        </div>

        <button
          type="button"
          onClick={onScanClick}
          className="min-h-[44px] w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md whitespace-nowrap transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Valuate New Coin</span>
        </button>
      </div>

      {/* Dated Benchmark Spot Price Reference Bar */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-200">
              Dated Spot-Price Snapshot Benchmarks (Static Reference — Not Live Market Data)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>
              Spot: {SPOT_RATES.gold.timestamp} ({SPOT_RATES.gold.source}) · FX: {FX_RATE_TIMESTAMP} ({FX_RATE_SOURCE})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {(['gold', 'silver', 'platinum', 'palladium'] as const).map((metal) => {
            const info = SPOT_RATES[metal];
            return (
              <div key={metal} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block capitalize">
                  {metal} (per oz t)
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-sm sm:text-base font-bold text-slate-100 font-mono-num">
                    {formatCoinValue(info.pricePerUnitUSD, currency, USD_FX_RATES, true)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono-num">
                    ({formatCoinValue(info.pricePerUnitUSD, 'USD', USD_FX_RATES, true)})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Cards: Total Value vs Melt Value vs Collector Premium */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 shadow-lg">
          <span className="text-xs text-amber-400 font-semibold block">
            Owned Collection Valuation ({currency})
          </span>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono-num mt-1">
            {formatCoinValue(totalValue, currency, USD_FX_RATES, true)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Sum across {summary.totalPiecesOwned} owned piece{summary.totalPiecesOwned === 1 ? '' : 's'} using exact stored transaction currency conversion.
          </p>
        </div>

        <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>Verified Bullion Melt Floor</span>
            <Scale className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-mono-num">
            {summary.verifiedMeltCoinCount === 0 && activeOwned.length > 0
              ? 'Unavailable'
              : formatCoinValue(totalMelt, currency, USD_FX_RATES, true)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Calculated from verified composition, fineness, and weight across {summary.verifiedMeltCoinCount} of {activeOwned.length} owned record{activeOwned.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>Collector Numismatic Premium</span>
            <Award className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono-num">
            +{formatCoinValue(numismaticPremium, currency, USD_FX_RATES, true)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            {totalMelt > 0
              ? `+${numismaticPremiumPercent.toFixed(1)}% above verified precious metal melt value due to rarity, strike, variety, and grade.`
              : 'Estimated collector value above intrinsic bullion floor.'}
          </p>
        </div>
      </div>

      {/* Precious Metal Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-amber-500/30 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">Gold Coins</span>
            <span className="font-mono-num text-xs text-slate-400">{goldCoins.length} records</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-300 font-mono-num">
            {formatCoinValue(goldTotal, currency, USD_FX_RATES, true)}
          </div>
          <div className="text-xs text-slate-400 divide-y divide-slate-800">
            {goldCoins.slice(0, 3).map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => onOpenCoin(c)}
                className="w-full min-h-[38px] py-1.5 flex items-center justify-between hover:text-amber-300 text-left gap-2 cursor-pointer"
              >
                <span className="truncate">{c.title}</span>
                <span className="font-mono-num text-amber-400 shrink-0">
                  {formatCoinValue(getCoinEstimatedValueUSD(c), currency, USD_FX_RATES, true)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-700 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Silver Coins</span>
            <span className="font-mono-num text-xs text-slate-400">{silverCoins.length} records</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-200 font-mono-num">
            {formatCoinValue(silverTotal, currency, USD_FX_RATES, true)}
          </div>
          <div className="text-xs text-slate-400 divide-y divide-slate-800">
            {silverCoins.slice(0, 3).map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => onOpenCoin(c)}
                className="w-full min-h-[38px] py-1.5 flex items-center justify-between hover:text-white text-left gap-2 cursor-pointer"
              >
                <span className="truncate">{c.title}</span>
                <span className="font-mono-num text-slate-300 shrink-0">
                  {formatCoinValue(getCoinEstimatedValueUSD(c), currency, USD_FX_RATES, true)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Platinum / Copper / Clad / Other</span>
            <span className="font-mono-num text-xs text-slate-400">{otherCoins.length} records</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-300 font-mono-num">
            {formatCoinValue(otherTotal, currency, USD_FX_RATES, true)}
          </div>
          <div className="text-xs text-slate-400 divide-y divide-slate-800">
            {otherCoins.slice(0, 3).map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => onOpenCoin(c)}
                className="w-full min-h-[38px] py-1.5 flex items-center justify-between hover:text-white text-left gap-2 cursor-pointer"
              >
                <span className="truncate">{c.title}</span>
                <span className="font-mono-num text-slate-300 shrink-0">
                  {formatCoinValue(getCoinEstimatedValueUSD(c), currency, USD_FX_RATES, true)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auction Comps & Trade Records with Full Traceability */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-200">
            Verified Comparable Sales &amp; Dealer References
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Recorded comparable results with explicit source attribution, original currency, price type, and direct lot links.
          </p>
        </div>

        {allComps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allComps.map(({ comp, coin }, idx) => {
              const origCur = normalizeCurrencyCode(comp.originalCurrency || comp.currency, 'USD');
              const origAmount = comp.originalPrice ?? comp.realizedPrice;
              const usdEquiv = toUsdAmount(origAmount, origCur);
              const sourceLabel =
                comp.sourceType === 'verified_auction'
                  ? 'Verified Auction'
                  : comp.sourceType === 'dealer_ask'
                  ? 'Dealer Asking Price'
                  : comp.sourceType === 'user_entered'
                  ? 'User Entered'
                  : 'AI / Reference';
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-slate-200 truncate">{coin.title}</span>
                      <div className="text-right shrink-0">
                        <span className="font-mono-num font-bold text-amber-400 block">
                          {formatCoinValue(usdEquiv, currency, USD_FX_RATES, true)}
                        </span>
                        {origCur !== currency && (
                          <span className="text-[10px] text-slate-400 font-mono-num">
                            Orig: {formatNativeCurrency(origAmount, origCur)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold text-[10px]">
                        {sourceLabel}
                      </span>
                      <span className="font-semibold text-slate-300">{comp.auctionHouse}</span>
                      {comp.lotNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num text-slate-300">Lot {comp.lotNumber}</span>
                        </>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                      <div>
                        Grade: <span className="text-slate-200 font-mono-num">{comp.grade}</span>
                        {comp.coinVariety ? ` · ${comp.coinVariety}` : ''}
                      </div>
                      <div>
                        Date: {comp.date || 'Undated'} ·{' '}
                        {comp.priceType === 'buyer_inclusive' || comp.buyersPremiumIncluded
                          ? 'Buyer-inclusive price'
                          : comp.priceType === 'asking'
                          ? 'Asking price'
                          : 'Hammer price'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCoin(coin)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold cursor-pointer"
                    >
                      View Coin
                    </button>

                    {comp.url ? (
                      <a
                        href={comp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open source lot at ${comp.auctionHouse}`}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <span>Source URL</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">No external source URL</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-6 text-center">
            No verified comparable sales available. Add verified auction URLs and lot numbers inside any coin’s Valuations tab.
          </p>
        )}
      </div>

      {/* Valuation Methodology & Traceability Disclaimer */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-200">Traceability &amp; Evidence Standards:</strong> Photo-based grading and catalog ranges are provisional estimates only and do not constitute third-party authentication or certification from PCGS, NGC, or ANACS. Spot metal prices and currency rates reflect dated reference snapshots ({SPOT_RATES.gold.timestamp}) unless refreshed against a connected market data provider.
        </p>
      </div>
    </div>
  );
};
