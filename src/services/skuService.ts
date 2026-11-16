import type { CoinRecord, SkuAttribute, SkuSettings, SkuSettingsPreset } from '../types/coin';

export const DEFAULT_SKU_SETTINGS: SkuSettings = {
  preset: 'descriptive',
  prefix: 'COIN',
  attributes: ['country', 'year', 'denomination'],
  abbreviationLength: 3,
  separator: '-',
  startingSequence: 1,
  sequencePadding: 6,
  defaultStorageLocation: 'Vault 1',
  includeStorageInSku: false,
  autoGenerateOnSave: true,
  highestAllocatedSequence: 0,
};

export interface SkuPresetDefinition {
  id: SkuSettingsPreset;
  name: string;
  description: string;
  example: string;
  config: Partial<SkuSettings>;
}

export const SKU_PRESETS: SkuPresetDefinition[] = [
  {
    id: 'sequential',
    name: 'Sequential',
    description: 'Clean sequential numbering with product prefix only.',
    example: 'COIN-000001',
    config: {
      preset: 'sequential',
      prefix: 'COIN',
      attributes: [],
      includeStorageInSku: false,
      separator: '-',
      sequencePadding: 6,
    },
  },
  {
    id: 'descriptive',
    name: 'Descriptive (Recommended)',
    description: 'Includes country, year, and denomination abbreviations for immediate visual identification.',
    example: 'COIN-AUS-1966-20C-000001',
    config: {
      preset: 'descriptive',
      prefix: 'COIN',
      attributes: ['country', 'year', 'denomination'],
      includeStorageInSku: false,
      separator: '-',
      sequencePadding: 6,
    },
  },
  {
    id: 'storage_based',
    name: 'Storage-Based',
    description: 'Encodes the storage container into the SKU. (Note: if coins move, the SKU remains fixed).',
    example: 'COIN-AUS-1966-20C-V1-000001',
    config: {
      preset: 'storage_based',
      prefix: 'COIN',
      attributes: ['country', 'year', 'denomination', 'storageLocation'],
      includeStorageInSku: true,
      separator: '-',
      sequencePadding: 6,
    },
  },
];

const COUNTRY_CODES: Record<string, string> = {
  'australia': 'AUS',
  'united states': 'USA',
  'united states of america': 'USA',
  'usa': 'USA',
  'united kingdom': 'GBR',
  'great britain': 'GBR',
  'england': 'GBR',
  'canada': 'CAN',
  'new zealand': 'NZL',
  'south africa': 'ZAF',
  'france': 'FRA',
  'germany': 'DEU',
  'austria': 'AUT',
  'switzerland': 'CHE',
  'mexico': 'MEX',
  'china': 'CHN',
  'japan': 'JPN',
  'india': 'IND',
  'rome': 'ROM',
  'roman empire': 'ROM',
  'ancient greece': 'GRC',
};

export function sanitizeAlphanumeric(str: string, fallback = 'GEN'): string {
  if (!str) return fallback;
  const cleaned = str
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned || fallback;
}

export function abbreviateCountry(country: string | undefined, length = 3): string {
  if (!country) return 'UNK';
  const lower = country.toLowerCase().trim();
  if (COUNTRY_CODES[lower]) {
    return COUNTRY_CODES[lower].slice(0, length);
  }
  const clean = sanitizeAlphanumeric(country, 'UNK');
  return clean.slice(0, length);
}

export function abbreviateDenomination(denom: string | undefined, length = 3): string {
  if (!denom) return 'GEN';
  const clean = denom.trim();

  if (/\b(?:cents?|c)\b/i.test(clean)) {
    const num = clean.replace(/[^0-9]/g, '');
    if (num) return `${num}C`.slice(0, Math.max(length, 3));
  }

  if (/\b(?:dollar|dollars?|\$)\b/i.test(clean)) {
    const num = clean.replace(/[^0-9.]/g, '');
    const intVal = parseInt(num, 10);
    if (!isNaN(intVal)) return `${intVal}D`.slice(0, Math.max(length, 3));
  }

  if (/sovereign/i.test(clean)) {
    if (/half/i.test(clean)) return 'HSOV';
    return '1SOV';
  }

  if (/penny|pence|d\b/i.test(clean)) {
    const num = clean.replace(/[^0-9]/g, '');
    return num ? `${num}P` : '1P';
  }

  if (/shilling/i.test(clean)) {
    const num = clean.replace(/[^0-9]/g, '');
    return num ? `${num}S` : '1S';
  }

  const alpha = sanitizeAlphanumeric(clean, 'GEN');
  return alpha.slice(0, length);
}

export function abbreviateStorage(storage: string | undefined, length = 3): string {
  if (!storage) return 'LOC';
  const trimmed = storage.trim();

  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    const initials = words.map((w) => w[0].toUpperCase()).join('');
    const lastNum = trimmed.match(/\d+$/)?.[0] || '';
    const combined = `${initials.slice(0, 2)}${lastNum}`;
    if (combined) return combined.slice(0, length);
  }

  const alpha = sanitizeAlphanumeric(trimmed, 'LOC');
  return alpha.slice(0, length);
}

export function getAttributeSegment(
  coin: Partial<CoinRecord>,
  attr: SkuAttribute,
  length: number
): { segment: string; label: string; value: string; description: string } {
  switch (attr) {
    case 'country': {
      const val = coin.country || 'Unknown';
      const code = abbreviateCountry(val, length);
      return {
        segment: code,
        label: 'Country',
        value: val,
        description: `Country code: ${val} abbreviated to ${code}`,
      };
    }
    case 'year': {
      const yearVal = coin.year ? String(coin.year) : 'XXXX';
      const cleanYear = yearVal.slice(-4);
      return {
        segment: cleanYear,
        label: 'Year',
        value: yearVal,
        description: `Mintage year: ${cleanYear}`,
      };
    }
    case 'denomination': {
      const val = coin.denomination || coin.faceValue || 'Standard';
      const code = abbreviateDenomination(val, length);
      return {
        segment: code,
        label: 'Denomination',
        value: val,
        description: `Face value: ${val} formatted as ${code}`,
      };
    }
    case 'mintMark': {
      const mark = coin.mintMark ? sanitizeAlphanumeric(coin.mintMark, '').slice(0, length) : '';
      return {
        segment: mark || 'NO_MINT',
        label: 'Mint Mark',
        value: coin.mintMark || 'None',
        description: coin.mintMark ? `Mint mark: ${mark}` : 'No mint mark recorded',
      };
    }
    case 'storageLocation': {
      const val = coin.storageLocation || 'Vault';
      const code = abbreviateStorage(val, length);
      return {
        segment: code,
        label: 'Storage Location',
        value: val,
        description: `Physical location: ${val} encoded as ${code}`,
      };
    }
    case 'category': {
      const val = coin.category || 'General';
      const code = sanitizeAlphanumeric(val, 'CAT').slice(0, length);
      return {
        segment: code,
        label: 'Category',
        value: val,
        description: `Collection category: ${val} abbreviated to ${code}`,
      };
    }
  }
}

export function explainSkuSegments(
  coin: Partial<CoinRecord>,
  sequenceNum: number,
  settings: SkuSettings
): { segment: string; label: string; value: string; description: string }[] {
  const list: { segment: string; label: string; value: string; description: string }[] = [];

  const prefix = settings.prefix.trim().toUpperCase() || 'COIN';
  list.push({
    segment: prefix,
    label: 'Product Prefix',
    value: prefix,
    description: 'Fixed inventory prefix identifier',
  });

  settings.attributes.forEach((attr) => {
    if (attr === 'storageLocation' && !settings.includeStorageInSku) {
      return;
    }
    const info = getAttributeSegment(coin, attr, settings.abbreviationLength || 3);
    if (attr === 'mintMark' && info.segment === 'NO_MINT') {
      return;
    }
    list.push(info);
  });

  const paddedSeq = String(sequenceNum).padStart(settings.sequencePadding || 6, '0');
  list.push({
    segment: paddedSeq,
    label: 'Sequence Number',
    value: String(sequenceNum),
    description: `Atomic sequential counter (padded to ${settings.sequencePadding || 6} digits)`,
  });

  return list;
}

export function formatSku(
  coin: Partial<CoinRecord>,
  sequenceNum: number,
  settings: SkuSettings
): string {
  const segments = explainSkuSegments(coin, sequenceNum, settings);
  const sep = settings.separator ?? '-';
  return segments.map((s) => s.segment).join(sep);
}

export function getNextAvailableSequence(
  coins: CoinRecord[],
  settings: SkuSettings
): number {
  let highest = Math.max(0, settings.highestAllocatedSequence || 0, (settings.startingSequence || 1) - 1);

  coins.forEach((c) => {
    if (!c.sku) return;
    const match = c.sku.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > highest) {
        highest = num;
      }
    }
  });

  return highest + 1;
}

/**
 * Allocates a short, immutable compact barcode identifier (e.g. "CS000001") linked to a coin record.
 * Useful when full descriptive SKUs exceed narrow thermal/flip label widths while keeping zero truncation.
 */
export function allocateShortBarcodeId(existingCoins: CoinRecord[]): string {
  let maxNum = 0;
  const used = new Set<string>();

  existingCoins.forEach((c) => {
    if (c.barcodeId) {
      const clean = c.barcodeId.trim().toUpperCase();
      used.add(clean);
      const match = clean.match(/^CS(\d+)$/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > maxNum) maxNum = val;
      }
    }
  });

  let next = maxNum + 1;
  while (used.has(`CS${String(next).padStart(6, '0')}`)) {
    next += 1;
  }
  return `CS${String(next).padStart(6, '0')}`;
}

export function checkSkuUniqueness(
  sku: string,
  currentCoinId: string | undefined,
  existingCoins: CoinRecord[]
): { isUnique: boolean; conflictCoin?: CoinRecord } {
  const target = sku.trim().toUpperCase();
  if (!target) return { isUnique: true };

  const conflict = existingCoins.find((c) => {
    if (currentCoinId && c.id === currentCoinId) return false;
    return (c.sku || '').trim().toUpperCase() === target;
  });

  return {
    isUnique: !conflict,
    conflictCoin: conflict,
  };
}

/**
 * Evaluates Code 128 physical X-dimension (bar width in mm) inside a given printable width,
 * accounting for start, checksum, stop symbols (35 modules) + left & right quiet zones (>= 10X each).
 * Minimum reliable bar module width on standard 203–300 DPI printers is 0.22 mm.
 */
export function estimateCode128PhysicalFit(
  code: string,
  availableWidthMm: number
): {
  fitsComfortably: boolean;
  moduleWidthMm: number;
  quietZoneMm: number;
  totalModulesWithQuietZones: number;
  minRecommendedWidthMm: number;
  warning?: string;
} {
  const len = Math.max(1, code.trim().length);
  // Code 128 B/A = 11 modules/char + 35 (start+check+stop) + 20 quiet zone modules (10X each side)
  // Using conservative B-set ceiling ensures no false confidence even with alphanumeric symbols
  const dataModules = 11 * len + 35;
  const quietModules = 20;
  const totalModules = dataModules + quietModules;
  const moduleWidthMm = availableWidthMm / totalModules;
  const quietZoneMm = Math.max(1.5, moduleWidthMm * 10);
  const MIN_READABLE_X_MM = 0.22;
  const minRecommendedWidthMm = Math.round(totalModules * MIN_READABLE_X_MM * 10) / 10;
  const fitsComfortably = moduleWidthMm >= MIN_READABLE_X_MM;

  return {
    fitsComfortably,
    moduleWidthMm: Math.round(moduleWidthMm * 1000) / 1000,
    quietZoneMm: Math.round(quietZoneMm * 100) / 100,
    totalModulesWithQuietZones: totalModules,
    minRecommendedWidthMm,
    warning: fitsComfortably
      ? undefined
      : `Encoded value "${code}" (${len} chars) compresses bars to ${moduleWidthMm.toFixed(2)} mm/module in ${availableWidthMm.toFixed(1)} mm width (needs >= ${minRecommendedWidthMm} mm for ${MIN_READABLE_X_MM} mm modules). Enable Compact Barcode ID to avoid scanner misreads without truncating SKU.`,
  };
}

export function validateSkuForBarcode(sku: string): {
  valid: boolean;
  warning?: string;
  sanitized: string;
} {
  const trimmed = sku.trim();
  if (!trimmed) {
    return { valid: false, warning: 'SKU cannot be empty.', sanitized: '' };
  }

  const hasNonAscii = /[^\x00-\x7F]/.test(trimmed);
  const sanitized = trimmed.replace(/[^\x20-\x7E]/g, '');

  if (hasNonAscii) {
    return {
      valid: false,
      warning: 'SKU contains non-ASCII characters that cannot be encoded in Code 128.',
      sanitized,
    };
  }

  if (trimmed.length > 22) {
    return {
      valid: true,
      warning: `SKU is ${trimmed.length} characters long. Compact labels (< 60 mm wide) will encode tightly; consider linking a short Barcode ID (e.g. CS000001).`,
      sanitized,
    };
  }

  return { valid: true, sanitized };
}
