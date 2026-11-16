import React, { useState } from 'react';
import {
  Camera,
  Coins,
  LayoutDashboard,
  TrendingUp,
  Search,
  Settings,
  LogIn,
  LogOut,
  ChevronDown,
  Globe,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import type { CurrencyCode } from '../types/coin';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onOpenAuth }) => {
  const { user, logout, currency, setCurrency } = useAuth();
  const { coins } = useCollection();
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'collection', label: `Collection (${coins.length})`, icon: Coins },
    { id: 'valuations', label: 'Valuations', icon: TrendingUp },
    { id: 'search', label: 'Catalog', icon: Search },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const currencies: { code: CurrencyCode; label: string; symbol: string }[] = [
    { code: 'USD', label: 'US Dollar', symbol: '$' },
    { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
    { code: 'GBP', label: 'British Pound', symbol: '£' },
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  ];

  return (
    <>
      {/* Backdrop to close menus on tap outside */}
      {(currencyMenuOpen || userMenuOpen || compactMenuOpen) && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => {
            setCurrencyMenuOpen(false);
            setUserMenuOpen(false);
            setCompactMenuOpen(false);
          }}
        />
      )}

      <header className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-2.5 sm:px-5 lg:px-8 h-14 sm:h-16 flex items-center">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-1.5 sm:gap-2 lg:gap-4 min-w-0">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-1.5 sm:gap-2 text-left cursor-pointer select-none whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 p-[1.5px] shadow-md shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <span className="font-serif-title font-extrabold text-sm sm:text-lg text-amber-400">
                  ₵
                </span>
              </div>
            </div>
            <span className="font-serif-title font-extrabold text-[13px] sm:text-base lg:text-lg tracking-wide sm:tracking-wider text-slate-100 whitespace-nowrap">
              CoinScan Pro
            </span>
          </button>

          {/* Zone 2: Desktop Single-Line Navigation Links */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1.5 min-w-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-800 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Desktop Primary "Scan Coin" CTA + Compact Right-Hand Currency/Account Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Primary CTA Button: Scan Coin (Desktop lg+ only; mobile uses center button in BottomNav) */}
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`hidden lg:flex min-h-[40px] px-3.5 py-1.5 rounded-xl font-bold text-xs items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer shadow-md ${
                activeTab === 'scan'
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300/60 shadow-amber-500/30'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20'
              }`}
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>Scan Coin</span>
            </button>

            {/* Wide Desktop (2xl+) Separate Currency & Account Controls */}
            <div className="hidden 2xl:flex items-center gap-2 shrink-0">
              {/* Currency Switcher */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setCompactMenuOpen(false);
                    setCurrencyMenuOpen(!currencyMenuOpen);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-amber-400 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  aria-label="Select Currency"
                >
                  <span className="font-mono-num">{currency}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {currencyMenuOpen && (
                  <div
                    onClick={() => setCurrencyMenuOpen(false)}
                    className="absolute right-0 top-12 z-50 w-48 bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl py-1.5 text-xs text-slate-200"
                  >
                    <div className="px-3.5 py-2 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                      Valuation Currency
                    </div>
                    {currencies.map((c) => (
                      <button
                        type="button"
                        key={c.code}
                        onClick={() => setCurrency(c.code)}
                        className={`w-full min-h-[40px] flex items-center justify-between px-3.5 py-2 hover:bg-slate-800 text-left cursor-pointer ${
                          currency === c.code ? 'text-amber-400 font-bold bg-amber-500/10' : 'text-slate-300'
                        }`}
                      >
                        <span>{c.label}</span>
                        <span className="font-mono-num text-slate-400">
                          {c.code} ({c.symbol})
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* User Account / Sign In */}
              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrencyMenuOpen(false);
                      setCompactMenuOpen(false);
                      setUserMenuOpen(!userMenuOpen);
                    }}
                    className="min-h-[40px] flex items-center gap-2 px-2.5 pr-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs uppercase border border-amber-500/30">
                      {user.email ? user.email[0] : 'U'}
                    </div>
                    <span className="max-w-[90px] truncate">
                      {user.displayName || user.email?.split('@')[0]}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {userMenuOpen && (
                    <div
                      onClick={() => setUserMenuOpen(false)}
                      className="absolute right-0 top-12 z-50 w-56 bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl py-1.5 text-xs text-slate-200"
                    >
                      <div className="px-3.5 py-2.5 border-b border-slate-800">
                        <span className="block font-semibold text-slate-100 truncate">
                          {user.displayName || 'Collector'}
                        </span>
                        <span className="block text-[11px] text-slate-400 truncate">{user.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('settings')}
                        className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>Account & Backup Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => logout()}
                        className="w-full min-h-[40px] flex items-center gap-2.5 px-3.5 py-2 hover:bg-rose-950/40 text-rose-400 text-left border-t border-slate-800/80 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-bold text-xs whitespace-nowrap shrink-0 transition-all cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}
            </div>

            {/* Compact Right-Hand Menu for Smaller Laptop Viewports & Mobile (< 2xl) */}
            <div className="relative 2xl:hidden">
              <button
                type="button"
                onClick={() => {
                  setCurrencyMenuOpen(false);
                  setUserMenuOpen(false);
                  setCompactMenuOpen((prev) => !prev);
                }}
                aria-label="Currency & Account Menu"
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <span className="font-mono-num text-amber-400 font-bold">{currency}</span>
                <span className="text-slate-700">|</span>
                {user ? (
                  <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px] uppercase border border-amber-500/30">
                    {user.email ? user.email[0] : 'U'}
                  </span>
                ) : (
                  <User className="w-3.5 h-3.5 text-slate-300" />
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {compactMenuOpen && (
                <div className="absolute right-0 top-12 z-50 w-64 bg-slate-950 border border-slate-700/90 rounded-2xl shadow-2xl p-3 text-xs text-slate-200 space-y-3">
                  {/* Currency Switcher Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      <Globe className="w-3.5 h-3.5 text-amber-400" />
                      <span>Display Currency</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {currencies.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setCurrency(c.code);
                            setCompactMenuOpen(false);
                          }}
                          className={`py-1.5 rounded-lg text-center font-mono-num text-[11px] font-bold border transition-colors cursor-pointer ${
                            currency === c.code
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Account / Sign In Section */}
                  <div className="pt-2.5 border-t border-slate-800 space-y-1.5">
                    {user ? (
                      <>
                        <div className="px-2 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="block font-semibold text-slate-100 truncate">
                            {user.displayName || 'Collector'}
                          </span>
                          <span className="block text-[11px] text-slate-400 truncate">{user.email}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCompactMenuOpen(false);
                            setActiveTab('settings');
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-900 text-slate-200 text-left cursor-pointer"
                        >
                          <Settings className="w-4 h-4 text-amber-400" />
                          <span>Settings & Backup Hub</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompactMenuOpen(false);
                            logout();
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-rose-950/40 text-rose-400 text-left cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setCompactMenuOpen(false);
                            onOpenAuth();
                          }}
                          className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs cursor-pointer transition-colors"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>Sign In / Cloud Sync</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompactMenuOpen(false);
                            setActiveTab('settings');
                          }}
                          className="w-full min-h-[36px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-900 text-slate-300 text-[11px] font-semibold cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                          <span>Settings & Fee Presets</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
