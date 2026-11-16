import React, { useState } from 'react';
import { CloudUpload, Check, X, ShieldAlert, FileJson, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';

interface GuestMigrationBannerProps {
  onOpenAuth?: () => void;
}

export const GuestMigrationBanner: React.FC<GuestMigrationBannerProps> = ({ onOpenAuth }) => {
  const { user } = useAuth();
  const { includeSampleCoins, hasGuestCoins, migrateGuestCoins, exportCollection } = useCollection();
  const [migrating, setMigrating] = useState(false);
  const [migrationSuccess, setMigrationSuccess] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Scenario 1: Authenticated user has guest coins from a previous anonymous session to import
  if (user && hasGuestCoins && migrationSuccess === null) {
    const handleMigrate = async () => {
      try {
        setMigrating(true);
        const res = await migrateGuestCoins();
        setMigrationSuccess(res.count);
      } catch (err) {
        console.error('Migration failed:', err);
      } finally {
        setMigrating(false);
      }
    };

    return (
      <div className="relative mx-3 sm:mx-6 my-2.5 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <CloudUpload className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-amber-300">
              Local Guest Coins Found
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-relaxed">
              You saved coins on this device before signing in. Import them into your account now?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
          >
            Later
          </button>
          <button
            type="button"
            disabled={migrating}
            onClick={handleMigrate}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>{migrating ? 'Importing...' : 'Import to Account'}</span>
          </button>
        </div>
      </div>
    );
  }

  // Scenario 2: Successful migration notification
  if (migrationSuccess !== null) {
    return (
      <div className="mx-3 sm:mx-6 my-2.5 p-3 rounded-2xl bg-emerald-950/90 border border-emerald-600/60 text-emerald-200 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">
            Successfully imported {migrationSuccess} guest coin{migrationSuccess === 1 ? '' : 's'} into your collection!
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMigrationSuccess(null)}
          className="text-emerald-400 hover:text-white p-1 cursor-pointer"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Scenario 3: Plain-language device storage reminder for guest users
  if (!user) {
    return (
      <div className="mx-3 sm:mx-6 my-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-slate-200 leading-snug">
            Saved on this device. Back up your collection or sign in to keep it safe.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportCollection('json', includeSampleCoins)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5 shrink-0" />
            <span>Back Up JSON</span>
          </button>

          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Sign In</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-300 cursor-pointer"
            aria-label="Dismiss reminder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
