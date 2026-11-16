import React, { useState } from 'react';
import { Search, Camera, Info, Layers, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, CURRENCY_LABELS } from '../utils/formatters';

interface CoinSearchViewProps {
  onScanClick: () => void;
}

interface IssueVariety {
  name: string;
  years: string;
  composition: string;
  fineness: number;
  conditionAssumption: string;
  lowEstimateUSD: number;
  highEstimateUSD: number;
  medianEstimateUSD: number;
  referenceSource: string;
  referenceDate: string;
}

interface ReferenceCoin {
  series: string;
  country: string;
  years: string;
  denomination: string;
  weightGrams: number;
  diameterMm: number;
  keyDates: string[];
  rarity: string;
  description: string;
  varieties: IssueVariety[];
}

const REFERENCE_CATALOG: ReferenceCoin[] = [
  {
    series: 'Morgan Silver Dollar',
    country: 'United States',
    years: '1878 – 1921',
    denomination: '$1.00 USD',
    weightGrams: 26.73,
    diameterMm: 38.1,
    keyDates: ['1889-CC', '1893-S', '1895 Proof', '1895-O'],
    rarity: 'Common to Ultra-Rare Key Dates',
    description: 'Designed by George T. Morgan. Struck at Philadelphia, New Orleans, Carson City, San Francisco, and Denver (1921 only).',
    varieties: [
      {
        name: 'Pre-1904 Classic Issues (1878–1904)',
        years: '1878–1904',
        composition: '90% Silver, 10% Copper (0.7734 oz ASW)',
        fineness: 0.9,
        conditionAssumption: 'AU-50 About Uncirculated comp baseline',
        lowEstimateUSD: 45.0,
        highEstimateUSD: 75.0,
        medianEstimateUSD: 55.0,
        referenceSource: 'PCGS Price Guide / Heritage Archives',
        referenceDate: 'Oct 2025',
      },
      {
        name: '1921 Final Issue (Pittman Act)',
        years: '1921',
        composition: '90% Silver, 10% Copper (0.7734 oz ASW)',
        fineness: 0.9,
        conditionAssumption: 'MS-63 Choice Uncirculated',
        lowEstimateUSD: 40.0,
        highEstimateUSD: 70.0,
        medianEstimateUSD: 52.0,
        referenceSource: 'Numismatic News / Heritage Sales',
        referenceDate: 'Nov 2025',
      },
    ],
  },
  {
    series: 'Peace Silver Dollar',
    country: 'United States',
    years: '1921 – 1935',
    denomination: '$1.00 USD',
    weightGrams: 26.73,
    diameterMm: 38.1,
    keyDates: ['1921 High Relief', '1928 Philadelphia', '1934-S'],
    rarity: 'Common to Scarce',
    description: 'Commemorating peace following World War I, designed by Anthony de Francisci.',
    varieties: [
      {
        name: 'Standard Issue (1922–1935)',
        years: '1922–1935',
        composition: '90% Silver, 10% Copper',
        fineness: 0.9,
        conditionAssumption: 'MS-62 Mint State baseline',
        lowEstimateUSD: 35.0,
        highEstimateUSD: 60.0,
        medianEstimateUSD: 44.0,
        referenceSource: 'NGC Coin Explorer',
        referenceDate: 'Nov 2025',
      },
      {
        name: '1921 High Relief First Year',
        years: '1921',
        composition: '90% Silver, 10% Copper',
        fineness: 0.9,
        conditionAssumption: 'AU-55 Choice About Uncirculated',
        lowEstimateUSD: 240.0,
        highEstimateUSD: 480.0,
        medianEstimateUSD: 330.0,
        referenceSource: 'Stacks Bowers Comp Archive',
        referenceDate: 'Sep 2025',
      },
    ],
  },
  {
    series: 'Australian Pre-Decimal Florin',
    country: 'Australia',
    years: '1910 – 1963',
    denomination: 'Two Shillings (Florin)',
    weightGrams: 11.31,
    diameterMm: 28.5,
    keyDates: ['1932 Florin', '1934-35 Victoria Centenary', '1927 Canberra'],
    rarity: 'Scarce to Very Rare',
    description: 'Features the Australian Coat of Arms and British monarch effigies from Edward VII through Elizabeth II.',
    varieties: [
      {
        name: 'Sterling Silver Period (1910–1945)',
        years: '1910–1945',
        composition: '92.5% Sterling Silver, 7.5% Copper (0.3364 oz ASW)',
        fineness: 0.925,
        conditionAssumption: 'VF-20 to XF-40 Average Circulated',
        lowEstimateUSD: 35.0,
        highEstimateUSD: 110.0,
        medianEstimateUSD: 65.0,
        referenceSource: 'Renniks Australian Coin & Banknote Values 32nd Ed.',
        referenceDate: '2025',
      },
      {
        name: 'Debased Post-War 50% Silver (1946–1963)',
        years: '1946–1963',
        composition: '50% Silver, 40% Copper, 5% Zinc, 5% Nickel (0.1818 oz ASW)',
        fineness: 0.5,
        conditionAssumption: 'XF to AU Condition',
        lowEstimateUSD: 14.0,
        highEstimateUSD: 32.0,
        medianEstimateUSD: 20.0,
        referenceSource: 'Renniks Australian Coin Values',
        referenceDate: '2025',
      },
    ],
  },
  {
    series: 'British Gold Sovereign',
    country: 'United Kingdom',
    years: '1817 – Present',
    denomination: 'One Sovereign (£1)',
    weightGrams: 7.988,
    diameterMm: 22.05,
    keyDates: ['1819 Sovereign', '1859 Ansell', '1917 London', '1937 Edward VIII'],
    rarity: 'Bullion Floor to Ultra Key Date',
    description: 'Features Benedetto Pistrucci’s depiction of Saint George slaying the Dragon with 22K gold purity.',
    varieties: [
      {
        name: 'George V Sovereign (1911–1936)',
        years: '1911–1936',
        composition: '22K Gold (.9167 Fineness, 0.2354 oz AGW)',
        fineness: 0.9167,
        conditionAssumption: 'AU-58 / Uncirculated bullion basis',
        lowEstimateUSD: 680.0,
        highEstimateUSD: 780.0,
        medianEstimateUSD: 720.0,
        referenceSource: 'Spink London / LBMA Gold Benchmark',
        referenceDate: 'Nov 2025',
      },
      {
        name: 'Victorian Jubilee & Veiled Head (1887–1901)',
        years: '1887–1901',
        composition: '22K Gold (.9167 Fineness, 0.2354 oz AGW)',
        fineness: 0.9167,
        conditionAssumption: 'EF to AU Circulated',
        lowEstimateUSD: 690.0,
        highEstimateUSD: 820.0,
        medianEstimateUSD: 740.0,
        referenceSource: 'Spink & Son Numismatic Catalogue',
        referenceDate: '2025',
      },
    ],
  },
  {
    series: 'Roman Silver Denarius',
    country: 'Roman Empire',
    years: '211 BC – 244 AD',
    denomination: '1 Denarius',
    weightGrams: 3.9,
    diameterMm: 18.0,
    keyDates: ['Julius Caesar Elephant', 'Augustus Pax', 'Marcus Aurelius', 'Tiberius Tribute Penny'],
    rarity: 'Scarce to Museum Grade',
    description: 'The standard silver currency of ancient Rome for over four hundred years.',
    varieties: [
      {
        name: 'High Empire Imperial Issues (Trajan to Marcus Aurelius)',
        years: '98–180 AD',
        composition: 'Silver (approx 80–90% fineness)',
        fineness: 0.85,
        conditionAssumption: 'Very Fine (VF) ancient strike quality',
        lowEstimateUSD: 95.0,
        highEstimateUSD: 240.0,
        medianEstimateUSD: 145.0,
        referenceSource: 'Roman Imperial Coinage (RIC) / CNG Sales',
        referenceDate: '2025',
      },
      {
        name: 'Severan Dynasty Debased Issues (193–235 AD)',
        years: '193–235 AD',
        composition: 'Silver (approx 50% fineness debasement)',
        fineness: 0.5,
        conditionAssumption: 'Fine to Very Fine',
        lowEstimateUSD: 60.0,
        highEstimateUSD: 130.0,
        medianEstimateUSD: 85.0,
        referenceSource: 'Classical Numismatic Group (CNG)',
        referenceDate: '2025',
      },
    ],
  },
  {
    series: 'Saint-Gaudens Double Eagle',
    country: 'United States',
    years: '1907 – 1933',
    denomination: '$20.00 USD',
    weightGrams: 33.436,
    diameterMm: 34.0,
    keyDates: ['1907 High Relief', '1927-D', '1933 Double Eagle'],
    rarity: 'Key Date to Ultra-Rare',
    description: 'Acclaimed by art historians as one of the finest coins ever struck in the Americas.',
    varieties: [
      {
        name: 'Motto Type Standard Issue (1908–1933)',
        years: '1908–1933',
        composition: '90% Gold, 10% Copper (.9675 oz AGW)',
        fineness: 0.9,
        conditionAssumption: 'MS-63 Choice Uncirculated',
        lowEstimateUSD: 2750.0,
        highEstimateUSD: 3100.0,
        medianEstimateUSD: 2880.0,
        referenceSource: 'PCGS Price Guide / Heritage Floor Comps',
        referenceDate: 'Nov 2025',
      },
      {
        name: 'No Motto First Year (1907–1908)',
        years: '1907–1908',
        composition: '90% Gold, 10% Copper (.9675 oz AGW)',
        fineness: 0.9,
        conditionAssumption: 'MS-63 Choice Uncirculated',
        lowEstimateUSD: 2900.0,
        highEstimateUSD: 3400.0,
        medianEstimateUSD: 3050.0,
        referenceSource: 'Heritage Auctions Archives',
        referenceDate: 'Oct 2025',
      },
    ],
  },
];

export const CoinSearchView: React.FC<CoinSearchViewProps> = ({ onScanClick }) => {
  const { currency } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'silver' | 'gold' | 'ancient'>('all');
  const [selectedVarietyIdx, setSelectedVarietyIdx] = useState<Record<string, number>>({});

  const filteredCatalog = REFERENCE_CATALOG.filter((coin) => {
    const matchesSearch =
      coin.series.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coin.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coin.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coin.denomination.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedFilter === 'silver') {
      return coin.varieties.some((v) => v.composition.toLowerCase().includes('silver'));
    }
    if (selectedFilter === 'gold') {
      return coin.varieties.some((v) => v.composition.toLowerCase().includes('gold'));
    }
    if (selectedFilter === 'ancient') {
      return coin.country.toLowerCase().includes('roman') || coin.years.includes('BC');
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-400">
              Verified Catalogue Reference
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">
              {CURRENCY_LABELS[currency]?.name || currency} ({currency})
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl font-bold font-serif-title text-slate-100 mt-0.5">
            Coin Catalogue & Historical Series
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Inspect qualified market ranges, condition assumptions, and composition changes across major world series.
          </p>
        </div>

        <button
          type="button"
          onClick={onScanClick}
          className="min-h-[44px] w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md whitespace-nowrap transition-all cursor-pointer"
        >
          <Camera className="w-4 h-4 shrink-0" />
          <span>Scan This Coin</span>
        </button>
      </div>

      {/* Search Input and Type Filters */}
      <div className="bg-slate-900/70 p-3.5 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            type="search"
            placeholder="Search series by name, monarch, country, composition..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
          {(['all', 'silver', 'gold', 'ancient'] as const).map((filter) => (
            <button
              type="button"
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl capitalize font-semibold whitespace-nowrap shrink-0 transition-colors ${
                selectedFilter === filter
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {filter === 'all' ? 'All Series' : `${filter} Coins`}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog Cards Grid with Issue / Variety Switcher */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {filteredCatalog.map((coin, idx) => {
          const varietyIdx = selectedVarietyIdx[coin.series] || 0;
          const currentVariety = coin.varieties[varietyIdx] || coin.varieties[0];

          return (
            <div
              key={idx}
              className="p-4 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 shadow-lg space-y-4 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header Info */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs text-amber-400 font-semibold">
                      {coin.country} · {coin.years}
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold font-serif-title text-slate-100 mt-0.5">
                      {coin.series}
                    </h3>
                    <span className="text-xs text-slate-400 block">{coin.denomination}</span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-500 block">Qualified Range ({currency})</span>
                    <div className="text-base sm:text-lg font-bold text-amber-400 font-mono-num">
                      {formatCurrency(currentVariety.lowEstimateUSD, currency, true)} – {formatCurrency(currentVariety.highEstimateUSD, currency, true)}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono-num">
                      Median: {formatCurrency(currentVariety.medianEstimateUSD, currency, true)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {coin.description}
                </p>

                {/* Material Variety / Issue Selector if series spans multiple issues */}
                {coin.varieties.length > 1 && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Select Issue Variety to View Qualified Valuation:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {coin.varieties.map((v, vIdx) => (
                        <button
                          type="button"
                          key={vIdx}
                          onClick={() =>
                            setSelectedVarietyIdx((prev) => ({
                              ...prev,
                              [coin.series]: vIdx,
                            }))
                          }
                          className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            varietyIdx === vIdx
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Condition Assumptions & Source Notes */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Condition Assumption</span>
                    <span className="text-slate-300 font-medium">{currentVariety.conditionAssumption}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Catalogue Source</span>
                    <span className="text-slate-400 truncate">{currentVariety.referenceSource} ({currentVariety.referenceDate})</span>
                  </div>
                </div>

                {/* Technical Specs */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Composition</span>
                    <span className="font-semibold text-slate-200 block truncate">{currentVariety.composition}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Weight & Diameter</span>
                    <span className="font-semibold text-slate-200 font-mono-num block">
                      {coin.weightGrams}g · {coin.diameterMm}mm
                    </span>
                  </div>
                </div>

                {/* Key Dates */}
                <div className="pt-1 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                    Notable Key Dates:
                  </span>
                  <p className="font-mono-num text-amber-300 font-semibold text-[11px]">
                    {coin.keyDates.join(' · ')}
                  </p>
                </div>
              </div>

              {/* Action Button: Consistent "Scan this coin" */}
              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={onScanClick}
                  className="min-h-[38px] flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan this coin</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
