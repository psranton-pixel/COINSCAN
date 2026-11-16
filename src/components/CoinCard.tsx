import React, { useState } from 'react';
import { Star, MoreVertical, Copy, Trash2, Edit3, Download, RefreshCw, Import } from 'lucide-react';
import type { CoinRecord } from '../types/coin';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { formatCoinValue, normalizeCurrencyCode, toUsdAmount, USD_FX_RATES } from '../utils/currency';
import { getCoinEstimatedValueUSD } from '../utils/inventoryCalculations';
import { downloadDataUrl } from '../utils/imageProcessor';

interface CoinCardProps {
  coin: CoinRecord;
  onClick?: () => void;
  onEdit?: (coin: CoinRecord) => void;
  selected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  showSelectCheckbox?: boolean;
}

export const CoinCard: React.FC<CoinCardProps> = ({
  coin,
  onClick,
  onEdit,
  selected,
  onToggleSelect,
  showSelectCheckbox,
}) => {
  const { currency } = useAuth();
  const { toggleFavorite, duplicateCoin, deleteCoin, importDemoCoinAsReal } = useCollection();
  const [showReverse, setShowReverse] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayImage = showReverse && coin.reverseImage ? coin.reverseImage : coin.obverseImage;

  const handleDownloadPNG = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const targetImg = showReverse && coin.reverseImage ? coin.reverseImage : coin.obverseImage;
    await downloadDataUrl(
      targetImg,
      `${coin.title.replace(/[^a-zA-Z0-9]/g, '_')}_${showReverse ? 'reverse' : 'obverse'}.png`
    );
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    await duplicateCoin(coin);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    await deleteCoin(coin.id);
  };

  return (
    <div
      onClick={onClick}
      className={`group relative bg-slate-900/85 hover:bg-slate-900 border rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-200 flex flex-col cursor-pointer select-none ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-800 hover:border-amber-500/40'
      }`}
    >
      {/* Optional selection checkbox */}
      {showSelectCheckbox && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleSelect) onToggleSelect(e);
          }}
          className={`absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer shadow-md transition-all ${
            selected
              ? 'bg-amber-500 text-slate-950 font-bold border border-amber-400'
              : 'bg-slate-900/90 text-transparent border border-slate-700 hover:border-amber-400'
          }`}
        >
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => {}}
            className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700 pointer-events-none"
          />
        </div>
      )}
      {/* Top Bar: Unboxed Kicker Metadata + Badges + Touch Action Buttons */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1 z-10 gap-1">
        <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-400 font-medium truncate">
          <span className="text-amber-400/90 font-semibold truncate">{coin.country}</span>
          <span aria-hidden="true"> · </span>
          <span className="font-mono-num shrink-0">{coin.year || 'Undated'}</span>
          {coin.isSample && (
            <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold uppercase tracking-wider shrink-0">
              Sample data
            </span>
          )}
          {coin.status && coin.status !== 'in_collection' && (
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                coin.status === 'sold'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : coin.status === 'listed'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}
            >
              {coin.status === 'sold' ? 'Sold' : coin.status === 'listed' ? 'Listed' : 'Wishlist'}
            </span>
          )}
        </div>

        <div className="flex items-center shrink-0 -mr-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(coin.id);
            }}
            aria-label={coin.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl transition-colors ${
              coin.isFavorite
                ? 'text-amber-400'
                : 'text-slate-500 hover:text-slate-300 active:bg-slate-800'
            }`}
          >
            <Star className={`w-4 h-4 ${coin.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              aria-label="Coin actions"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-200 rounded-xl active:bg-slate-800 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-9 z-30 w-44 bg-slate-950 border border-slate-700/90 rounded-2xl shadow-2xl py-1.5 text-xs text-slate-200"
                >
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onEdit(coin);
                      }}
                      className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-800 text-left font-medium"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Edit Coin</span>
                    </button>
                  )}
                  {coin.isSample && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        await importDemoCoinAsReal(coin.id);
                      }}
                      className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-emerald-950/50 text-emerald-300 text-left font-medium"
                    >
                      <Import className="w-3.5 h-3.5" />
                      <span>Import to Real</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-800 text-left"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPNG}
                    className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-800 text-left"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Save PNG</span>
                  </button>
                  <div className="h-px bg-slate-800 my-1" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-rose-950/40 text-rose-400 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Coin Showcase Viewport with Transparent Background */}
      <div className="relative w-full aspect-square p-3 sm:p-5 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-radial from-amber-500/8 via-transparent to-transparent pointer-events-none" />

        <img
          src={displayImage}
          alt={coin.title}
          loading="lazy"
          className="relative max-h-full max-w-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.65)] group-hover:scale-105 transition-transform duration-200 select-none"
        />

        {/* Reverse / Obverse Flip Button */}
        {coin.reverseImage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowReverse(!showReverse);
            }}
            className="absolute bottom-2 right-2 min-h-[32px] flex items-center gap-1 px-2.5 py-1 bg-slate-950/90 hover:bg-slate-900 border border-slate-700/80 text-[10px] sm:text-[11px] font-semibold text-amber-300 rounded-xl shadow-md backdrop-blur-xs transition-all whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3 shrink-0" />
            <span>{showReverse ? 'Rev' : 'Obv'}</span>
          </button>
        )}
      </div>

      {/* Coin Information Footer */}
      <div className="p-3 sm:p-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-serif-title font-bold text-slate-100 text-xs sm:text-sm leading-snug line-clamp-1 group-hover:text-amber-300 transition-colors">
            {coin.title}
          </h3>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 truncate">
            <span className="truncate">{coin.denomination}</span>
            {coin.estimatedGrade && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num text-slate-300 truncate">{String(coin.estimatedGrade).split(' ')[0]}</span>
              </>
            )}
          </div>
        </div>

        {/* Valuation and Quick Edit */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-end justify-between gap-1">
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 block truncate">
              Est. Value {coin.quantity && coin.quantity > 1 ? `(Qty: ${coin.quantity})` : ''}
            </span>
            <span className="text-sm sm:text-base font-bold text-amber-400 font-mono-num block truncate">
              {formatCoinValue(getCoinEstimatedValueUSD(coin), currency, USD_FX_RATES)}
            </span>
          </div>

          {onEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(coin);
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 border border-slate-700 shrink-0 transition-colors"
            >
              Edit
            </button>
          ) : (
            coin.purchasePrice !== undefined &&
            coin.purchasePrice > 0 && (
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-500 block">Paid</span>
                <span className="text-xs text-slate-300 font-mono-num">
                  {formatCoinValue(
                    toUsdAmount(coin.purchasePrice, normalizeCurrencyCode(coin.purchaseCurrency, 'USD')),
                    currency,
                    USD_FX_RATES
                  )}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
