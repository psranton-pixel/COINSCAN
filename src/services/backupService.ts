import type {
  CoinRecord,
  CollectionCategory,
  BackupPayloadV2,
  BackupValidationResult,
  SkuSettings,
  LabelTemplate,
  ResaleFeeSettings,
  PlatformFeePresetId,
} from '../types/coin';
import { migrateCoinRecord } from '../utils/coinMigration';
import { evaluateCoinMeltValue } from './marketRatesService';
import {
  calculateAllocatedCost,
  calculateRealizedNetProfit,
  calculateUnrealizedGain,
  getCoinEstimatedValueUSD,
  resolveCoinFeeConfig,
} from '../utils/inventoryCalculations';

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Creates a full versioned JSON backup payload preserving full records, original photos,
 * cutouts, provenance, FX details, SKUs, categories, and templates.
 */
export function generateBackupPayload(
  coins: CoinRecord[],
  categories: CollectionCategory[],
  userId: string = 'guest',
  includeSampleCoins: boolean = false,
  skuSettings?: SkuSettings,
  labelTemplates?: LabelTemplate[]
): BackupPayloadV2 {
  const exportCoins = includeSampleCoins ? coins : coins.filter((c) => !c.isSample);
  let photoCount = 0;
  exportCoins.forEach((c) => {
    if (c.obverseImage) photoCount += 1;
    if (c.reverseImage) photoCount += 1;
    if (c.originalObverseImage) photoCount += 1;
    if (c.originalReverseImage) photoCount += 1;
  });

  return {
    app: 'CoinScan Pro',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportDate: new Date().toISOString(),
    userId,
    coinCount: exportCoins.length,
    containsImages: photoCount > 0,
    photoCount,
    coins: exportCoins,
    categories,
    skuSettings,
    labelTemplates,
  };
}

/**
 * Generates spreadsheet CSV export (metadata & financial ledger only, does NOT include photos).
 * Values are normalized to base USD so CostBasis, MeltValue, MarketValue, and NetProfit remain arithmetically consistent.
 */
export function generateCsvExport(
  coins: CoinRecord[],
  includeSampleCoins: boolean = false,
  feeSettings?: ResaleFeeSettings
): string {
  const exportCoins = includeSampleCoins ? coins : coins.filter((c) => !c.isSample);

  const headers = [
    'SKU',
    'Title',
    'Country',
    'Year',
    'MintMark',
    'Metal',
    'WeightGrams',
    'Fineness',
    'GradeRange',
    'CostBasis',
    'MeltValue',
    'MarketValue',
    'PlatformFeePreset',
    'NetProfit',
    'StorageLocation',
    'Status',
  ];

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = exportCoins.map((c) => {
    const qty = Math.max(1, c.quantity || 1);
    const costBasis =
      c.purchasePrice !== undefined && c.purchasePrice !== null
        ? Math.round(calculateAllocatedCost(c, qty) * 100) / 100
        : 0;
    const meltResult = evaluateCoinMeltValue(c, 'USD');
    const meltValue =
      meltResult.available && meltResult.breakdown
        ? Math.round(meltResult.breakdown.meltValueUSD * qty * 100) / 100
        : 'Unavailable';
    const marketValue = Math.round(getCoinEstimatedValueUSD(c) * qty * 100) / 100;
    const feeConfig = resolveCoinFeeConfig(c, feeSettings);

    const isSold = c.status === 'sold' || (c.soldQuantity !== undefined && c.soldQuantity > 0);
    const netProfit = isSold
      ? calculateRealizedNetProfit(c, 'USD', feeSettings).netProfit
      : calculateUnrealizedGain(c, 'USD', feeSettings).unrealizedGain;

    return [
      c.sku || '',
      c.title || '',
      c.country || '',
      c.year || '',
      c.mintMark || '',
      c.metalCategory || c.metalComposition || '',
      c.weightGrams ?? '',
      c.fineness ?? '',
      c.estimatedGradeRange || c.estimatedGrade || '',
      costBasis,
      meltValue,
      marketValue,
      feeConfig.presetLabel,
      netProfit,
      c.storageLocation || '',
      c.status || 'in_collection',
    ]
      .map(escapeCsv)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
}

/**
 * Validates a backup file (Full JSON archive or CSV spreadsheet), runs safe record migration,
 * counts attached photos, detects ID & SKU collisions, and isolates target `owner_user_id`.
 */
export function validateBackupFile(
  content: string,
  existingCoins: CoinRecord[],
  targetUserId: string = 'guest'
): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Root content is not a valid JSON object.');
    }

    let version = 1;
    let rawCoins: any[] = [];
    let rawCategories: any[] = [];

    if (parsed.app === 'CoinScan Pro' && Array.isArray(parsed.coins)) {
      version = parsed.schemaVersion || 1;
      rawCoins = parsed.coins;
      rawCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
    } else if (Array.isArray(parsed)) {
      version = 1;
      rawCoins = parsed;
    } else if (Array.isArray(parsed.coins)) {
      rawCoins = parsed.coins;
    } else {
      errors.push('Unrecognized backup format. Expected a CoinScan Pro JSON backup with a "coins" array.');
      return {
        valid: false,
        version: 0,
        isCsv: false,
        errors,
        warnings,
        totalCoins: 0,
        photoCount: 0,
        duplicateSkuCount: 0,
        recordsToAdd: [],
        recordsToUpdate: [],
        recordsToSkip: [],
        categories: [],
      };
    }

    const existingIds = new Set(existingCoins.map((c) => c.id));
    const existingSkus = new Set(existingCoins.filter((c) => c.sku).map((c) => c.sku!.trim().toUpperCase()));
    const seenImportSkus = new Set<string>();

    const recordsToAdd: CoinRecord[] = [];
    const recordsToUpdate: CoinRecord[] = [];
    const recordsToSkip: CoinRecord[] = [];
    let photoCount = 0;
    let duplicateSkuCount = 0;

    const now = new Date().toISOString();

    rawCoins.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Row #${index + 1}: Record is not a valid coin object.`);
        return;
      }

      const id = String(item.id || `coin_imported_${Date.now()}_${index}`).trim();
      const title = String(item.title || 'Untitled Specimen').trim().slice(0, 280);
      const country = String(item.country || 'Unknown').trim().slice(0, 110);
      const denomination = String(item.denomination || 'Standard Issue').trim().slice(0, 110);
      const year = typeof item.year === 'number' && !isNaN(item.year) ? item.year : parseInt(String(item.year)) || 0;

      const baseCoin: CoinRecord = {
        ...item,
        id,
        owner_user_id: targetUserId,
        title,
        country,
        denomination,
        year,
        quantity: Math.max(1, Number(item.quantity) || 1),
        estimatedValue: Number(item.estimatedValue) || 0,
        lowValue: Number(item.lowValue) || 0,
        highValue: Number(item.highValue) || 0,
        currency: item.currency || 'USD',
        status: ['in_collection', 'listed', 'sold', 'wishlist'].includes(item.status) ? item.status : 'in_collection',
        category: String(item.category || 'General Collection').slice(0, 110),
        isFavorite: Boolean(item.isFavorite),
        isSample: Boolean(item.isSample),
        obverseImage: item.obverseImage || '',
        valuationHistory: Array.isArray(item.valuationHistory) ? item.valuationHistory : [],
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };

      const migrated = migrateCoinRecord(baseCoin);

      if (migrated.obverseImage) photoCount += 1;
      if (migrated.reverseImage) photoCount += 1;
      if (migrated.originalObverseImage) photoCount += 1;
      if (migrated.originalReverseImage) photoCount += 1;

      const normSku = (migrated.sku || '').trim().toUpperCase();
      if (normSku) {
        if ((existingSkus.has(normSku) && !existingIds.has(id)) || seenImportSkus.has(normSku)) {
          duplicateSkuCount += 1;
        }
        seenImportSkus.add(normSku);
      }

      if (existingIds.has(id)) {
        recordsToUpdate.push(migrated);
      } else {
        recordsToAdd.push(migrated);
      }
    });

    if (duplicateSkuCount > 0) {
      warnings.push(
        `${duplicateSkuCount} imported coin(s) share an SKU with an existing record or another row in this file.`
      );
    }

    const categories: CollectionCategory[] = rawCategories.map((c, idx) => ({
      id: String(c.id || `cat_imp_${Date.now()}_${idx}`),
      owner_user_id: targetUserId,
      name: String(c.name || 'Custom Category').slice(0, 50),
      color: String(c.color || '#d4af37'),
      createdAt: c.createdAt || now,
    }));

    return {
      valid: errors.length === 0,
      version,
      isCsv: false,
      errors,
      warnings,
      totalCoins: recordsToAdd.length + recordsToUpdate.length,
      photoCount,
      duplicateSkuCount,
      recordsToAdd,
      recordsToUpdate,
      recordsToSkip,
      categories,
      skuSettings: parsed.skuSettings,
      labelTemplates: Array.isArray(parsed.labelTemplates) ? parsed.labelTemplates : undefined,
    };
  } catch (jsonErr: any) {
    if (content.includes(',') && (content.includes('Title') || content.includes('Country'))) {
      return parseCsvBackup(content, existingCoins, targetUserId);
    }

    errors.push(`Failed to parse backup file: ${jsonErr?.message || 'Invalid JSON or CSV format'}`);
    return {
      valid: false,
      version: 0,
      isCsv: false,
      errors,
      warnings,
      totalCoins: 0,
      photoCount: 0,
      duplicateSkuCount: 0,
      recordsToAdd: [],
      recordsToUpdate: [],
      recordsToSkip: [],
      categories: [],
    };
  }
}

function parseCsvBackup(
  csvText: string,
  existingCoins: CoinRecord[],
  targetUserId: string
): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [
    'Spreadsheet CSV files contain catalog metadata only and do not include coin photos or full valuation history.',
  ];
  const lines: string[][] = [];

  let currentField = '';
  let insideQuotes = false;
  let currentRow: string[] = [];
  const cleanText = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      if (currentRow.some((f) => f.trim().length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length < 2) {
    errors.push('CSV file contains no data rows.');
    return {
      valid: false,
      version: 1,
      isCsv: true,
      errors,
      warnings,
      totalCoins: 0,
      photoCount: 0,
      duplicateSkuCount: 0,
      recordsToAdd: [],
      recordsToUpdate: [],
      recordsToSkip: [],
      categories: [],
    };
  }

  const rawHeaders = lines[0].map((h) => h.trim().toLowerCase());
  const getIndex = (...names: string[]) =>
    rawHeaders.findIndex((h) => names.some((name) => h === name.toLowerCase() || h.includes(name.toLowerCase())));

  const idIdx = rawHeaders.findIndex((h) => h === 'id');
  const skuIdx = getIndex('sku');
  const titleIdx = getIndex('title');
  const countryIdx = getIndex('country');
  const denomIdx = getIndex('denomination');
  const yearIdx = getIndex('year');
  const mintIdx = getIndex('mintmark', 'mint');
  const metalIdx = getIndex('metal', 'composition');
  const weightIdx = getIndex('weightgrams', 'weight');
  const finenessIdx = getIndex('fineness');
  const seriesIdx = getIndex('series');
  const rarityIdx = getIndex('rarity');
  const gradeIdx = getIndex('graderange', 'grade');
  const valueIdx = getIndex('marketvalue', 'estimated value');
  const curIdx = getIndex('valuation currency');
  const purchaseIdx = getIndex('costbasis', 'purchase price');
  const presetIdx = getIndex('platformfeepreset');
  const storageIdx = getIndex('storagelocation', 'storage location');
  const qtyIdx = getIndex('quantity');
  const statusIdx = getIndex('status');
  const catIdx = getIndex('category');
  const notesIdx = getIndex('personal notes');

  const existingIds = new Set(existingCoins.map((c) => c.id));
  const existingBySku = new Map(
    existingCoins.filter((c) => c.sku).map((c) => [c.sku!.trim().toUpperCase(), c.id])
  );
  const recordsToAdd: CoinRecord[] = [];
  const recordsToUpdate: CoinRecord[] = [];
  let duplicateSkuCount = 0;
  const now = new Date().toISOString();

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const title = titleIdx !== -1 ? row[titleIdx]?.trim() : 'Imported Coin';
    if (!title) continue;

    const skuVal = (skuIdx !== -1 && row[skuIdx]?.trim()) || undefined;
    const matchedIdBySku = skuVal ? existingBySku.get(skuVal.toUpperCase()) : undefined;
    if (matchedIdBySku) duplicateSkuCount += 1;

    const id = (idIdx !== -1 && row[idIdx]?.trim()) || matchedIdBySku || `coin_csv_${Date.now()}_${r}`;
    const country = (countryIdx !== -1 && row[countryIdx]?.trim()) || 'Unknown';
    const denomination = (denomIdx !== -1 && row[denomIdx]?.trim()) || 'Standard';
    const year = (yearIdx !== -1 && parseInt(row[yearIdx]?.trim())) || 0;
    const gradeVal = (gradeIdx !== -1 && row[gradeIdx]?.trim()) || 'Circulated';
    const rawPreset = presetIdx !== -1 ? (row[presetIdx]?.trim() || '').toLowerCase() : '';
    let platformFeePreset: PlatformFeePresetId | undefined;
    if (rawPreset.includes('ebay')) platformFeePreset = 'ebay_au_13_5';
    else if (rawPreset.includes('custom')) platformFeePreset = 'custom';
    else if (rawPreset.includes('private') || rawPreset.includes('0%')) platformFeePreset = 'private_0';

    const weightParsed = weightIdx !== -1 && row[weightIdx] ? parseFloat(row[weightIdx]) : NaN;
    const finenessParsed = finenessIdx !== -1 && row[finenessIdx] ? parseFloat(row[finenessIdx]) : NaN;

    const coin = migrateCoinRecord({
      id,
      owner_user_id: targetUserId,
      sku: skuVal,
      title,
      country,
      denomination,
      year,
      mintMark: (mintIdx !== -1 && row[mintIdx]?.trim()) || '',
      series: (seriesIdx !== -1 && row[seriesIdx]?.trim()) || '',
      rarity: (rarityIdx !== -1 ? (row[rarityIdx]?.trim() as any) : 'Common') || 'Common',
      estimatedGrade: gradeVal,
      estimatedGradeRange: gradeVal,
      conditionDetails: 'Imported from CSV spreadsheet',
      historicalSignificance: 'Catalogue record',
      metalComposition: (metalIdx !== -1 && row[metalIdx]?.trim()) || '',
      weightGrams: !isNaN(weightParsed) ? weightParsed : undefined,
      fineness: !isNaN(finenessParsed) ? finenessParsed : undefined,
      estimatedValue: (valueIdx !== -1 && parseFloat(row[valueIdx])) || 0,
      lowValue: 0,
      highValue: 0,
      faceValue: denomination,
      currency: (curIdx !== -1 && (row[curIdx]?.trim() as any)) || 'USD',
      valuationDate: now,
      purchasePrice:
        purchaseIdx !== -1 && row[purchaseIdx] !== '' && !isNaN(parseFloat(row[purchaseIdx]))
          ? parseFloat(row[purchaseIdx])
          : undefined,
      platformFeePreset,
      storageLocation: (storageIdx !== -1 && row[storageIdx]?.trim()) || undefined,
      quantity: (qtyIdx !== -1 && parseInt(row[qtyIdx])) || 1,
      status: (statusIdx !== -1 && (row[statusIdx]?.trim().toLowerCase() as any)) || 'in_collection',
      category: (catIdx !== -1 && row[catIdx]?.trim()) || 'General Collection',
      personalNotes: (notesIdx !== -1 && row[notesIdx]?.trim()) || '',
      isFavorite: false,
      obverseImage: '',
      valuationHistory: [],
      createdAt: now,
      updatedAt: now,
    });

    if (existingIds.has(id)) {
      recordsToUpdate.push(coin);
    } else {
      recordsToAdd.push(coin);
    }
  }

  return {
    valid: true,
    version: 1,
    isCsv: true,
    errors: [],
    warnings,
    totalCoins: recordsToAdd.length + recordsToUpdate.length,
    photoCount: 0,
    duplicateSkuCount,
    recordsToAdd,
    recordsToUpdate,
    recordsToSkip: [],
    categories: [],
  };
}
