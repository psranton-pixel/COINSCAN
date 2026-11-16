import React from 'react';
import { LayoutDashboard, Coins, Camera, TrendingUp, Search } from 'lucide-react';
import { useCollection } from '../context/CollectionContext';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { coins } = useCollection();

  return (
    <nav
      aria-label="Mobile Primary Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/90 px-1 pt-1 pb-safe grid grid-cols-5 items-center"
    >
      <button
        type="button"
        onClick={() => setActiveTab('dashboard')}
        className={`min-h-[50px] flex flex-col items-center justify-center gap-0.5 rounded-xl active:scale-95 transition-all ${
          activeTab === 'dashboard' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">Home</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('collection')}
        className={`relative min-h-[50px] flex flex-col items-center justify-center gap-0.5 rounded-xl active:scale-95 transition-all ${
          activeTab === 'collection' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <Coins className="w-5 h-5" />
          {coins.length > 0 && (
            <span className="absolute -top-1.5 -right-3 text-[9px] font-bold text-amber-400 font-mono-num">
              {coins.length}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">Gallery</span>
      </button>

      {/* Center Prominent Thumb-Zone Scan Trigger */}
      <button
        type="button"
        onClick={() => setActiveTab('scan')}
        className="relative -top-2.5 flex flex-col items-center justify-center group"
      >
        <div
          className={`w-12 h-12 rounded-2xl p-0.5 shadow-lg transition-transform group-active:scale-95 flex items-center justify-center ${
            activeTab === 'scan'
              ? 'bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-200 shadow-amber-500/40'
              : 'bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-300 shadow-amber-500/25'
          }`}
        >
          <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
            <Camera className="w-5 h-5 text-amber-400" />
          </div>
        </div>
        <span className="text-[10px] font-bold text-amber-400 mt-0.5 whitespace-nowrap">Scan</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('valuations')}
        className={`min-h-[50px] flex flex-col items-center justify-center gap-0.5 rounded-xl active:scale-95 transition-all ${
          activeTab === 'valuations' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <TrendingUp className="w-5 h-5" />
        <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">Value</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('search')}
        className={`min-h-[50px] flex flex-col items-center justify-center gap-0.5 rounded-xl active:scale-95 transition-all ${
          activeTab === 'search' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Search className="w-5 h-5" />
        <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">Catalog</span>
      </button>
    </nav>
  );
};
