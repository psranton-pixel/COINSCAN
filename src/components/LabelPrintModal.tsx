import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Sliders,
  Check,
  AlertTriangle,
  Info,
  Layers,
  ChevronRight,
  QrCode,
} from 'lucide-react';
import type { CoinRecord, LabelTemplate } from '../types/coin';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import {
  generateLabelsPdf,
  generateCalibrationSheetPdf,
  exportSingleLabelPng,
  exportLabelsCsv,
  generateBarcodeDataUrl,
  getCoinLabelPrice,
  validateLabelLayout,
  resolveBarcodePayload,
} from '../services/labelService';
import { formatCoinValue } from '../utils/currency';

interface LabelPrintModalProps {
  coinsToPrint: CoinRecord[];
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export const LabelPrintModal: React.FC<LabelPrintModalProps> = ({
  coinsToPrint,
  isOpen,
  onClose,
  onOpenSettings,
}) => {
  const { currency } = useAuth();
  const { labelTemplate, updateLabelTemplate, allocateBarcodeIdForCoin } = useCollection();

  const [activeTemplate, setActiveTemplate] = useState<LabelTemplate>({ ...labelTemplate });
  const [copiesMode, setCopiesMode] = useState<'single' | 'quantity'>('single');
  const [startSlotIndex, setStartSlotIndex] = useState<number>(activeTemplate.startPosition || 0);
  const [isExporting, setIsExporting] = useState(false);
  const [isAllocatingIds, setIsAllocatingIds] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTemplate({ ...labelTemplate });
      setStartSlotIndex(labelTemplate.startPosition || 0);
      setExportError(null);
      setExportMessage(null);
    }
  }, [isOpen, labelTemplate]);

  if (!isOpen || coinsToPrint.length === 0) return null;

  const totalSlots = Math.max(1, activeTemplate.labelsAcross * activeTemplate.labelsDown);

  const configuredTemplate: LabelTemplate = {
    ...activeTemplate,
    startPosition: Math.max(0, Math.min(totalSlots - 1, startSlotIndex)),
    copiesPerRecord: copiesMode === 'quantity' ? 'quantity' : 1,
  };

  const layoutValidation = validateLabelLayout(configuredTemplate, coinsToPrint);

  const totalLabelsToPrint = coinsToPrint.reduce((acc, c) => {
    return acc + (copiesMode === 'quantity' ? Math.max(1, c.quantity || 1) : 1);
  }, 0);

  const totalPages = Math.max(1, Math.ceil((configuredTemplate.startPosition + totalLabelsToPrint) / totalSlots));

  const coinsMissingBarcodeId = coinsToPrint.filter((c) => !c.barcodeId);
  const firstPayload = resolveBarcodePayload(coinsToPrint[0], configuredTemplate);
  const firstPriceUSD = getCoinLabelPrice(coinsToPrint[0]);

  const handleToggleCompactBarcodeId = async (enabled: boolean) => {
    const next = { ...activeTemplate, useShortBarcodeId: enabled };
    setActiveTemplate(next);
    updateLabelTemplate({ useShortBarcodeId: enabled });
  };

  const handleAllocateMissingBarcodeIds = async () => {
    setIsAllocatingIds(true);
    setExportError(null);
    try {
      for (const coin of coinsMissingBarcodeId) {
        await allocateBarcodeIdForCoin(coin.id);
      }
      setActiveTemplate((prev) => ({ ...prev, useShortBarcodeId: true }));
      updateLabelTemplate({ useShortBarcodeId: true });
      setExportMessage(
        `Linked compact immutable Barcode IDs for ${coinsMissingBarcodeId.length} coin${coinsMissingBarcodeId.length === 1 ? '' : 's'}. Full SKUs remain intact.`
      );
      setTimeout(() => setExportMessage(null), 5000);
    } catch (err: any) {
      setExportError(err?.message || 'Failed to allocate compact Barcode IDs.');
    } finally {
      setIsAllocatingIds(false);
    }
  };

  const handleDownloadSheetPdf = async () => {
    if (!layoutValidation.valid) {
      setExportError(layoutValidation.errors[0] || 'Label layout exceeds paper bounds.');
      return;
    }
    setExportError(null);
    try {
      setIsExporting(true);
      const doc = await generateLabelsPdf(coinsToPrint, configuredTemplate, currency);
      doc.save(`coinscan_labels_sheet_${activeTemplate.presetId}_${new Date().toISOString().split('T')[0]}.pdf`);
      setExportMessage('Sheet PDF downloaded! Print at 100% / Actual Size.');
      setTimeout(() => setExportMessage(null), 5000);
    } catch (err: any) {
      console.error('Failed to generate sheet PDF:', err);
      setExportError(err?.message || 'Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSinglePdf = async () => {
    setExportError(null);
    const singleTemplate: LabelTemplate = {
      ...activeTemplate,
      paperSize: 'Continuous',
      paperWidthMm: activeTemplate.labelWidthMm + (activeTemplate.marginLeftMm || 1) * 2,
      paperHeightMm: activeTemplate.labelHeightMm + (activeTemplate.marginTopMm || 1) * 2,
      marginRightMm: activeTemplate.marginLeftMm || 1,
      marginBottomMm: activeTemplate.marginTopMm || 1,
      gapHorizontalMm: 0,
      gapVerticalMm: 0,
      labelsAcross: 1,
      labelsDown: 1,
      startPosition: 0,
      copiesPerRecord: 1,
    };
    const singleValidation = validateLabelLayout(singleTemplate, [coinsToPrint[0]]);
    if (!singleValidation.valid) {
      setExportError(singleValidation.errors[0] || 'Single label dimensions invalid.');
      return;
    }
    try {
      setIsExporting(true);
      const doc = await generateLabelsPdf([coinsToPrint[0]], singleTemplate, currency);
      const safeSku = (coinsToPrint[0].sku || coinsToPrint[0].barcodeId || 'label').replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`coinscan_single_label_${safeSku}.pdf`);
      setExportMessage('Single thermal label PDF downloaded! Print at 100% / Actual Size.');
      setTimeout(() => setExportMessage(null), 5000);
    } catch (err: any) {
      console.error('Failed to generate single PDF:', err);
      setExportError(err?.message || 'Failed to generate single label PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPng = async () => {
    setExportError(null);
    try {
      setIsExporting(true);
      await exportSingleLabelPng(coinsToPrint[0], configuredTemplate, currency);
      setExportMessage('High-resolution 300 DPI PNG exported!');
      setTimeout(() => setExportMessage(null), 5000);
    } catch (err: any) {
      console.error('Failed to export PNG:', err);
      setExportError(err?.message || 'Could not export PNG.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = () => {
    exportLabelsCsv(coinsToPrint, currency);
    setExportMessage('Label data CSV exported!');
    setTimeout(() => setExportMessage(null), 5000);
  };

  const handlePrintCalibration = () => {
    if (!layoutValidation.valid) {
      setExportError(layoutValidation.errors[0] || 'Cannot generate calibration sheet while dimensions overflow.');
      return;
    }
    setExportError(null);
    const doc = generateCalibrationSheetPdf(configuredTemplate);
    doc.save(`coinscan_calibration_sheet_${activeTemplate.paperSize}.pdf`);
    setExportMessage('Calibration test sheet downloaded! Print at 100% / Actual Size and measure alignment.');
    setTimeout(() => setExportMessage(null), 6000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col my-auto max-h-[92dvh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-print-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="label-print-modal-title" className="text-base sm:text-lg font-bold text-slate-100 font-serif-title truncate">
                Print Inventory Labels
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {coinsToPrint.length} coin{coinsToPrint.length === 1 ? '' : 's'} selected · {layoutValidation.totalGridWidthMm.toFixed(1)}×{layoutValidation.totalGridHeightMm.toFixed(1)} mm on {activeTemplate.paperSize}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close label print modal"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-200 text-xs sm:text-sm">
          {exportMessage && (
            <div className="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportMessage}</span>
            </div>
          )}

          {exportError && (
            <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          {/* Blocking Sheet Dimension Validation Error */}
          {!layoutValidation.valid && (
            <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>PDF Export Blocked — Layout Exceeds Sheet Bounds</span>
                </span>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-2.5 py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Fix Dimensions
                  </button>
                )}
              </div>
              <ul className="list-disc list-inside text-[11px] text-rose-200/90 space-y-0.5">
                {layoutValidation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Barcode Width / Compact Barcode ID Recommendation */}
          {layoutValidation.warnings.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-950/50 border border-amber-700/70 text-amber-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block">Barcode Width & SKU Notice</strong>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5">
                    {layoutValidation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {coinsMissingBarcodeId.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAllocateMissingBarcodeIds}
                    disabled={isAllocatingIds}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>
                      {isAllocatingIds
                        ? 'Allocating...'
                        : `Link Short Barcode IDs (${coinsMissingBarcodeId.length} missing)`}
                    </span>
                  </button>
                )}
                <label className="flex items-center gap-2 text-[11px] text-amber-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(activeTemplate.useShortBarcodeId)}
                    onChange={(e) => handleToggleCompactBarcodeId(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-amber-700"
                  />
                  <span>Encode short Barcode ID (CS…) in bars while showing full SKU text</span>
                </label>
              </div>
            </div>
          )}

          {/* 100% / Actual Size Instruction */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-amber-200 block">Critical Printing Scale Rule:</strong>
              <p className="text-slate-300">
                Print at <strong>100% / Actual Size</strong> (never "Fit to Page" or "Shrink to Printable Area") and disable browser <strong>Headers & Footers</strong> so physical label alignment matches to the millimeter.
              </p>
            </div>
          </div>

          {/* Configuration Controls Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Copies Per Record
              </label>
              <select
                value={copiesMode}
                onChange={(e) => setCopiesMode(e.target.value as 'single' | 'quantity')}
                className="w-full min-h-[42px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="single">1 label per coin record ({coinsToPrint.length} total)</option>
                <option value="quantity">Match coin inventory quantity ({totalLabelsToPrint} total)</option>
              </select>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Active Label Layout
                </label>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Edit Designer</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="min-h-[42px] px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{activeTemplate.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    Left {activeTemplate.marginLeftMm}mm · Top {activeTemplate.marginTopMm}mm · Gap {activeTemplate.gapHorizontalMm}×{activeTemplate.gapVerticalMm}mm
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  {activeTemplate.labelWidthMm}×{activeTemplate.labelHeightMm}mm
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Start Position (Partial Sheets)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={totalSlots}
                  value={configuredTemplate.startPosition + 1}
                  onChange={(e) => {
                    const slot1 = Math.max(1, Math.min(totalSlots, parseInt(e.target.value) || 1));
                    setStartSlotIndex(slot1 - 1);
                  }}
                  className="w-20 min-h-[42px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-slate-400">
                  {configuredTemplate.startPosition > 0
                    ? `Skip first ${configuredTemplate.startPosition} slot${configuredTemplate.startPosition === 1 ? '' : 's'}`
                    : 'Slot #1 (Top-left)'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Sheet Layout Grid Preview */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-slate-200 text-xs">
                  Sheet Layout Preview ({activeTemplate.labelsAcross} × {activeTemplate.labelsDown} · {totalPages} page{totalPages === 1 ? '' : 's'})
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Tap any slot to skip already-used labels
              </span>
            </div>

            <div
              style={{
                gridTemplateColumns: `repeat(${activeTemplate.labelsAcross}, minmax(0, 1fr))`,
              }}
              className="grid gap-1.5 p-3 bg-slate-900 rounded-xl border border-slate-800 max-w-xl mx-auto"
            >
              {Array.from({ length: totalSlots }).map((_, slotIdx) => {
                const isSkipped = slotIdx < configuredTemplate.startPosition;
                const coinOffset = slotIdx - configuredTemplate.startPosition;
                const hasLabel = coinOffset >= 0 && coinOffset < totalLabelsToPrint;
                const isStart = slotIdx === configuredTemplate.startPosition;
                const col = slotIdx % activeTemplate.labelsAcross;
                const row = Math.floor(slotIdx / activeTemplate.labelsAcross);
                const slotX = activeTemplate.marginLeftMm + col * (activeTemplate.labelWidthMm + activeTemplate.gapHorizontalMm) + (activeTemplate.offsetXOffsetMm || 0);
                const slotY = activeTemplate.marginTopMm + row * (activeTemplate.labelHeightMm + activeTemplate.gapVerticalMm) + (activeTemplate.offsetYOffsetMm || 0);

                return (
                  <button
                    key={slotIdx}
                    type="button"
                    onClick={() => setStartSlotIndex(slotIdx)}
                    className={`min-h-[44px] rounded-lg border text-[10px] font-mono flex flex-col items-center justify-center p-1 transition-all cursor-pointer ${
                      isStart
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200 ring-2 ring-amber-400/40'
                        : isSkipped
                        ? 'bg-slate-950/50 border-slate-800 text-slate-600 line-through'
                        : hasLabel
                        ? 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-amber-500/50'
                        : 'bg-slate-950 border-dashed border-slate-800 text-slate-500'
                    }`}
                    title={`Slot #${slotIdx + 1} (R${row + 1}C${col + 1} · X:${slotX.toFixed(1)}mm, Y:${slotY.toFixed(1)}mm — ${isSkipped ? 'Already Peeled / Skipped' : hasLabel ? 'Will print' : 'Empty'})`}
                  >
                    <span className="font-bold">#{slotIdx + 1}</span>
                    <span className="text-[9px] truncate max-w-full">
                      {isSkipped ? 'Skip' : hasLabel ? 'Print' : 'Empty'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Single Label Detail Preview */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-200 text-xs">
                First Label Sample: {coinsToPrint[0].title}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Barcode encodes: <strong className="text-amber-300">{firstPayload.barcodeValue}</strong>
              </span>
            </div>

            <div className="p-2.5 bg-white text-slate-950 rounded-xl max-w-sm mx-auto shadow-lg space-y-1 border border-slate-300">
              {activeTemplate.showItemName && (
                <div className="w-full font-black text-base sm:text-lg leading-[1.1] text-black tracking-tight break-words">
                  {coinsToPrint[0].title}
                </div>
              )}
              <div className="text-[10px] font-semibold text-slate-700 flex flex-wrap gap-x-1.5 leading-tight">
                {activeTemplate.showYear && coinsToPrint[0].year && <span>{coinsToPrint[0].year}</span>}
                {activeTemplate.showDenomination && coinsToPrint[0].denomination && <span>· {coinsToPrint[0].denomination}</span>}
                {activeTemplate.showMintMark && coinsToPrint[0].mintMark && <span>[{coinsToPrint[0].mintMark}]</span>}
                {activeTemplate.showGrade && <span>· {coinsToPrint[0].estimatedGradeRange || coinsToPrint[0].estimatedGrade || 'Provisional'}</span>}
                {activeTemplate.showStorageLocation && coinsToPrint[0].storageLocation && (
                  <span>· Loc:{coinsToPrint[0].storageLocation}</span>
                )}
              </div>
              {activeTemplate.showAskingPrice && firstPriceUSD !== undefined && (
                <div className="text-2xl sm:text-3xl font-black text-black leading-none tracking-tight pt-0.5">
                  {formatCoinValue(firstPriceUSD, currency, undefined, false)}
                </div>
              )}
              {activeTemplate.showSku !== false && (
                <div className="w-full font-mono font-black text-sm sm:text-base text-black tracking-tight leading-tight break-all">
                  {firstPayload.displaySku}
                </div>
              )}
              {activeTemplate.showBarcode && (
                <div className="pt-0.5">
                  <img
                    src={generateBarcodeDataUrl(
                      firstPayload.barcodeValue,
                      activeTemplate.barcodeHeightMm || 8,
                      activeTemplate.showSku === false && activeTemplate.showBarcodeText
                    )}
                    alt="Code 128 Barcode"
                    className="h-8 w-full object-fill"
                  />
                  {firstPayload.usedShortId && (
                    <div className="text-[8px] font-mono text-slate-500 text-center">
                      ID: {firstPayload.barcodeValue}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintCalibration}
              disabled={!layoutValidation.valid}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              title="Print millimeter grid alignment calibration test sheet"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Calibration Sheet</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export CSV for third-party thermal barcode printer software"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            {coinsToPrint.length === 1 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadSinglePdf}
                  disabled={isExporting}
                  className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45"
                  title="Print single continuous thermal label PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Single Thermal PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPng}
                  disabled={isExporting}
                  className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45"
                  title="Export 300 DPI high-res label PNG"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>Label PNG</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleDownloadSheetPdf}
              disabled={isExporting || !layoutValidation.valid}
              title={!layoutValidation.valid ? 'Fix sheet dimension errors first.' : 'Download Sheet PDF with vector Code 128 barcodes'}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating PDF...' : `Download Sheet PDF (${totalLabelsToPrint})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

