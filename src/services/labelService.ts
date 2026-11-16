import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import type {
  CoinRecord,
  CurrencyCode,
  LabelPresetId,
  LabelTemplate,
  LabelValidationResult,
  PaperSize,
} from '../types/coin';
import { formatCoinValue, toUsdAmount } from '../utils/currency';
import { estimateCode128PhysicalFit } from './skuService';

export const PAPER_SIZES: Record<PaperSize, { widthMm: number; heightMm: number; name: string }> = {
  A4: { widthMm: 210, heightMm: 297, name: 'A4 (210 × 297 mm)' },
  Letter: { widthMm: 215.9, heightMm: 279.4, name: 'US Letter (8.5 × 11 in)' },
  Continuous: { widthMm: 54, heightMm: 28, name: 'Single / Continuous Thermal Roll' },
  Custom: { widthMm: 210, heightMm: 297, name: 'Custom Dimensions' },
};

export const LABEL_PRESETS: { id: LabelPresetId; name: string; description: string; template: Partial<LabelTemplate> }[] = [
  {
    id: 'a4_24_66x32',
    name: '66 × 32 mm (A4 3×8, 24 Labels)',
    description: 'Exact 24-up A4 portrait sheet (Left 6 mm, Top 12 mm, Gap 3 × 3 mm = 210.0 × 297.0 mm).',
    template: {
      presetId: 'a4_24_66x32',
      paperSize: 'A4',
      paperWidthMm: 210,
      paperHeightMm: 297,
      labelWidthMm: 66,
      labelHeightMm: 32,
      labelsAcross: 3,
      labelsDown: 8,
      marginTopMm: 12,
      marginBottomMm: 8,
      marginLeftMm: 6,
      marginRightMm: 0,
      gapHorizontalMm: 3,
      gapVerticalMm: 3,
      orientation: 'portrait',
      showBorder: false,
      fontSize: 'medium',
      textAlign: 'left',
      barcodeHeightMm: 8.5,
      showBarcodeText: true,
      useShortBarcodeId: false,
      copiesPerRecord: 1,
      startPosition: 0,
      offsetXOffsetMm: 0,
      offsetYOffsetMm: 0,
      showItemName: true,
      showSku: true,
      showBarcode: true,
      showStorageLocation: true,
      showCountry: true,
      showYear: true,
      showDenomination: true,
      showMintMark: true,
      showGrade: true,
      showQuantity: false,
      showAskingPrice: true,
      showCoinPhoto: false,
      showBusinessName: false,
      businessName: '',
      showQrCode: false,
      showPurchaseCost: false,
      showProfit: false,
    },
  },
  {
    id: 'a4_24_66x33',
    name: '66 × 33.8 mm (A4 3×8, 24 Labels)',
    description: '24-up A4 sheet (4.65 mm side margins, 1.35 mm horizontal gap = 210.0 × 297.0 mm exact fit).',
    template: {
      presetId: 'a4_24_66x33',
      paperSize: 'A4',
      paperWidthMm: 210,
      paperHeightMm: 297,
      labelWidthMm: 66,
      labelHeightMm: 33.8,
      labelsAcross: 3,
      labelsDown: 8,
      marginTopMm: 13.3,
      marginBottomMm: 13.3,
      marginLeftMm: 4.65,
      marginRightMm: 4.65,
      gapHorizontalMm: 1.35,
      gapVerticalMm: 0,
      orientation: 'portrait',
      showBorder: false,
      fontSize: 'medium',
      textAlign: 'left',
      barcodeHeightMm: 9,
      showBarcodeText: true,
      useShortBarcodeId: false,
      copiesPerRecord: 1,
      startPosition: 0,
      offsetXOffsetMm: 0,
      offsetYOffsetMm: 0,
      showItemName: true,
      showSku: true,
      showBarcode: true,
      showStorageLocation: true,
      showCountry: true,
      showYear: true,
      showDenomination: true,
      showMintMark: true,
      showGrade: true,
      showQuantity: false,
      showAskingPrice: true,
      showCoinPhoto: false,
      showBusinessName: false,
      businessName: '',
      showQrCode: false,
      showPurchaseCost: false,
      showProfit: false,
    },
  },
  {
    id: 'a4_24_64x33',
    name: '64 × 33.8 mm (A4 3×8, 24 Labels)',
    description: 'Narrower 3-column A4 sheet (6.5 mm side margins, 2.5 mm horizontal gap = 210.0 × 297.0 mm exact fit).',
    template: {
      presetId: 'a4_24_64x33',
      paperSize: 'A4',
      paperWidthMm: 210,
      paperHeightMm: 297,
      labelWidthMm: 64,
      labelHeightMm: 33.8,
      labelsAcross: 3,
      labelsDown: 8,
      marginTopMm: 13.3,
      marginBottomMm: 13.3,
      marginLeftMm: 6.5,
      marginRightMm: 6.5,
      gapHorizontalMm: 2.5,
      gapVerticalMm: 0,
      orientation: 'portrait',
      showBorder: false,
      fontSize: 'medium',
      textAlign: 'left',
      barcodeHeightMm: 9,
      showBarcodeText: true,
      useShortBarcodeId: false,
      copiesPerRecord: 1,
      startPosition: 0,
      offsetXOffsetMm: 0,
      offsetYOffsetMm: 0,
      showItemName: true,
      showSku: true,
      showBarcode: true,
      showStorageLocation: true,
      showCountry: true,
      showYear: true,
      showDenomination: true,
      showMintMark: true,
      showGrade: true,
      showQuantity: false,
      showAskingPrice: true,
      showCoinPhoto: false,
      showBusinessName: false,
      businessName: '',
      showQrCode: false,
      showPurchaseCost: false,
      showProfit: false,
    },
  },
  {
    id: 'a4_8_99x67',
    name: '99.1 × 67.7 mm (A4 2×4, 8 Large Labels)',
    description: 'Large 8-up A4 sheet (4.65 mm side margins, 2.5 mm gap = 210.0 × 297.0 mm exact fit).',
    template: {
      presetId: 'a4_8_99x67',
      paperSize: 'A4',
      paperWidthMm: 210,
      paperHeightMm: 297,
      labelWidthMm: 99.1,
      labelHeightMm: 67.7,
      labelsAcross: 2,
      labelsDown: 4,
      marginTopMm: 13.1,
      marginBottomMm: 13.1,
      marginLeftMm: 4.65,
      marginRightMm: 4.65,
      gapHorizontalMm: 2.5,
      gapVerticalMm: 0,
      orientation: 'portrait',
      showBorder: true,
      fontSize: 'large',
      textAlign: 'left',
      barcodeHeightMm: 14,
      showBarcodeText: true,
      useShortBarcodeId: false,
      copiesPerRecord: 1,
      startPosition: 0,
      offsetXOffsetMm: 0,
      offsetYOffsetMm: 0,
      showItemName: true,
      showSku: true,
      showBarcode: true,
      showStorageLocation: true,
      showCountry: true,
      showYear: true,
      showDenomination: true,
      showMintMark: true,
      showGrade: true,
      showQuantity: false,
      showAskingPrice: true,
      showCoinPhoto: false,
      showBusinessName: false,
      businessName: '',
      showQrCode: false,
      showPurchaseCost: false,
      showProfit: false,
    },
  },
  {
    id: 'thermal_single_54x28',
    name: '54 × 28 mm (Single Thermal Label)',
    description: 'Compact single-label thermal printing (54.0 × 28.0 mm exact fit).',
    template: {
      presetId: 'thermal_single_54x28',
      paperSize: 'Continuous',
      paperWidthMm: 54,
      paperHeightMm: 28,
      labelWidthMm: 51,
      labelHeightMm: 25,
      labelsAcross: 1,
      labelsDown: 1,
      marginTopMm: 1.5,
      marginBottomMm: 1.5,
      marginLeftMm: 1.5,
      marginRightMm: 1.5,
      gapHorizontalMm: 0,
      gapVerticalMm: 0,
      orientation: 'landscape',
      showBorder: false,
      fontSize: 'small',
      textAlign: 'left',
      barcodeHeightMm: 8,
      showBarcodeText: true,
      useShortBarcodeId: false,
      copiesPerRecord: 1,
      startPosition: 0,
      offsetXOffsetMm: 0,
      offsetYOffsetMm: 0,
      showItemName: true,
      showSku: true,
      showBarcode: true,
      showStorageLocation: true,
      showCountry: false,
      showYear: true,
      showDenomination: true,
      showMintMark: true,
      showGrade: true,
      showQuantity: false,
      showAskingPrice: true,
      showCoinPhoto: false,
      showBusinessName: false,
      businessName: '',
      showQrCode: false,
      showPurchaseCost: false,
      showProfit: false,
    },
  },
  {
    id: 'thermal_single_50x25',
    name: '50 × 25 mm (Ultra-Compact Thermal)',
    description: 'Ultra-compact single label for 2×2 flips (50.0 × 25.0 mm exact fit).',
    template: {
      presetId: 'thermal_single_50x25',
      paperSize: 'Continuous',
      paperWidthMm: 50,
      paperHeightMm: 25,
      labelWidthMm: 48,
      labelHeightMm: 23,
      labelsAcross: 1,
      labelsDown: 1,
      marginTopMm: 1,
      marginBottomMm: 1,
      marginLeftMm: 1,
      marginRightMm: 1,
      gapHorizontalMm: 0,
      gapVerticalMm: 0,
      orientation: 'landscape',
      showBorder: false,
      fontSize: 'small',
      textAlign: 'left',
      barcodeHeightMm: 7,
      showBarcodeText: true,
      useShortBarcodeId: false,
      copiesPerRecord: 1,
      startPosition: 0,
      offsetXOffsetMm: 0,
      offsetYOffsetMm: 0,
      showItemName: true,
      showSku: true,
      showBarcode: true,
      showStorageLocation: true,
      showCountry: false,
      showYear: true,
      showDenomination: true,
      showMintMark: true,
      showGrade: false,
      showQuantity: false,
      showAskingPrice: false,
      showCoinPhoto: false,
      showBusinessName: false,
      businessName: '',
      showQrCode: false,
      showPurchaseCost: false,
      showProfit: false,
    },
  },
];

export const DEFAULT_LABEL_TEMPLATE: LabelTemplate = {
  id: 'default_template',
  name: 'A4 24-Up (66 × 32 mm)',
  presetId: 'a4_24_66x32',
  paperSize: 'A4',
  paperWidthMm: 210,
  paperHeightMm: 297,
  labelWidthMm: 66,
  labelHeightMm: 32,
  labelsAcross: 3,
  labelsDown: 8,
  marginTopMm: 12,
  marginBottomMm: 8,
  marginLeftMm: 6,
  marginRightMm: 0,
  gapHorizontalMm: 3,
  gapVerticalMm: 3,
  orientation: 'portrait',
  showBorder: false,
  fontSize: 'medium',
  textAlign: 'left',
  barcodeHeightMm: 8.5,
  showBarcodeText: true,
  useShortBarcodeId: false,
  copiesPerRecord: 1,
  startPosition: 0,
  offsetXOffsetMm: 0,
  offsetYOffsetMm: 0,
  showItemName: true,
  showSku: true,
  showBarcode: true,
  showStorageLocation: true,
  showCountry: true,
  showYear: true,
  showDenomination: true,
  showMintMark: true,
  showGrade: true,
  showQuantity: false,
  showAskingPrice: true,
  showCoinPhoto: false,
  showBusinessName: false,
  businessName: '',
  showQrCode: false,
  showPurchaseCost: false,
  showProfit: false,
};

/**
 * Resolves the exact barcode payload string WITHOUT ever truncating a SKU.
 * If Compact Barcode ID mode is active and the coin has a linked `barcodeId`, encodes `barcodeId`.
 */
export function resolveBarcodePayload(coin: CoinRecord, template: LabelTemplate): {
  barcodeValue: string;
  usedShortId: boolean;
  displaySku: string;
} {
  const fullSku = (coin.sku || '').trim();
  const shortId = (coin.barcodeId || '').trim();
  if (template.useShortBarcodeId && shortId) {
    return {
      barcodeValue: shortId,
      usedShortId: true,
      displaySku: fullSku || shortId,
    };
  }
  return {
    barcodeValue: fullSku || shortId || coin.id,
    usedShortId: false,
    displaySku: fullSku || shortId || 'NO-SKU',
  };
}

/**
 * Validates whether the configured label grid fits strictly within the selected paper dimensions
 * and evaluates physical barcode readability across target coins.
 */
export function validateLabelLayout(
  template: LabelTemplate,
  coinsToCheck?: CoinRecord[]
): LabelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (template.paperWidthMm <= 0 || template.paperHeightMm <= 0) {
    errors.push('Paper width and height must both be positive numbers.');
  }
  if (template.labelWidthMm <= 0 || template.labelHeightMm <= 0) {
    errors.push('Label width and height must both be positive numbers.');
  }
  if (template.labelsAcross < 1 || template.labelsDown < 1) {
    errors.push('Columns and rows per sheet must each be at least 1.');
  }
  if (
    template.marginLeftMm < 0 ||
    template.marginRightMm < 0 ||
    template.marginTopMm < 0 ||
    template.marginBottomMm < 0
  ) {
    errors.push('All page margins (left, right, top, bottom) must be 0 mm or greater.');
  }
  if (template.gapHorizontalMm < 0 || template.gapVerticalMm < 0) {
    errors.push('Horizontal and vertical label gaps must be 0 mm or greater.');
  }

  const totalGridWidthMm =
    template.marginLeftMm +
    template.marginRightMm +
    template.labelsAcross * template.labelWidthMm +
    Math.max(0, template.labelsAcross - 1) * template.gapHorizontalMm;

  const totalGridHeightMm =
    template.marginTopMm +
    template.marginBottomMm +
    template.labelsDown * template.labelHeightMm +
    Math.max(0, template.labelsDown - 1) * template.gapVerticalMm;

  // Strict dimension check (only allow 0.01 mm floating-point rounding epsilon)
  if (totalGridWidthMm > template.paperWidthMm + 0.01) {
    const excessMm = totalGridWidthMm - template.paperWidthMm;
    const maxHorizGap =
      template.labelsAcross > 1
        ? (template.paperWidthMm -
            template.marginLeftMm -
            template.marginRightMm -
            template.labelsAcross * template.labelWidthMm) /
          (template.labelsAcross - 1)
        : 0;
    const gapHint =
      template.labelsAcross > 1 && maxHorizGap >= 0
        ? ` Reduce horizontal gap to <= ${Math.max(0, Math.floor(maxHorizGap * 100) / 100).toFixed(2)} mm`
        : '';
    errors.push(
      `Total width (${totalGridWidthMm.toFixed(2)} mm) exceeds paper width (${template.paperWidthMm.toFixed(1)} mm) by ${excessMm.toFixed(2)} mm.${gapHint || ' Reduce left/right margins or label width.'}`
    );
  }

  if (totalGridHeightMm > template.paperHeightMm + 0.01) {
    const excessMm = totalGridHeightMm - template.paperHeightMm;
    const maxVertGap =
      template.labelsDown > 1
        ? (template.paperHeightMm -
            template.marginTopMm -
            template.marginBottomMm -
            template.labelsDown * template.labelHeightMm) /
          (template.labelsDown - 1)
        : 0;
    const gapHint =
      template.labelsDown > 1 && maxVertGap >= 0
        ? ` Reduce vertical gap to <= ${Math.max(0, Math.floor(maxVertGap * 100) / 100).toFixed(2)} mm`
        : '';
    errors.push(
      `Total height (${totalGridHeightMm.toFixed(2)} mm) exceeds paper height (${template.paperHeightMm.toFixed(1)} mm) by ${excessMm.toFixed(2)} mm.${gapHint || ' Reduce top/bottom margins or label height.'}`
    );
  }

  const totalSlots = template.labelsAcross * template.labelsDown;
  if ((template.startPosition || 0) < 0 || (template.startPosition || 0) >= totalSlots) {
    errors.push(`Starting label position (${(template.startPosition || 0) + 1}) must be between 1 and ${totalSlots}.`);
  }

  // Calibration offset overrun check
  if (template.offsetXOffsetMm) {
    const leftShifted = template.marginLeftMm + template.offsetXOffsetMm;
    const rightEndShifted = totalGridWidthMm - template.marginRightMm + template.offsetXOffsetMm;
    if (leftShifted < -0.01 || rightEndShifted > template.paperWidthMm + 0.01) {
      warnings.push(
        `Horizontal calibration offset (${template.offsetXOffsetMm > 0 ? '+' : ''}${template.offsetXOffsetMm} mm) pushes labels outside paper bounds.`
      );
    }
  }
  if (template.offsetYOffsetMm) {
    const topShifted = template.marginTopMm + template.offsetYOffsetMm;
    const bottomEndShifted = totalGridHeightMm - template.marginBottomMm + template.offsetYOffsetMm;
    if (topShifted < -0.01 || bottomEndShifted > template.paperHeightMm + 0.01) {
      warnings.push(
        `Vertical calibration offset (${template.offsetYOffsetMm > 0 ? '+' : ''}${template.offsetYOffsetMm} mm) pushes labels outside paper bounds.`
      );
    }
  }

  if (template.labelWidthMm < 35) {
    warnings.push('Label width is under 35 mm; Code 128 barcodes may scan poorly without compact Barcode IDs.');
  }
  if (template.labelHeightMm < 18) {
    warnings.push('Label height is under 18 mm; title or barcode text may become cramped.');
  }

  // Check physical barcode density across supplied coins (with generous padding accounted for)
  if (template.showBarcode && coinsToCheck && coinsToCheck.length > 0) {
    const padX = Math.max(1.2, Math.min(2.2, template.labelWidthMm * 0.025));
    const printableWidthMm = Math.max(10, template.labelWidthMm - padX * 2);
    for (const c of coinsToCheck) {
      const { barcodeValue } = resolveBarcodePayload(c, template);
      const fit = estimateCode128PhysicalFit(barcodeValue, printableWidthMm);
      if (!fit.fitsComfortably && fit.warning) {
        warnings.push(fit.warning);
        break; // Show concise representative warning rather than repeating per coin
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalGridWidthMm: Math.round(totalGridWidthMm * 100) / 100,
    totalGridHeightMm: Math.round(totalGridHeightMm * 100) / 100,
  };
}

/**
 * Generates Code 128 bit pattern via JsBarcode without requiring HTMLCanvasElement.
 * Guarantees zero truncation of the supplied payload string.
 */
export function encodeCode128Pattern(code: string): string {
  const cleanCode = (code || '').replace(/[^\x20-\x7E]/g, '').trim() || 'NO-SKU';
  const target: { encodings?: { data: string; text: string }[] } = {};
  JsBarcode(target as any, cleanCode, {
    format: 'CODE128',
    displayValue: false,
  });
  return target.encodings?.[0]?.data || '';
}

/**
 * Generates a crisp Code 128 barcode as PNG data URL for Canvas previews & PNG sticker downloads.
 */
export function generateBarcodeDataUrl(code: string, heightMm = 9, showText = true): string {
  const cleanCode = (code || '').replace(/[^\x20-\x7E]/g, '').trim() || 'NO-SKU';
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, cleanCode, {
      format: 'CODE128',
      width: 2,
      height: Math.max(30, Math.round(heightMm * 4)),
      displayValue: showText,
      font: 'monospace',
      fontOptions: 'bold',
      fontSize: 16,
      textMargin: 2,
      margin: 10, // Enforce clean >=10X quiet zones
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Barcode PNG generation failed for code:', cleanCode, err);
    return '';
  }
}

export async function generateQrCodeDataUrl(url: string): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: 160,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

/**
 * Resolves the label display price in base USD by converting askingPrice (in askingCurrency)
 * or falling back to estimatedValue / lowValue / highValue (in coin.currency).
 */
export function getCoinLabelPrice(coin: CoinRecord): number | undefined {
  if (typeof coin.askingPrice === 'number' && !isNaN(coin.askingPrice) && coin.askingPrice > 0) {
    return toUsdAmount(coin.askingPrice, coin.askingCurrency || 'USD');
  }
  const valCur = coin.currency || 'USD';
  if (typeof coin.estimatedValue === 'number' && !isNaN(coin.estimatedValue) && coin.estimatedValue > 0) {
    return toUsdAmount(coin.estimatedValue, valCur);
  }
  if (typeof coin.lowValue === 'number' && !isNaN(coin.lowValue) && coin.lowValue > 0) {
    return toUsdAmount(coin.lowValue, valCur);
  }
  if (typeof coin.highValue === 'number' && !isNaN(coin.highValue) && coin.highValue > 0) {
    return toUsdAmount(coin.highValue, valCur);
  }
  return undefined;
}

function ptToMm(pt: number): number {
  return pt * 0.352778;
}

function fitSingleLineFontPt(
  doc: jsPDF,
  text: string,
  maxWidthMm: number,
  minPt: number,
  maxPt: number,
  fontStyle: 'bold' | 'normal' = 'bold',
  fontName: 'helvetica' | 'courier' = 'helvetica'
): number {
  doc.setFont(fontName, fontStyle);
  for (let pt = maxPt; pt >= minPt; pt -= 0.5) {
    doc.setFontSize(pt);
    if (doc.getTextWidth(text) <= maxWidthMm) {
      return pt;
    }
  }
  return minPt;
}

function fitTitleBlockPdf(
  doc: jsPDF,
  title: string,
  maxWidthMm: number,
  maxHeightMm: number,
  minPt: number,
  maxPt: number
): { fontSize: number; lines: string[]; lineHeightMm: number } {
  doc.setFont('helvetica', 'bold');
  const cleanTitle = (title || 'Untitled Coin').trim();

  for (let pt = maxPt; pt >= minPt; pt -= 0.5) {
    doc.setFontSize(pt);
    const lines: string[] = doc.splitTextToSize(cleanTitle, maxWidthMm);
    const lineHeightMm = ptToMm(pt) * 1.12;
    if (lines.length <= 2 && lines.length * lineHeightMm <= maxHeightMm) {
      return { fontSize: pt, lines, lineHeightMm };
    }
  }

  doc.setFontSize(minPt);
  const fallbackLines: string[] = doc.splitTextToSize(cleanTitle, maxWidthMm);
  const trimmedLines = fallbackLines.slice(0, 2);
  if (fallbackLines.length > 2 && trimmedLines[1]) {
    let second = trimmedLines[1];
    while (second.length > 3 && doc.getTextWidth(`${second}…`) > maxWidthMm) {
      second = second.slice(0, -1);
    }
    trimmedLines[1] = `${second}…`;
  }
  return {
    fontSize: minPt,
    lines: trimmedLines,
    lineHeightMm: ptToMm(minPt) * 1.12,
  };
}

function fitSingleLineCanvasPx(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number,
  minPx: number,
  maxPx: number,
  fontTemplate: (px: number) => string
): number {
  for (let px = maxPx; px >= minPx; px -= 1) {
    ctx.font = fontTemplate(px);
    if (ctx.measureText(text).width <= maxWidthPx) {
      return px;
    }
  }
  return minPx;
}

function wrapTitleCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidthPx: number): string[] {
  const words = (text || 'Untitled Coin').trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidthPx) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitTitleBlockCanvas(
  ctx: CanvasRenderingContext2D,
  title: string,
  maxWidthPx: number,
  maxHeightPx: number,
  minPx: number,
  maxPx: number
): { fontPx: number; lines: string[]; lineHeightPx: number } {
  const cleanTitle = (title || 'Untitled Coin').trim();
  for (let px = maxPx; px >= minPx; px -= 1) {
    ctx.font = `900 ${px}px sans-serif`;
    const lines = wrapTitleCanvasLines(ctx, cleanTitle, maxWidthPx);
    const lineHeightPx = Math.round(px * 1.12);
    const widestFits = lines.every((l) => ctx.measureText(l).width <= maxWidthPx);
    if (lines.length <= 2 && widestFits && lines.length * lineHeightPx <= maxHeightPx) {
      return { fontPx: px, lines, lineHeightPx };
    }
  }

  ctx.font = `900 ${minPx}px sans-serif`;
  const fallback = wrapTitleCanvasLines(ctx, cleanTitle, maxWidthPx);
  const trimmed = fallback.slice(0, 2);
  if (fallback.length > 2 && trimmed[1]) {
    let second = trimmed[1];
    while (second.length > 3 && ctx.measureText(`${second}…`).width > maxWidthPx) {
      second = second.slice(0, -1);
    }
    trimmed[1] = `${second}…`;
  }
  return { fontPx: minPx, lines: trimmed, lineHeightPx: Math.round(minPx * 1.12) };
}

/**
 * Draws a crisp vector Code 128 barcode directly onto jsPDF with explicit 10X quiet zones
 * (or scaled proportionally within available width) so barcodes always render accurately in PDFs.
 */
function drawVectorCode128InPdf(
  doc: jsPDF,
  code: string,
  x: number,
  y: number,
  boxWidthMm: number,
  boxHeightMm: number
): void {
  const pattern = encodeCode128Pattern(code);
  if (!pattern) return;

  // Draw crisp white quiet zone backdrop first
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, boxWidthMm, boxHeightMm, 'F');

  const quietModules = 10; // Standard Code 128 requires >= 10X quiet zone on left and right
  const totalModules = pattern.length + quietModules * 2;
  const moduleMm = boxWidthMm / totalModules;
  const startX = x + quietModules * moduleMm;

  doc.setFillColor(0, 0, 0);
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '1') {
      let runEnd = i + 1;
      while (runEnd < pattern.length && pattern[runEnd] === '1') {
        runEnd++;
      }
      const barX = startX + i * moduleMm;
      const barW = (runEnd - i) * moduleMm;
      doc.rect(barX, y, barW, boxHeightMm, 'F');
      i = runEnd;
    } else {
      i++;
    }
  }
}

/**
 * Renders a single coin label onto an HTML5 Canvas at 300 DPI for PNG download & UI preview.
 */
export async function renderSingleLabelCanvas(
  coin: CoinRecord,
  template: LabelTemplate,
  currency: CurrencyCode = 'USD'
): Promise<HTMLCanvasElement> {
  const dpmm = 300 / 25.4;
  const widthPx = Math.round(template.labelWidthMm * dpmm);
  const heightPx = Math.round(template.labelHeightMm * dpmm);

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);

  if (template.showBorder) {
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(2, 2, widthPx - 4, heightPx - 4);
    ctx.setLineDash([]);
  }

  const padX = Math.round(Math.max(1.4, template.labelWidthMm * 0.025) * dpmm);
  const padY = Math.round(Math.max(1.2, template.labelHeightMm * 0.035) * dpmm);
  const availWidthPx = widthPx - padX * 2;
  let curY = padY;

  const { barcodeValue, displaySku } = resolveBarcodePayload(coin, template);
  const showSkuLine = template.showSku !== false && Boolean(displaySku);
  const effectivePriceUSD = getCoinLabelPrice(coin);
  const showPriceLine = Boolean(template.showAskingPrice && effectivePriceUSD !== undefined);

  const reserveBarcodePx = template.showBarcode
    ? Math.round(Math.min(template.barcodeHeightMm || 8, template.labelHeightMm * 0.28) * dpmm)
    : 0;
  const bottomLimitPx = heightPx - padY - (reserveBarcodePx > 0 ? reserveBarcodePx + Math.round(0.8 * dpmm) : 0);

  if (template.showBusinessName && template.businessName) {
    const bizPx = Math.round(Math.max(2.0, template.labelHeightMm * 0.06) * dpmm);
    ctx.fillStyle = '#555555';
    ctx.font = `bold ${bizPx}px sans-serif`;
    ctx.fillText(template.businessName.toUpperCase(), padX, curY + bizPx);
    curY += Math.round(bizPx * 1.25);
  }

  if (template.showItemName) {
    const maxTitleHeightPx = Math.round((bottomLimitPx - curY) * (showPriceLine || showSkuLine ? 0.34 : 0.65));
    const maxTitleFontPx = Math.round(Math.max(3.6, template.labelHeightMm * 0.145) * dpmm);
    const minTitleFontPx = Math.round(2.4 * dpmm);
    const { fontPx, lines, lineHeightPx } = fitTitleBlockCanvas(
      ctx,
      coin.title || 'Untitled Coin',
      availWidthPx,
      Math.max(minTitleFontPx, maxTitleHeightPx),
      minTitleFontPx,
      maxTitleFontPx
    );

    ctx.fillStyle = '#000000';
    ctx.font = `900 ${fontPx}px sans-serif`;
    lines.forEach((line) => {
      ctx.fillText(line, padX, curY + Math.round(fontPx * 0.88));
      curY += lineHeightPx;
    });
    curY += Math.round(0.6 * dpmm);
  }

  const metaParts: string[] = [];
  if (template.showYear && coin.year) metaParts.push(String(coin.year));
  if (template.showDenomination && coin.denomination) metaParts.push(coin.denomination);
  if (template.showMintMark && coin.mintMark) metaParts.push(`[${coin.mintMark}]`);
  if (template.showCountry && coin.country) metaParts.push(coin.country);
  if (template.showGrade && coin.estimatedGrade) metaParts.push(coin.estimatedGrade);
  if (template.showStorageLocation && coin.storageLocation) metaParts.push(`Loc:${coin.storageLocation}`);
  if (template.showQuantity && coin.quantity > 1) metaParts.push(`Qty:${coin.quantity}`);

  if (metaParts.length > 0 && curY + Math.round(2.5 * dpmm) < bottomLimitPx) {
    const metaText = metaParts.join(' · ');
    const metaMaxPx = Math.round(Math.max(2.0, template.labelHeightMm * 0.068) * dpmm);
    const metaMinPx = Math.round(1.6 * dpmm);
    const metaPx = fitSingleLineCanvasPx(ctx, metaText, availWidthPx, metaMinPx, metaMaxPx, (px) => `600 ${px}px sans-serif`);
    ctx.fillStyle = '#333333';
    ctx.font = `600 ${metaPx}px sans-serif`;
    ctx.fillText(metaText, padX, curY + Math.round(metaPx * 0.9), availWidthPx);
    curY += Math.round(metaPx * 1.25);
  }

  // Price converted cleanly to target currency (customer-facing default hides purchaseCost)
  const costUSD =
    template.showPurchaseCost && coin.purchasePrice !== undefined && coin.purchasePrice > 0
      ? toUsdAmount(coin.purchasePrice, coin.purchaseCurrency || 'USD')
      : undefined;

  if (showPriceLine && effectivePriceUSD !== undefined) {
    const priceStr = formatCoinValue(effectivePriceUSD, currency, undefined, false);
    const costStr = costUSD ? `Cost: ${formatCoinValue(costUSD, currency, undefined, false)}` : '';

    const remainingBeforeBarcode = Math.max(Math.round(4 * dpmm), bottomLimitPx - curY);
    const maxPricePx = Math.round(
      Math.min(remainingBeforeBarcode * (showSkuLine ? 0.52 : 0.85), Math.max(4.8, template.labelHeightMm * 0.19) * dpmm)
    );
    const minPricePx = Math.round(3.0 * dpmm);
    const costReservePx = costStr ? Math.round(availWidthPx * 0.35) : 0;
    const pricePx = fitSingleLineCanvasPx(
      ctx,
      priceStr,
      availWidthPx - costReservePx,
      minPricePx,
      maxPricePx,
      (px) => `900 ${px}px sans-serif`
    );

    ctx.fillStyle = '#000000';
    ctx.font = `900 ${pricePx}px sans-serif`;
    ctx.fillText(priceStr, padX, curY + Math.round(pricePx * 0.9));

    if (costStr) {
      const costPx = Math.round(Math.max(2.0 * dpmm, pricePx * 0.45));
      ctx.fillStyle = '#555555';
      ctx.font = `bold ${costPx}px monospace`;
      const costWidth = ctx.measureText(costStr).width;
      ctx.fillText(costStr, widthPx - padX - costWidth, curY + Math.round(pricePx * 0.85));
    }

    curY += Math.round(pricePx * 1.08);
  } else if (costUSD) {
    const costPx = Math.round(2.4 * dpmm);
    ctx.fillStyle = '#555555';
    ctx.font = `bold ${costPx}px monospace`;
    ctx.fillText(`Cost: ${formatCoinValue(costUSD, currency, undefined, false)}`, padX, curY + costPx);
    curY += Math.round(costPx * 1.25);
  }

  if (showSkuLine) {
    const remainingHeight = Math.max(Math.round(3.2 * dpmm), bottomLimitPx - curY);
    const maxSkuPx = Math.round(Math.min(remainingHeight * 0.9, Math.max(4.0, template.labelHeightMm * 0.16) * dpmm));
    const minSkuPx = Math.round(2.2 * dpmm);
    const skuPx = fitSingleLineCanvasPx(ctx, displaySku, availWidthPx, minSkuPx, maxSkuPx, (px) => `900 ${px}px monospace`);

    ctx.fillStyle = '#000000';
    ctx.font = `900 ${skuPx}px monospace`;
    ctx.fillText(displaySku, padX, curY + Math.round(skuPx * 0.88), availWidthPx);
    curY += Math.round(skuPx * 1.08);
  }

  if (template.showBarcode && barcodeValue && reserveBarcodePx > 0) {
    const showBarcodeSubText = !showSkuLine && template.showBarcodeText;
    const barcodeDataUrl = generateBarcodeDataUrl(barcodeValue, template.barcodeHeightMm, showBarcodeSubText);
    if (barcodeDataUrl) {
      const barcodeImg = new Image();
      await new Promise((resolve) => {
        barcodeImg.onload = resolve;
        barcodeImg.src = barcodeDataUrl;
      });
      const barcodeTargetHeight = Math.max(Math.round(4 * dpmm), Math.min(reserveBarcodePx, heightPx - padY - curY));
      ctx.drawImage(barcodeImg, padX, heightPx - barcodeTargetHeight - padY, availWidthPx, barcodeTargetHeight);
    }
  }

  return canvas;
}

export async function exportSingleLabelPng(
  coin: CoinRecord,
  template: LabelTemplate,
  currency: CurrencyCode = 'USD'
): Promise<void> {
  const canvas = await renderSingleLabelCanvas(coin, template, currency);
  const dataUrl = canvas.toDataURL('image/png');
  const safeSku = (coin.sku || coin.barcodeId || 'coin').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `label_${safeSku}_${template.presetId}.png`;

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generates an exact physical millimeter PDF with vector Code 128 barcodes,
 * strict layout validation guard, "Print at 100% / Actual size" margin instruction,
 * starting-slot skip for partially used sheets, and X/Y calibration offsets.
 */
export async function generateLabelsPdf(
  coins: CoinRecord[],
  template: LabelTemplate,
  currency: CurrencyCode = 'USD'
): Promise<jsPDF> {
  const validation = validateLabelLayout(template, coins);
  if (!validation.valid) {
    throw new Error(`Label layout invalid: ${validation.errors[0]}`);
  }

  const doc = new jsPDF({
    unit: 'mm',
    format: [template.paperWidthMm, template.paperHeightMm],
    orientation: template.orientation,
  });

  const labelsPerPage = template.labelsAcross * template.labelsDown;
  const startSlot = Math.max(0, Math.min(labelsPerPage - 1, template.startPosition || 0));

  const expandedCoins: CoinRecord[] = [];
  coins.forEach((c) => {
    const copies = template.copiesPerRecord === 'quantity' ? Math.max(1, c.quantity || 1) : Math.max(1, template.copiesPerRecord || 1);
    for (let i = 0; i < copies; i++) {
      expandedCoins.push(c);
    }
  });

  const totalSlotsNeeded = startSlot + expandedCoins.length;
  const totalPages = Math.max(1, Math.ceil(totalSlotsNeeded / labelsPerPage));
  let coinIndex = 0;

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      doc.addPage([template.paperWidthMm, template.paperHeightMm], template.orientation);
    }

    // Print "Actual size / 100%" instruction safely in top sheet margin on sheet presets
    if (template.marginTopMm >= 8 && template.paperWidthMm >= 150) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 110);
      doc.text(
        `CoinScan Pro Labels — Print at 100% / Actual Size (Disable Fit-to-Page / Headers & Footers) | Page ${page + 1}/${totalPages}`,
        template.marginLeftMm,
        5.5
      );
    }

    const firstSlotOnPage = page === 0 ? startSlot : 0;

    for (let slot = firstSlotOnPage; slot < labelsPerPage; slot++) {
      if (coinIndex >= expandedCoins.length) break;

      const coin = expandedCoins[coinIndex];
      coinIndex++;

      const col = slot % template.labelsAcross;
      const row = Math.floor(slot / template.labelsAcross);

      const x =
        template.marginLeftMm +
        col * (template.labelWidthMm + template.gapHorizontalMm) +
        (template.offsetXOffsetMm || 0);

      const y =
        template.marginTopMm +
        row * (template.labelHeightMm + template.gapVerticalMm) +
        (template.offsetYOffsetMm || 0);

      if (template.showBorder) {
        doc.setDrawColor(210, 210, 210);
        doc.setLineDashPattern([1, 1], 0);
        doc.rect(x, y, template.labelWidthMm, template.labelHeightMm);
        doc.setLineDashPattern([], 0);
      }

      const padX = Math.max(1.2, Math.min(2.2, template.labelWidthMm * 0.025));
      const padY = Math.max(1.0, Math.min(1.8, template.labelHeightMm * 0.035));
      const leftX = x + padX;
      const rightX = x + template.labelWidthMm - padX;
      const availableWidth = template.labelWidthMm - padX * 2;
      let curY = y + padY;

      const { barcodeValue, displaySku } = resolveBarcodePayload(coin, template);
      const showSkuLine = template.showSku !== false && Boolean(displaySku);
      const effectivePriceUSD = getCoinLabelPrice(coin);
      const showPriceLine = Boolean(template.showAskingPrice && effectivePriceUSD !== undefined);

      const desiredBarcodeH = template.showBarcode
        ? Math.min(template.barcodeHeightMm || 8, template.labelHeightMm * 0.27)
        : 0;
      const bottomLimitY = y + template.labelHeightMm - padY - (desiredBarcodeH > 0 ? desiredBarcodeH + 0.8 : 0);

      if (template.showBusinessName && template.businessName) {
        const bizPt = Math.max(5.5, Math.min(8, template.labelHeightMm * 0.16));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(bizPt);
        doc.setTextColor(90, 90, 90);
        curY += ptToMm(bizPt);
        doc.text(template.businessName.toUpperCase(), leftX, curY);
        curY += 0.8;
      }

      if (template.showItemName) {
        const availForContent = Math.max(4, bottomLimitY - curY);
        const maxTitleHeightMm = availForContent * (showPriceLine || showSkuLine ? 0.36 : 0.7);
        const maxTitlePt = Math.max(9.5, Math.min(20, template.labelHeightMm * 0.36));
        const minTitlePt = 6.5;
        const { fontSize, lines, lineHeightMm } = fitTitleBlockPdf(
          doc,
          coin.title || 'Untitled Coin',
          availableWidth,
          Math.max(ptToMm(minTitlePt) * 1.15, maxTitleHeightMm),
          minTitlePt,
          maxTitlePt
        );

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lines.forEach((line) => {
          doc.text(line, leftX, curY + ptToMm(fontSize) * 0.85);
          curY += lineHeightMm;
        });
        curY += 0.5;
      }

      const metaParts: string[] = [];
      if (template.showYear && coin.year) metaParts.push(String(coin.year));
      if (template.showDenomination && coin.denomination) metaParts.push(coin.denomination);
      if (template.showMintMark && coin.mintMark) metaParts.push(`[${coin.mintMark}]`);
      if (template.showCountry && coin.country) metaParts.push(coin.country);
      if (template.showGrade && coin.estimatedGrade) metaParts.push(coin.estimatedGrade);
      if (template.showStorageLocation && coin.storageLocation) metaParts.push(`Loc:${coin.storageLocation}`);
      if (template.showQuantity && coin.quantity > 1) metaParts.push(`Qty:${coin.quantity}`);

      if (metaParts.length > 0 && curY + 2.2 < bottomLimitY) {
        const metaStr = metaParts.join(' · ');
        const metaMaxPt = Math.max(5.5, Math.min(8, template.labelHeightMm * 0.17));
        const metaPt = fitSingleLineFontPt(doc, metaStr, availableWidth, 4.5, metaMaxPt, 'normal', 'helvetica');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(metaPt);
        doc.setTextColor(65, 65, 65);
        doc.text(metaStr, leftX, curY + ptToMm(metaPt) * 0.85);
        curY += ptToMm(metaPt) * 1.15 + 0.4;
      }

      const costUSD =
        template.showPurchaseCost && coin.purchasePrice !== undefined && coin.purchasePrice > 0
          ? toUsdAmount(coin.purchasePrice, coin.purchaseCurrency || 'USD')
          : undefined;

      if (showPriceLine && effectivePriceUSD !== undefined) {
        const priceStr = formatCoinValue(effectivePriceUSD, currency, undefined, false);
        const costStr = costUSD ? `Cost: ${formatCoinValue(costUSD, currency, undefined, false)}` : '';

        const remainingMm = Math.max(3.8, bottomLimitY - curY);
        const maxPricePt = Math.min(
          (remainingMm * (showSkuLine ? 0.54 : 0.88)) / 0.352778,
          Math.max(12, template.labelHeightMm * 0.48)
        );
        const costReserveMm = costStr ? availableWidth * 0.36 : 0;
        const pricePt = fitSingleLineFontPt(
          doc,
          priceStr,
          availableWidth - costReserveMm,
          8,
          Math.max(9, maxPricePt),
          'bold',
          'helvetica'
        );

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(pricePt);
        doc.setTextColor(0, 0, 0);
        const baselineY = curY + ptToMm(pricePt) * 0.82;
        doc.text(priceStr, leftX, baselineY);

        if (costStr) {
          const costPt = Math.max(5.5, Math.min(9, pricePt * 0.45));
          doc.setFont('courier', 'bold');
          doc.setFontSize(costPt);
          doc.setTextColor(90, 90, 90);
          doc.text(costStr, rightX, baselineY, { align: 'right' });
        }

        curY += ptToMm(pricePt) * 0.95 + 0.5;
      } else if (costUSD) {
        const costPt = 7;
        doc.setFont('courier', 'bold');
        doc.setFontSize(costPt);
        doc.setTextColor(90, 90, 90);
        doc.text(`Cost: ${formatCoinValue(costUSD, currency, undefined, false)}`, leftX, curY + ptToMm(costPt) * 0.85);
        curY += ptToMm(costPt) * 1.15 + 0.4;
      }

      if (showSkuLine) {
        const remainingMm = Math.max(3.2, bottomLimitY - curY);
        const maxSkuPt = Math.min(
          (remainingMm * 0.92) / 0.352778,
          Math.max(10, template.labelHeightMm * 0.42)
        );
        const skuPt = fitSingleLineFontPt(
          doc,
          displaySku,
          availableWidth,
          4.5,
          Math.max(7.5, maxSkuPt),
          'bold',
          'courier'
        );

        doc.setFont('courier', 'bold');
        doc.setFontSize(skuPt);
        doc.setTextColor(0, 0, 0);
        doc.text(displaySku, leftX, curY + ptToMm(skuPt) * 0.82);
        curY += ptToMm(skuPt) * 0.95 + 0.4;
      }

      // Draw crisp lossless Code 128 vector bars directly in PDF (never truncated)
      if (template.showBarcode && barcodeValue && desiredBarcodeH > 0) {
        const barcodeHeight = Math.max(3.5, Math.min(desiredBarcodeH, y + template.labelHeightMm - padY - curY));
        const barcodeY = y + template.labelHeightMm - barcodeHeight - padY;
        drawVectorCode128InPdf(doc, barcodeValue, leftX, barcodeY, availableWidth, barcodeHeight);
      }
    }
  }

  return doc;
}

export function generateCalibrationSheetPdf(template: LabelTemplate): jsPDF {
  const validation = validateLabelLayout(template);
  if (!validation.valid) {
    throw new Error(`Cannot generate calibration sheet: ${validation.errors[0]}`);
  }

  const doc = new jsPDF({
    unit: 'mm',
    format: [template.paperWidthMm, template.paperHeightMm],
    orientation: template.orientation,
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CoinScan Pro — Printer Alignment Calibration Sheet', Math.max(5, template.marginLeftMm), 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    `Print at 100% / Actual Size | Paper: ${template.paperWidthMm} × ${template.paperHeightMm} mm | Offset: (${template.offsetXOffsetMm || 0}, ${template.offsetYOffsetMm || 0}) mm`,
    Math.max(5, template.marginLeftMm),
    11
  );

  for (let r = 0; r < template.labelsDown; r++) {
    for (let c = 0; c < template.labelsAcross; c++) {
      const x =
        template.marginLeftMm +
        c * (template.labelWidthMm + template.gapHorizontalMm) +
        (template.offsetXOffsetMm || 0);
      const y =
        template.marginTopMm +
        r * (template.labelHeightMm + template.gapVerticalMm) +
        (template.offsetYOffsetMm || 0);

      doc.setDrawColor(200, 50, 50);
      doc.setLineWidth(0.3);
      doc.rect(x, y, template.labelWidthMm, template.labelHeightMm);

      const cx = x + template.labelWidthMm / 2;
      const cy = y + template.labelHeightMm / 2;
      doc.setDrawColor(100, 150, 255);
      doc.line(cx - 3, cy, cx + 3, cy);
      doc.line(cx, cy - 3, cx, cy + 3);

      doc.setFontSize(6);
      doc.setTextColor(120, 120, 120);
      doc.text(`R${r + 1}C${c + 1} (${x.toFixed(1)}, ${y.toFixed(1)} mm)`, x + 2, y + 4);
    }
  }

  return doc;
}

export function exportLabelsCsv(coins: CoinRecord[], currency: CurrencyCode | string): void {
  const targetCurrency = (['USD', 'AUD', 'GBP', 'EUR', 'CAD'].includes(String(currency)) ? currency : 'USD') as CurrencyCode;
  const headers = [
    'Record ID',
    'SKU',
    'Barcode ID',
    'Item Title',
    'Country',
    'Year',
    'Denomination',
    'Mint Mark',
    'Storage Location',
    'Grade',
    'Quantity',
    'Asking Price (USD Base)',
    'Display Price',
    'Display Currency',
    'Status',
  ];

  const rows = coins.map((c) => {
    const usdPrice = getCoinLabelPrice(c);
    const displayFormatted = usdPrice !== undefined ? formatCoinValue(usdPrice, targetCurrency, undefined, false) : '';
    return [
      `"${c.id || ''}"`,
      `"${(c.sku || '').replace(/"/g, '""')}"`,
      `"${(c.barcodeId || '').replace(/"/g, '""')}"`,
      `"${(c.title || '').replace(/"/g, '""')}"`,
      `"${(c.country || '').replace(/"/g, '""')}"`,
      c.year || '',
      `"${(c.denomination || '').replace(/"/g, '""')}"`,
      `"${(c.mintMark || '').replace(/"/g, '""')}"`,
      `"${(c.storageLocation || '').replace(/"/g, '""')}"`,
      `"${(c.estimatedGrade || '').replace(/"/g, '""')}"`,
      c.quantity || 1,
      usdPrice !== undefined ? Math.round(usdPrice * 100) / 100 : '',
      `"${displayFormatted}"`,
      targetCurrency,
      c.status || 'in_collection',
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `coinscan_labels_export_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
