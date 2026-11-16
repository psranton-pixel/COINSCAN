import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CollectionProvider, useCollection } from './context/CollectionContext';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './views/DashboardView';
import { ScanCoinView } from './views/ScanCoinView';
import { CollectionView } from './views/CollectionView';
import { ValuationsView } from './views/ValuationsView';
import { CoinSearchView } from './views/CoinSearchView';
import { SettingsView } from './views/SettingsView';
import { CoinDetailModal } from './components/CoinDetailModal';
import { CoinEditModal } from './components/CoinEditModal';
import { AuthModal } from './components/AuthModal';
import { FirstRunCurrencyModal } from './components/FirstRunCurrencyModal';
import type { CoinRecord } from './types/coin';
import { Sparkles, AlertTriangle, X, RefreshCw, ExternalLink } from 'lucide-react';
import { FIRESTORE_QUOTA_CONSOLE_URL } from './services/firebase';

function MainApp() {
  const { user } = useAuth();
  const {
    coins,
    loadDemoCoins,
    storageError,
    clearStorageError,
    cloudSyncStatus,
    isQuotaExceeded,
    retryCloudSync,
  } = useCollection();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<CoinRecord | null>(null);
  const [editCoin, setEditCoin] = useState<CoinRecord | null>(null);
  const [retryingSync, setRetryingSync] = useState(false);
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);

  const handleOpenCoin = (coin: CoinRecord) => {
    setSelectedCoin(coin);
  };

  const handleEditCoin = (coin: CoinRecord) => {
    setEditCoin(coin);
  };

  const handleAddManualCoin = () => {
    const dummyNewCoin: CoinRecord = {
      id: `coin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      owner_user_id: user?.uid || 'guest',
      title: 'New Coin Specimen',
      country: 'United States',
      denomination: '$1.00',
      currency: 'USD',
      year: new Date().getFullYear(),
      mintMark: '',
      series: 'Custom Series',
      metalComposition: 'Silver',
      rarity: 'Common',
      estimatedGrade: 'MS-63 Choice Uncirculated',
      conditionDetails: 'Added manually to collection.',
      historicalSignificance: 'Collector specimen.',
      estimatedValue: 40.0,
      lowValue: 30.0,
      highValue: 55.0,
      faceValue: '$1.00',
      valuationMethodology: 'provisional_ai_inference',
      evidenceQuality: 'provisional_estimate',
      valuationDate: new Date().toISOString(),
      quantity: 1,
      costBasisType: 'total',
      category: 'General Collection',
      isFavorite: false,
      status: 'in_collection',
      obverseImage:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><circle cx="200" cy="200" r="180" fill="%231e293b" stroke="%23d4af37" stroke-width="8"/><circle cx="200" cy="200" r="150" fill="%230f172a" stroke="%23f59e0b" stroke-width="2" stroke-dasharray="8 6"/><text x="200" y="215" font-family="sans-serif" font-size="70" font-weight="bold" fill="%23d4af37" text-anchor="middle">₵</text></svg>',
      valuationHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditCoin(dummyNewCoin);
  };

  const handleSeedDemoCoins = async () => {
    await loadDemoCoins();
  };

  const showQuotaBanner = Boolean(user && isQuotaExceeded && !quotaBannerDismissed && !storageError);

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col pb-20 lg:pb-8 overflow-x-hidden">
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Visible Storage / Quota / Persistence Alert Banner */}
      {(storageError || showQuotaBanner) && (
        <div
          role="alert"
          className={`border-b py-2.5 px-3 sm:px-6 text-xs ${
            cloudSyncStatus === 'reconnecting' || showQuotaBanner
              ? 'bg-amber-950/90 border-amber-600/60 text-amber-100'
              : 'bg-rose-950/90 border-rose-600/60 text-rose-100'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
              <AlertTriangle
                className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${
                  cloudSyncStatus === 'reconnecting' || showQuotaBanner ? 'text-amber-400' : 'text-rose-400'
                }`}
              />
              <div className="font-medium break-words min-w-0">
                <strong className={cloudSyncStatus === 'reconnecting' || showQuotaBanner ? 'text-amber-300' : 'text-rose-300'}>
                  {showQuotaBanner
                    ? 'Cloud Sync Paused (Daily Quota):'
                    : cloudSyncStatus === 'reconnecting'
                    ? 'Cloud Sync Reconnecting:'
                    : 'Storage Alert:'}
                </strong>{' '}
                {storageError ||
                  'Firebase daily free-tier read quota reached. Your coins stay saved on this device until tomorrow’s reset.'}
                {isQuotaExceeded && (
                  <a
                    href={FIRESTORE_QUOTA_CONSOLE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 ml-2 underline text-amber-300 hover:text-amber-200 font-semibold whitespace-nowrap"
                  >
                    Open Firebase Console
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {user && (cloudSyncStatus === 'error' || cloudSyncStatus === 'reconnecting') && (
                <button
                  type="button"
                  disabled={retryingSync}
                  onClick={async () => {
                    setRetryingSync(true);
                    try {
                      await retryCloudSync();
                    } finally {
                      setRetryingSync(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-slate-100 font-semibold transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingSync ? 'animate-spin' : ''}`} />
                  <span>{retryingSync ? 'Syncing...' : 'Retry Sync'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (storageError) clearStorageError();
                  else setQuotaBannerDismissed(true);
                }}
                aria-label="Dismiss storage alert"
                className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Vault Demo Seed Bar */}
      {coins.length === 0 && (
        <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 border-b border-amber-500/20 py-2 px-4 text-xs">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <div className="flex items-center gap-2 text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Want to explore with sample specimens? Load example Morgan Dollar &amp; Gold Sovereign demo records (isolated from real inventory).
              </span>
            </div>
            <button
              type="button"
              onClick={handleSeedDemoCoins}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold transition-colors shrink-0 cursor-pointer"
            >
              Load Demo Coins
            </button>
          </div>
        </div>
      )}

      {/* Main View Router */}
      <main className="flex-1">
        {activeTab === 'dashboard' && (
          <DashboardView
            onScanClick={() => setActiveTab('scan')}
            onOpenCoin={handleOpenCoin}
            onViewCollection={() => setActiveTab('collection')}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'scan' && (
          <ScanCoinView
            onSuccessSave={(coin) => {
              setActiveTab('collection');
              setSelectedCoin(coin);
            }}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'collection' && (
          <CollectionView
            onScanClick={() => setActiveTab('scan')}
            onOpenCoin={handleOpenCoin}
            onEditCoin={handleEditCoin}
            onAddManualCoin={handleAddManualCoin}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'valuations' && (
          <ValuationsView
            onOpenCoin={handleOpenCoin}
            onScanClick={() => setActiveTab('scan')}
          />
        )}

        {activeTab === 'search' && (
          <CoinSearchView onScanClick={() => setActiveTab('scan')} />
        )}

        {activeTab === 'settings' && (
          <SettingsView onOpenAuth={() => setAuthModalOpen(true)} />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Global Modals */}
      <FirstRunCurrencyModal />

      <CoinDetailModal
        coin={selectedCoin}
        onClose={() => setSelectedCoin(null)}
        onReturnToGallery={() => {
          setSelectedCoin(null);
          setActiveTab('collection');
        }}
        onSelectCoin={(coin) => setSelectedCoin(coin)}
        onEdit={(coin) => {
          setEditCoin(coin);
        }}
      />

      <CoinEditModal
        coin={editCoin}
        isOpen={!!editCoin}
        onClose={() => setEditCoin(null)}
        onSave={(updated) => {
          setSelectedCoin(updated);
        }}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CollectionProvider>
        <MainApp />
      </CollectionProvider>
    </AuthProvider>
  );
}
