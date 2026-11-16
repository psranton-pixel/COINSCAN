import React from 'react';
import {
  Coins,
  TrendingUp,
  DollarSign,
  Award,
  Layers,
  Camera,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Calendar,
  Globe,
  Sparkles,
  Trash2,
  Package,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { formatCoinValue, USD_FX_RATES } from '../utils/currency';
import { CoinCard } from '../components/CoinCard';
import { GuestMigrationBanner } from '../components/GuestMigrationBanner';
import type { CoinRecord } from '../types/coin';
import { computeCollectionSummary, getActiveOwnedQuantity, getCoinEstimatedValueUSD } from '../utils/inventoryCalculations';

interface DashboardViewProps {
  onScanClick: () => void;
  onOpenCoin: (coin: CoinRecord) => void;
  onViewCollection: () => void;
  onOpenAuth: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onScanClick,
  onOpenCoin,
  onViewCollection,
  onOpenAuth,
}) => {
  const { currency } = useAuth();
  const {
    coins,
    loading,
    includeSampleCoins,
    setIncludeSampleCoins,
    loadDemoCoins,
    removeSampleCoins,
    resaleFeeSettings,
  } = useCollection();

  // Compute portfolio metrics using isolated sample handling & verified melt/valuation math
  const summary = computeCollectionSummary(coins, currency, includeSampleCoins, resaleFeeSettings);

  const sampleCoinsCount = coins.filter((c) => Boolean(c.isSample)).length;
  const realCoinsCount = coins.length - sampleCoinsCount;
  const filteredCoins = includeSampleCoins ? coins : coins.filter((c) => !c.isSample);

  // Top and recent coins from filtered set (sorted by base USD equivalent)
  const activeOwnedCoins = filteredCoins.filter((c) => getActiveOwnedQuantity(c) > 0);
  const sortedByValue = [...activeOwnedCoins].sort(
    (a, b) => getCoinEstimatedValueUSD(b) - getCoinEstimatedValueUSD(a)
  );
  const topCoins = sortedByValue.slice(0, 4);
  const recentCoins = [...filteredCoins].slice(0, 4);

  // Group by country for analytics
  const countryCounts: Record<string, number> = {};
  filteredCoins.forEach((c) => {
    const activeQty = getActiveOwnedQuantity(c);
    if (activeQty <= 0) return;
    const ctry = c.country || 'Unknown';
    countryCounts[ctry] = (countryCounts[ctry] || 0) + activeQty;
  });
  const countryList = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Group by category for analytics (using identical base USD logic as summary.totalOwnedEstimatedValue)
  const categoryValues: Record<string, number> = {};
  filteredCoins.forEach((c) => {
    const activeQty = getActiveOwnedQuantity(c);
    if (activeQty <= 0) return;
    const cat = c.category || 'Uncategorized';
    categoryValues[cat] = (categoryValues[cat] || 0) + getCoinEstimatedValueUSD(c) * activeQty;
  });
  const categoryList = Object.entries(categoryValues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8">
      <div className="-mx-3 sm:-mx-6">
        <GuestMigrationBanner onOpenAuth={onOpenAuth} />
      </div>

      {/* Explicit Demo Mode Banner if sample coins exist */}
      {sampleCoinsCount > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 font-bold uppercase tracking-wider text-[10px]">
              DEMO MODE ACTIVE
            </span>
            <span className="text-slate-200">
              {sampleCoinsCount} sample demo record{sampleCoinsCount === 1 ? '' : 's'} loaded ({realCoinsCount} real coin{realCoinsCount === 1 ? '' : 's'} in vault).{' '}
              <strong className="text-amber-300">
                {includeSampleCoins
                  ? 'Currently included in displayed preview totals.'
                  : 'Excluded from your real portfolio totals.'}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center shrink-0">
            <label className="min-h-[36px] flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/70 border border-slate-700 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={includeSampleCoins}
                onChange={(e) => setIncludeSampleCoins(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-400"
              />
              <span>Preview demo in totals</span>
            </label>
            <button
              type="button"
              onClick={removeSampleCoins}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-200 hover:text-rose-200 border border-slate-700 hover:border-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Exit Demo Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* Hero Portfolio Valuation Banner + Supporting 2x2 Mobile / 4-Col Desktop KPI Grid */}
      <div className="space-y-3 sm:space-y-4">
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-amber-950/35 via-slate-900 to-slate-950 border border-amber-500/30 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-400">
                <span className="text-amber-400 font-semibold">Portfolio Valuation ({currency})</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num text-slate-300">
                  {summary.totalPiecesOwned} {summary.totalPiecesOwned === 1 ? 'piece' : 'pieces'} owned
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-0.5">
                <span className="text-2xl sm:text-4xl font-extrabold text-amber-400 font-mono-num tracking-tight">
                  {formatCoinValue(summary.totalOwnedEstimatedValue, currency, USD_FX_RATES)}
                </span>
                <span
                  className={`text-xs sm:text-sm font-bold font-mono-num ${
                    summary.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {summary.unrealizedGain >= 0 ? '+' : ''}
                  {formatCoinValue(summary.unrealizedGain, currency, USD_FX_RATES)} unrealized
                </span>
              </div>

              <p className="text-xs text-slate-400 pt-0.5">
                Central market estimate across your active collection
                {summary.totalAcquisitionCost > 0
                  ? ` · Cost basis ${formatCoinValue(summary.totalAcquisitionCost, currency, USD_FX_RATES)}`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {filteredCoins.length > 0 && (
                <button
                  type="button"
                  onClick={onViewCollection}
                  className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-100 border border-slate-700 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Open Vault ({filteredCoins.length})</span>
                </button>
              )}

              {realCoinsCount === 0 && sampleCoinsCount === 0 && (
                <button
                  type="button"
                  onClick={loadDemoCoins}
                  className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Try Demo Coins</span>
                </button>
              )}

              <button
                type="button"
                onClick={onScanClick}
                className="hidden lg:inline-flex min-h-[44px] items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 hover:brightness-110 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 whitespace-nowrap transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4 text-slate-950 shrink-0" />
                <span>Scan Coin</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Supporting KPI Cards: 2x2 on Mobile, 4-Column on Desktop — Zero Ellipsis Clipping */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Active Vault Pieces */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
              <span>Active Vault</span>
              <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-slate-100 font-mono-num">
              {summary.totalPiecesOwned}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary.listedCount > 0 ? `${summary.listedCount} listed for sale` : `${activeOwnedCoins.length} catalog records`}
            </div>
          </div>

          {/* Precious Metal Melt Floor */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
              <span>Melt Floor</span>
              <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-slate-100 font-mono-num">
              {summary.verifiedMeltCoinCount === 0 && activeOwnedCoins.length > 0
                ? 'Not Set'
                : formatCoinValue(summary.totalBullionMeltValue, currency, USD_FX_RATES)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {activeOwnedCoins.length > 0
                ? `${summary.verifiedMeltCoinCount}/${activeOwnedCoins.length} with metal weight`
                : 'Intrinsic bullion floor'}
            </div>
          </div>

          {/* Unrealized Gain */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
              <span>Unrealized Gain</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div
              className={`text-lg sm:text-2xl font-extrabold font-mono-num ${
                summary.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.unrealizedGain >= 0 ? '+' : ''}
              {formatCoinValue(summary.unrealizedGain, currency, USD_FX_RATES)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Cost {formatCoinValue(summary.totalAcquisitionCost, currency, USD_FX_RATES)}
            </div>
          </div>

          {/* Realized Net Profit */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
              <span>Realized Profit</span>
              <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div
              className={`text-lg sm:text-2xl font-extrabold font-mono-num ${
                summary.realizedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.realizedNetProfit >= 0 ? '+' : ''}
              {formatCoinValue(summary.realizedNetProfit, currency, USD_FX_RATES)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary.soldCount} {summary.soldCount === 1 ? 'coin' : 'coins'} sold net of fees
            </div>
          </div>
        </div>
      </div>

      {/* Visual Analytics / Charts Section */}
      {filteredCoins.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <div className="lg:col-span-7 p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-200">
                  Portfolio Value by Category ({currency})
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono-num">Top 5</span>
            </div>

            <div className="space-y-3 pt-1">
              {categoryList.map(([cat, val], idx) => {
                const percent = summary.totalOwnedEstimatedValue > 0 ? (val / summary.totalOwnedEstimatedValue) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs gap-2">
                      <span className="font-semibold text-slate-300 truncate">{cat}</span>
                      <span className="font-mono-num text-amber-400 shrink-0">
                        {formatCoinValue(val, currency, USD_FX_RATES, true)} ({percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(5, percent))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-200">
                  Coins by Country of Origin
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono-num">{countryList.length} countries</span>
            </div>

            <div className="space-y-2.5 pt-1">
              {countryList.map(([ctry, count], idx) => {
                const percent = summary.totalPiecesOwned > 0 ? (count / summary.totalPiecesOwned) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
                  >
                    <span className="font-semibold text-slate-200 truncate">{ctry}</span>
                    <div className="flex items-center gap-2 font-mono-num shrink-0">
                      <span className="text-slate-400">{count} pcs</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-amber-400 font-bold">{percent.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Most Valuable Coins Grid */}
      {topCoins.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold font-serif-title text-slate-100">
                Most Valuable Coins
              </h2>
            </div>
            <button
              type="button"
              onClick={onViewCollection}
              className="min-h-[36px] px-2 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline whitespace-nowrap cursor-pointer"
            >
              View All ({filteredCoins.length}) →
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {topCoins.map((coin) => (
              <CoinCard key={coin.id} coin={coin} onClick={() => onOpenCoin(coin)} />
            ))}
          </div>
        </div>
      )}

      {/* Recently Added Section */}
      {recentCoins.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold font-serif-title text-slate-100">
              Recently Cataloged Specimens
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {recentCoins.map((coin) => (
              <CoinCard key={coin.id} coin={coin} onClick={() => onOpenCoin(coin)} />
            ))}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {coins.length === 0 && loading && (
        <div className="p-8 sm:p-12 text-center bg-slate-900/40 rounded-3xl border border-slate-800 space-y-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading your private numismatic vault...</p>
        </div>
      )}

      {/* Empty State Banner */}
      {coins.length === 0 && !loading && (
        <div className="p-8 sm:p-12 text-center bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 space-y-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto shadow-xl shadow-amber-500/10">
            <Coins className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold font-serif-title text-slate-200">
            Your Coin Collection is Empty
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Scan your first coin using your phone camera or explore our demo collection to preview automatic Sheldon grading, spot bullion melt floors, and auction comps.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onScanClick}
              className="min-h-[46px] px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Scan Your First Coin</span>
            </button>
            <button
              type="button"
              onClick={loadDemoCoins}
              className="min-h-[46px] px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs sm:text-sm transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Explore Demo Coins</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
