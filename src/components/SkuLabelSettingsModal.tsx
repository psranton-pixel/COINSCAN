import React, { useState, useEffect } from 'react';
import {
  X,
  Barcode,
  Check,
  AlertTriangle,
  Info,
  RotateCcw,
  Printer,
  Sparkles,
  Tag,
  Eye,
  ShieldCheck,
  QrCode,
} from 'lucide-react';
import { useCollection } from '../context/CollectionContext';
import { useAuth } from './../context/AuthContext';
import {
  DEFAULT_SKU_SETTINGS,
  SKU_PRESETS,
  explainSkuSegments,
  formatSku,
} from '../services/skuService';
import {
  DEFAULT_LABEL_TEMPLATE,
  LABEL_PRESETS,
  PAPER_SIZES,
  validateLabelLayout,
  generateBarcodeDataUrl,
  getCoinLabelPrice,
  resolveBarcodePayload,
} from '../services/labelService';
import type {
  CoinRecord,
  LabelPresetId,
  LabelTemplate,
  PaperSize,
  SkuAttribute,
  SkuSettings,
  SkuSettingsPreset,
} from '../types/coin';
import { formatCoinValue, toUsdAmount } from '../utils/currency';

interface SkuLabelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleCoin?: CoinRecord;
}

export const SkuLabelSettingsModal: React.FC<SkuLabelSettingsModalProps> = ({
  isOpen,
  onClose,
  sampleCoin,
}) => {
  const { currency } = useAuth();
  const { coins, skuSettings, updateSkuSettings, labelTemplate, updateLabelTemplate } = useCollection();

  const [activeTab, setActiveTab] = useState<'sku' | 'label'>('sku');

  // Local draft state
  const [localSku, setLocalSku] = useState<SkuSettings>({ ...skuSettings });
  const [localLabel, setLocalLabel] = useState<LabelTemplate>({ ...labelTemplate });
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSku({ ...skuSettings });
      setLocalLabel({ ...labelTemplate });
      setSaveSuccessMsg(null);
    }
  }, [isOpen, skuSettings, labelTemplate]);

  // Selected coin for live preview
  const [previewCoinIndex, setPreviewCoinIndex] = useState(0);
  const sampleFallbackCoin: CoinRecord = {
    id: 'sample_preview',
    owner_user_id: 'guest',
    title: '1966 Australian 50 Cents (Round Silver)',
    country: 'Australia',
    denomination: '50 Cents',
    currency: 'USD',
    year: 1966,
    mintMark: '',
    series: 'Decimal Transition',
    metalCategory: 'silver',
    metalComposition: '80% Silver, 20% Copper',
    fineness: 0.8,
    weightGrams: 13.28,
    diameterMm: 31.5,
    rarity: 'Scarce',
    estimatedGrade: 'Choice Uncirculated (MS-63)',
    conditionDetails: 'Original mint bloom with high rim detail.',
    historicalSignificance: 'Only year round 50 cent coin was issued before rising silver prices forced switch to dodecagonal cupro-nickel.',
    estimatedValue: 28.0,
    lowValue: 22.0,
    highValue: 35.0,
    faceValue: '50c AUD',
    valuationMethodology: 'comparable_sales',
    evidenceQuality: 'high_confidence',
    valuationDate: new Date().toISOString(),
    quantity: 1,
    costBasisType: 'per_coin',
    purchasePrice: 18.0,
    purchaseCurrency: 'AUD',
    purchaseDate: '2024-03-12',
    category: 'Australian Decimals',
    isFavorite: true,
    status: 'in_collection',
    storageLocation: localSku.defaultStorageLocation || 'Vault 1',
    askingPrice: 32.0,
    askingCurrency: 'AUD',
    sku: 'COIN-AUS-1966-50C-000001',
    barcodeId: 'CS000001',
    obverseImage:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" fill="%231e293b" stroke="%23f59e0b" stroke-width="4"/><text x="100" y="110" font-family="sans-serif" font-size="28" font-weight="bold" fill="%23f59e0b" text-anchor="middle">1966</text></svg>',
    valuationHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const previewCoin =
    sampleCoin || (coins.length > 0 ? coins[previewCoinIndex % coins.length] : sampleFallbackCoin);

  if (!isOpen) return null;

  // SKU Live Preview
  const previewSequenceNum = Math.max(1, localSku.startingSequence || 1);
  const liveSkuString = formatSku(previewCoin, previewSequenceNum, localSku);
  const liveSegments = explainSkuSegments(previewCoin, previewSequenceNum, localSku);

  const previewBarcodeSource = {
    ...previewCoin,
    sku: previewCoin.sku || liveSkuString,
    barcodeId: previewCoin.barcodeId || 'CS000001',
  };
  const resolvedPreviewBarcode = resolveBarcodePayload(previewBarcodeSource, localLabel);

  // Label Layout Validation with live coin barcode density check
  const layoutValidation = validateLabelLayout(localLabel, [previewBarcodeSource]);

  const handleApplyPreset = (presetId: SkuSettingsPreset) => {
    const found = SKU_PRESETS.find((p) => p.id === presetId);
    if (found && found.config) {
      setLocalSku((prev) => ({
        ...prev,
        ...found.config,
        preset: presetId,
      }));
    }
  };

  const handleApplyLabelPreset = (presetId: LabelPresetId) => {
    const found = LABEL_PRESETS.find((p) => p.id === presetId);
    if (found && found.template) {
      setLocalLabel((prev) => ({
        ...prev,
        ...found.template,
        name: found.name,
        presetId,
        id: prev.id,
      }));
    }
  };

  const toggleAttribute = (attr: SkuAttribute) => {
    setLocalSku((prev) => {
      const exists = prev.attributes.includes(attr);
      const newAttrs = exists ? prev.attributes.filter((a) => a !== attr) : [...prev.attributes, attr];
      return {
        ...prev,
        attributes: newAttrs,
        preset: 'custom',
      };
    });
  };

  const handleSaveAll = () => {
    if (!layoutValidation.valid) {
      setActiveTab('label');
      return;
    }
    updateSkuSettings(localSku);
    updateLabelTemplate(localLabel);
    setSaveSuccessMsg('Settings saved successfully!');
    setTimeout(() => {
      setSaveSuccessMsg(null);
      onClose();
    }, 1000);
  };

  const handleResetToDefaults = () => {
    if (activeTab === 'sku') {
      setLocalSku({ ...DEFAULT_SKU_SETTINGS });
    } else {
      setLocalLabel({ ...DEFAULT_LABEL_TEMPLATE });
    }
  };

  const previewLabelPriceUSD = getCoinLabelPrice(previewCoin);
  const previewCostUSD =
    previewCoin.purchasePrice && previewCoin.purchasePrice > 0
      ? toUsdAmount(previewCoin.purchasePrice, previewCoin.purchaseCurrency || 'USD')
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col my-auto max-h-[92dvh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sku-label-modal-title"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
              <Barcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="sku-label-modal-title" className="text-base sm:text-lg font-bold text-slate-100 font-serif-title truncate">
                SKU & Label Printing Settings
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Configure inventory SKU rules, physical sheet geometry, and barcode payload formatting.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close SKU and label settings"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/90 px-4 sm:px-6 pt-2 shrink-0 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sku')}
            className={`min-h-[44px] px-4 py-2 border-b-2 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sku'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>SKU Numbering Rules</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('label')}
            className={`min-h-[44px] px-4 py-2 border-b-2 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'label'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Label Template Designer</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs sm:text-sm">
          {saveSuccessMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* TAB 1: SKU Settings */}
          {activeTab === 'sku' && (
            <div className="space-y-6">
              {/* Presets Cards */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  SKU Format Presets
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SKU_PRESETS.map((preset) => {
                    const isSelected = localSku.preset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-bold text-xs ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                            {preset.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{preset.description}</p>
                        <div className="mt-2.5 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-amber-300 font-bold truncate">
                          {preset.example}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Preview Box with Segment Explanations */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-amber-500/30 shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-slate-200 text-xs">Live Generated SKU Preview</span>
                  </div>
                  {coins.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPreviewCoinIndex((prev) => (prev + 1) % coins.length)}
                      className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Switch Preview Coin</span>
                    </button>
                  )}
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 truncate max-w-xs">{previewCoin.title}</span>
                  <span className="text-base sm:text-lg font-bold font-mono text-amber-400 tracking-wider break-all">
                    {liveSkuString}
                  </span>
                </div>

                {/* Segment breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  {liveSegments.map((seg, idx) => (
                    <div key={idx} className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                      <span className="text-slate-400 text-[10px] block font-semibold">{seg.label}</span>
                      <span className="font-mono font-bold text-amber-300 block mt-0.5 truncate">{seg.segment}</span>
                      <span className="text-slate-500 text-[9px] block truncate mt-0.5">{seg.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Configuration Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Product Prefix</label>
                  <input
                    type="text"
                    value={localSku.prefix}
                    onChange={(e) => setLocalSku({ ...localSku, prefix: e.target.value.toUpperCase() })}
                    placeholder="COIN"
                    maxLength={10}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500 uppercase"
                  />
                  <span className="text-[10px] text-slate-500 block">Leading identifier on every label (e.g. COIN, APEX, SPEC).</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Segment Separator</label>
                  <select
                    value={localSku.separator}
                    onChange={(e) => setLocalSku({ ...localSku, separator: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="-">Hyphen (-)</option>
                    <option value="_">Underscore (_)</option>
                    <option value=".">Period (.)</option>
                    <option value="">None (Concatenated)</option>
                  </select>
                  <span className="text-[10px] text-slate-500 block">Character separating SKU elements.</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Starting Sequence Number</label>
                  <input
                    type="number"
                    min={1}
                    value={localSku.startingSequence}
                    onChange={(e) => setLocalSku({ ...localSku, startingSequence: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Current highest allocated: #{localSku.highestAllocatedSequence || 0}. Numbers are never reused.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Sequence Padding Digits</label>
                  <select
                    value={localSku.sequencePadding}
                    onChange={(e) => setLocalSku({ ...localSku, sequencePadding: parseInt(e.target.value) || 6 })}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value={4}>4 digits (e.g. 0001)</option>
                    <option value={5}>5 digits (e.g. 00001)</option>
                    <option value={6}>6 digits (e.g. 000001 - Recommended)</option>
                    <option value={8}>8 digits (e.g. 00000001)</option>
                  </select>
                  <span className="text-[10px] text-slate-500 block">Zero-padding keeps barcodes of uniform width.</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Default Storage Location</label>
                  <input
                    type="text"
                    value={localSku.defaultStorageLocation}
                    onChange={(e) => setLocalSku({ ...localSku, defaultStorageLocation: e.target.value })}
                    placeholder="Vault 1"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 block">Pre-filled location for newly cataloged items.</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Attribute Abbreviation Length</label>
                  <select
                    value={localSku.abbreviationLength}
                    onChange={(e) => setLocalSku({ ...localSku, abbreviationLength: parseInt(e.target.value) || 3 })}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value={2}>2 characters (e.g. US, AU)</option>
                    <option value={3}>3 characters (e.g. USA, AUS - Standard)</option>
                    <option value={4}>4 characters (e.g. USAM, AUST)</option>
                  </select>
                  <span className="text-[10px] text-slate-500 block">Character length for country and series abbreviations.</span>
                </div>
              </div>

              {/* Attributes Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Included Coin Attributes
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'country' as SkuAttribute, label: 'Country (e.g. AUS)' },
                    { id: 'year' as SkuAttribute, label: 'Year (e.g. 1966)' },
                    { id: 'denomination' as SkuAttribute, label: 'Denomination (e.g. 50C)' },
                    { id: 'mintMark' as SkuAttribute, label: 'Mint Mark (if present)' },
                    { id: 'category' as SkuAttribute, label: 'Category' },
                  ].map((attr) => {
                    const isChecked = localSku.attributes.includes(attr.id);
                    return (
                      <label
                        key={attr.id}
                        className={`flex items-center gap-2.5 min-h-[44px] p-3 rounded-xl border cursor-pointer select-none transition-colors ${
                          isChecked ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAttribute(attr.id)}
                          className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-400"
                        />
                        <span className="font-semibold text-xs">{attr.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Storage In SKU Advisory Callout */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-amber-200">Storage in SKU Recommendation:</strong>
                    <p className="text-slate-300">
                      Keeping physical storage as an editable record field allows you to move coins between boxes and vaults without invalidating printed barcodes.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={localSku.includeStorageInSku}
                    onChange={(e) =>
                      setLocalSku({
                        ...localSku,
                        includeStorageInSku: e.target.checked,
                        attributes: e.target.checked
                          ? [...localSku.attributes.filter((a) => a !== 'storageLocation'), 'storageLocation']
                          : localSku.attributes.filter((a) => a !== 'storageLocation'),
                      })
                    }
                    className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-400"
                  />
                  <span className="font-semibold">Encode storage location in SKU anyway</span>
                </label>
              </div>

              {/* Automatic Generation on Save Toggle */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-slate-200 text-xs block">Automatic SKU Generation</span>
                  <span className="text-[11px] text-slate-400 block">
                    Automatically generate and assign a sequential SKU when adding a new coin to collection.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={localSku.autoGenerateOnSave}
                    onChange={(e) => setLocalSku({ ...localSku, autoGenerateOnSave: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: Label Template Designer */}
          {activeTab === 'label' && (
            <div className="space-y-6">
              {/* Presets Cards */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Verified Sheet & Thermal Presets
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {LABEL_PRESETS.map((preset) => {
                    const isSelected = localLabel.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyLabelPreset(preset.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold text-xs ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                            {preset.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exact Sheet Dimension Math Summary */}
              <div
                className={`p-3 rounded-2xl border text-xs space-y-1 ${
                  layoutValidation.valid
                    ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/60 border-rose-700 text-rose-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    Computed Sheet Grid: {layoutValidation.totalGridWidthMm.toFixed(2)} × {layoutValidation.totalGridHeightMm.toFixed(2)} mm
                  </span>
                  <span className="font-mono text-[11px]">
                    Paper Limit: {localLabel.paperWidthMm.toFixed(1)} × {localLabel.paperHeightMm.toFixed(1)} mm (
                    {layoutValidation.valid ? 'Fits Sheet' : 'Overflow — Export Blocked'})
                  </span>
                </div>
                <div className="font-mono text-[10px] opacity-85">
                  Cols X: {Array.from({ length: localLabel.labelsAcross }, (_, c) =>
                    (localLabel.marginLeftMm + c * (localLabel.labelWidthMm + localLabel.gapHorizontalMm) + (localLabel.offsetXOffsetMm || 0)).toFixed(1)
                  ).join(', ')} mm · Rows Y: {Array.from({ length: localLabel.labelsDown }, (_, r) =>
                    (localLabel.marginTopMm + r * (localLabel.labelHeightMm + localLabel.gapVerticalMm) + (localLabel.offsetYOffsetMm || 0)).toFixed(1)
                  ).join(', ')} mm
                </div>
              </div>

              {/* Blocking Validation Errors */}
              {!layoutValidation.valid && (
                <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Layout Exceeds Paper Dimensions — Save & PDF Export Disabled</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-rose-200/90 pl-1 space-y-1">
                    {layoutValidation.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Non-Blocking Barcode / Legibility Warnings */}
              {layoutValidation.warnings.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-950/50 border border-amber-700/70 text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Barcode Readability & Margin Notice</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 pl-1 space-y-1">
                    {layoutValidation.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Compact Barcode ID Mode */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-slate-200 text-xs">
                      Encode Compact Immutable Barcode ID When Available
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Never truncates your full SKU. Prints full SKU text cleanly while encoding compact linked ID (e.g. CS000001) into wider, easier-to-scan Code 128 bars.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(localLabel.useShortBarcodeId)}
                    onChange={(e) => setLocalLabel({ ...localLabel, useShortBarcodeId: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Interactive Visual Label Preview */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-amber-400" />
                    <span>Physical Label Preview (Single Unit)</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {localLabel.labelWidthMm} × {localLabel.labelHeightMm} mm ({localLabel.labelsAcross} across × {localLabel.labelsDown} down)
                  </span>
                </div>

                <div className="flex justify-center p-4 bg-slate-900/90 rounded-xl border border-slate-800 overflow-x-auto">
                  <div
                    style={{
                      width: `${Math.min(360, localLabel.labelWidthMm * 4.2)}px`,
                      minHeight: `${Math.max(120, localLabel.labelHeightMm * 4.2)}px`,
                    }}
                    className={`bg-white text-slate-950 rounded-lg p-2.5 shadow-2xl flex flex-col justify-between transition-all select-none ${
                      localLabel.showBorder ? 'border border-dashed border-slate-400' : 'border border-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5 w-full">
                      {localLabel.showBusinessName && localLabel.businessName && (
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          {localLabel.businessName}
                        </div>
                      )}
                      {localLabel.showItemName && (
                        <div className="w-full font-black text-sm sm:text-base text-black leading-[1.1] tracking-tight break-words">
                          {previewCoin.title}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-1.5 text-[9.5px] text-slate-700 font-semibold leading-tight">
                        {localLabel.showYear && <span>{previewCoin.year}</span>}
                        {localLabel.showDenomination && <span>· {previewCoin.denomination}</span>}
                        {localLabel.showMintMark && previewCoin.mintMark && <span>[{previewCoin.mintMark}]</span>}
                        {localLabel.showCountry && <span>· {previewCoin.country}</span>}
                        {localLabel.showGrade && (previewCoin.estimatedGradeRange || previewCoin.estimatedGrade) && (
                          <span>· {previewCoin.estimatedGradeRange || previewCoin.estimatedGrade}</span>
                        )}
                        {localLabel.showStorageLocation && previewCoin.storageLocation && (
                          <span>· Loc:{previewCoin.storageLocation}</span>
                        )}
                        {localLabel.showQuantity && previewCoin.quantity > 1 && (
                          <span>· Qty:{previewCoin.quantity}</span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between gap-2 pt-0.5">
                        {localLabel.showAskingPrice && previewLabelPriceUSD !== undefined && (
                          <div className="text-xl sm:text-2xl font-black text-black leading-none tracking-tight">
                            {formatCoinValue(previewLabelPriceUSD, currency, undefined, false)}
                          </div>
                        )}
                        {localLabel.showPurchaseCost && previewCostUSD !== undefined && (
                          <div className="text-[9px] font-bold font-mono text-slate-600 ml-auto">
                            Cost: {formatCoinValue(previewCostUSD, currency, undefined, false)}
                          </div>
                        )}
                      </div>

                      {localLabel.showSku !== false && (
                        <div className="w-full font-mono font-black text-xs sm:text-sm text-black tracking-tight leading-tight break-all">
                          {resolvedPreviewBarcode.displaySku}
                        </div>
                      )}
                    </div>

                    {localLabel.showBarcode && (
                      <div className="pt-1 mt-auto w-full">
                        <img
                          src={generateBarcodeDataUrl(
                            resolvedPreviewBarcode.barcodeValue,
                            localLabel.barcodeHeightMm,
                            localLabel.showSku === false && localLabel.showBarcodeText
                          )}
                          alt="Code 128 Barcode Preview"
                          className="h-8 w-full object-fill"
                        />
                        {resolvedPreviewBarcode.usedShortId && (
                          <div className="text-[8px] font-mono text-slate-500 text-center">
                            Barcode ID: {resolvedPreviewBarcode.barcodeValue}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Paper, Label & Independent Margin/Gap Geometry */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Paper Format</label>
                  <select
                    value={localLabel.paperSize}
                    onChange={(e) => {
                      const pSize = e.target.value as PaperSize;
                      const dims = PAPER_SIZES[pSize];
                      setLocalLabel({
                        ...localLabel,
                        presetId: 'custom',
                        paperSize: pSize,
                        paperWidthMm: pSize === 'Custom' ? localLabel.paperWidthMm : dims.widthMm,
                        paperHeightMm: pSize === 'Custom' ? localLabel.paperHeightMm : dims.heightMm,
                      });
                    }}
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="Letter">US Letter (215.9 × 279.4 mm)</option>
                    <option value="Continuous">Thermal Roll / Single</option>
                    <option value="Custom">Custom Sheet Size</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Paper Width (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={20}
                    max={500}
                    disabled={localLabel.paperSize === 'A4' || localLabel.paperSize === 'Letter'}
                    value={localLabel.paperWidthMm}
                    onChange={(e) =>
                      setLocalLabel({
                        ...localLabel,
                        presetId: 'custom',
                        paperWidthMm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Paper Height (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={15}
                    max={500}
                    disabled={localLabel.paperSize === 'A4' || localLabel.paperSize === 'Letter'}
                    value={localLabel.paperHeightMm}
                    onChange={(e) =>
                      setLocalLabel({
                        ...localLabel,
                        presetId: 'custom',
                        paperHeightMm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Barcode Height (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={5}
                    max={25}
                    value={localLabel.barcodeHeightMm}
                    onChange={(e) =>
                      setLocalLabel({
                        ...localLabel,
                        barcodeHeightMm: Math.max(5, parseFloat(e.target.value) || 8),
                      })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Label Width (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={15}
                    max={250}
                    value={localLabel.labelWidthMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', labelWidthMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Label Height (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={10}
                    max={250}
                    value={localLabel.labelHeightMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', labelHeightMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Columns Across</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={localLabel.labelsAcross}
                    onChange={(e) =>
                      setLocalLabel({
                        ...localLabel,
                        presetId: 'custom',
                        labelsAcross: Math.max(1, parseInt(e.target.value) || 1),
                      })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Rows Down</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={localLabel.labelsDown}
                    onChange={(e) =>
                      setLocalLabel({
                        ...localLabel,
                        presetId: 'custom',
                        labelsDown: Math.max(1, parseInt(e.target.value) || 1),
                      })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                {/* Independently Editable Margins & Gaps */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Top Margin (mm)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={localLabel.marginTopMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', marginTopMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Bottom Margin (mm)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={localLabel.marginBottomMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', marginBottomMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Left Margin (mm)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={localLabel.marginLeftMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', marginLeftMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Right Margin (mm)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={localLabel.marginRightMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', marginRightMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Horiz Gap (mm)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={localLabel.gapHorizontalMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', gapHorizontalMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Vert Gap (mm)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={localLabel.gapVerticalMm}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, presetId: 'custom', gapVerticalMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Calib. X Offset (mm)</label>
                  <input
                    type="number"
                    step="0.2"
                    min={-15}
                    max={15}
                    value={localLabel.offsetXOffsetMm || 0}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, offsetXOffsetMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Calib. Y Offset (mm)</label>
                  <input
                    type="number"
                    step="0.2"
                    min={-15}
                    max={15}
                    value={localLabel.offsetYOffsetMm || 0}
                    onChange={(e) =>
                      setLocalLabel({ ...localLabel, offsetYOffsetMm: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100"
                  />
                </div>
              </div>

              {/* Content Toggles Checklist */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Label Content Fields
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { key: 'showItemName' as const, label: 'Item Name (Full-Width Bold)' },
                    { key: 'showAskingPrice' as const, label: 'Price (Big Bold)' },
                    { key: 'showSku' as const, label: 'SKU Text (Big Bold)' },
                    { key: 'showBarcode' as const, label: 'Code 128 Vector Barcode' },
                    { key: 'showYear' as const, label: 'Mintage Year' },
                    { key: 'showDenomination' as const, label: 'Denomination' },
                    { key: 'showMintMark' as const, label: 'Mint Mark' },
                    { key: 'showCountry' as const, label: 'Country' },
                    { key: 'showGrade' as const, label: 'Provisional/Certified Grade' },
                    { key: 'showStorageLocation' as const, label: 'Storage Location' },
                    { key: 'showPurchaseCost' as const, label: 'Cost Basis (Confidential — Off by Default)' },
                    { key: 'showQuantity' as const, label: 'Quantity (if > 1)' },
                    { key: 'showBorder' as const, label: 'Cut Line Border' },
                  ].map((field) => (
                    <label
                      key={field.key}
                      className="flex items-center gap-2 min-h-[40px] p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer select-none text-slate-300 hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(localLabel[field.key])}
                        onChange={(e) => setLocalLabel({ ...localLabel, [field.key]: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-400"
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Strict Privacy Notice for Cost Basis & Profit */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Cost Basis & Profit Off by Default</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Purchase cost and profit are omitted from customer-facing labels by default so flip holders and price tags never expose private acquisition costs.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between shrink-0 gap-3">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset {activeTab === 'sku' ? 'SKU' : 'Label'} Defaults</span>
          </button>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={!layoutValidation.valid}
              title={!layoutValidation.valid ? 'Fix sheet dimension errors before saving.' : 'Save SKU and label template settings'}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>Save & Apply Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

