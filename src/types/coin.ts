export type CurrencyCode = 'USD' | 'AUD' | 'GBP' | 'EUR' | 'CAD';

export const VALID_CURRENCIES: CurrencyCode[] = ['USD', 'AUD', 'GBP', 'EUR', 'CAD'];

export type RarityTier = 'Common' | 'Uncommon' | 'Scarce' | 'Rare' | 'Very Rare' | 'Key Date';

export const VALID_RARITIES: RarityTier[] = [
  'Common',
  'Uncommon',
  'Scarce',
  'Rare',
  'Very Rare',
  'Key Date',
];

export type BullionType = 'none' | 'bullion' | 'semi_numismatic' | 'numismatic';

export type MetalCategory = 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper' | 'clad' | 'other';

export type ValuationMethodology =
  | 'comparable_sales'
  | 'bullion_melt'
  | 'catalogue_reference'
  | 'provisional_ai_inference';

export type EvidenceQuality = 'high_confidence' | 'moderate_confidence' | 'provisional_estimate';

export type CompSourceType = 'verified_auction' | 'dealer_ask' | 'user_entered' | 'ai_estimate';

export type CompPriceType = 'hammer' | 'buyer_inclusive' | 'asking' | 'unknown';

export type ListingStatus = 'unlisted' | 'listed' | 'pending' | 'sold';

export type PlatformFeePresetId = 'private_0' | 'ebay_au_13_5' | 'custom';

export interface ResaleFeeSettings {
  defaultPreset: PlatformFeePresetId;
  ebayAuPercent: number; // default 13.5
  ebayAuFixedPostage: number; // default 0 in base USD
  customPercent: number; // default 10
  customFixedPostage: number; // default 10 in base USD
}

export type CostBasisType = 'per_coin' | 'total';

export type CoinStatus = 'in_collection' | 'listed' | 'sold' | 'wishlist';

export interface FxConversionReference {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  source: string;
  timestamp: string;
  direction: string; // e.g. "AUD -> USD"
}

export interface SpotPriceReference {
  metal: MetalCategory;
  pricePerUnitUSD: number;
  unit: 'troy_oz' | 'pound';
  source: string;
  timestamp: string;
}

export interface AuctionComp {
  auctionHouse: string;
  date: string;
  lotNumber?: string;
  coinVariety?: string;
  grade: string;
  realizedPrice: number; // Amount in original currency (or USD if legacy)
  originalPrice?: number;
  originalCurrency?: CurrencyCode | string;
  currency: string; // Stored source currency (e.g. USD, GBP, AUD)
  priceType?: CompPriceType;
  buyersPremiumIncluded?: boolean;
  sourceType?: CompSourceType;
  url?: string; // Accessible source link if genuine
  verificationStatus?: 'verified_sale' | 'historical_comp' | 'provisional_comp';
  fxConversion?: FxConversionReference;
  sourceNotes?: string;
}

export interface BoundaryCircle {
  cx: number; // 0 to 1 normalized
  cy: number; // 0 to 1 normalized
  radius: number; // 0 to 0.5 normalized
  aspectRatio?: number; // 1.0 = circle, >1 = elliptical
  rotation?: number; // degrees
  feather?: number; // px
}

export interface BullionBreakdown {
  metalType: MetalCategory;
  weightGrams: number;
  fineness: number; // 0.0 to 1.0 (e.g. 0.900 for 90% silver, 0.9167 for 22k gold)
  pureGrams: number;
  pureTroyOunces: number;
  spotPricePerOzUSD: number;
  meltValueUSD: number;
  meltValueDisplayCurrency: number;
  spotSource: string;
  spotTimestamp: string;
  fxConversion?: FxConversionReference;
  isStale: boolean;
}

export interface MeltCalculationResult {
  available: boolean;
  unavailableReason?: string;
  preciousMetalGrams?: number;
  breakdown?: BullionBreakdown;
}

export interface MetalConsistencyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestedCategory?: MetalCategory;
  suggestedFineness?: number;
  preciousMetalGrams?: number;
}

export interface ValuationSnapshot {
  date: string;
  estimatedValue: number;
  lowValue: number;
  highValue: number;
  currency: CurrencyCode;
  grade: string;
  methodology: ValuationMethodology;
  evidenceQuality: EvidenceQuality;
  evidenceCount?: number;
  valuationConfidence?: number;
  provisionalNote?: string;
  valuationRationale?: string;
  bullionMeltValue?: number;
  spotPriceReference?: SpotPriceReference;
}

export interface AlternativeCoinMatch {
  title?: string;
  country: string;
  year: number;
  mintMark: string;
  denomination?: string;
  distinguishingFeature: string;
  estimatedValue?: number;
  lowValue?: number;
  highValue?: number;
}

export interface CoinIdentification {
  title: string;
  country: string;
  denomination: string;
  currency: CurrencyCode; // Stored source valuation currency (normalized to USD for catalogue valuation)
  year: number;
  mintMark: string;
  mintMarkDiagnostic?: string;
  series: string;
  metalComposition: string;
  metalCategory?: MetalCategory;
  fineness?: number; // 0 to 1 decimal
  preciousMetalGrams?: number;
  metalVerified?: boolean;
  bullionType?: BullionType;
  weightGrams?: number;
  diameterMm?: number;
  rarity: RarityTier;
  // Separate confidences (0-100)
  identificationConfidence?: number;
  gradingConfidence?: number;
  valuationConfidence?: number;
  confidenceScore?: number; // Overall / legacy compatibility (0-100)
  estimatedGradeRange?: string; // e.g. "AU-55 to MS-62"
  estimatedGrade: string;
  conditionDetails: string;
  gradingProvisionalNotice?: string;
  historicalSignificance: string;
  estimatedValue: number; // Central estimate in base USD (Raw)
  lowValue: number; // Conservative low estimate (Raw)
  highValue: number; // Premium high estimate (Raw)
  slabbedEstimatedValue?: number; // Central estimate in base USD when PCGS/NGC slabbed
  slabbedLowValue?: number;
  slabbedHighValue?: number;
  bullionMeltValue?: number;
  bullionDetails?: BullionBreakdown;
  faceValue: string;
  valuationMethodology?: ValuationMethodology;
  evidenceQuality?: EvidenceQuality;
  evidenceCount?: number;
  valuationRationale?: string;
  isProvisionalValuation?: boolean;
  valuationDate: string;
  lastValuationUpdate?: string;
  spotPriceReference?: SpotPriceReference;
  fxConversion?: FxConversionReference;
  supportingSources?: string[];
  recentAuctionComps?: AuctionComp[];
  alternativeMatches?: AlternativeCoinMatch[];
  possibleAlternativeMatches?: {
    title: string;
    year: number;
    country: string;
    denomination: string;
    estimatedValue: number;
    reason: string;
  }[];
  detectedBoundaries?: {
    obverse?: BoundaryCircle;
    reverse?: BoundaryCircle;
  };
}

export interface CoinRecord extends CoinIdentification {
  id: string;
  owner_user_id: string;

  // Acquisition & Inventory Tracking
  sku?: string;
  barcodeId?: string; // Immutable compact scannable ID linked to full SKU
  storageLocation?: string;
  quantity: number;
  costBasisType?: CostBasisType; // 'per_coin' or 'total'
  purchasePrice?: number;
  purchaseCurrency?: CurrencyCode;
  purchaseDate?: string;
  category: string;
  isFavorite: boolean;
  status: CoinStatus;

  // Resale Tracking & Partial Sales
  listingPlatform?: string;
  listingUrl?: string;
  listingStatus?: ListingStatus;
  askingPrice?: number;
  askingCurrency?: CurrencyCode;
  soldPrice?: number; // Actual realized gross proceeds in soldCurrency
  soldCurrency?: CurrencyCode;
  soldDate?: string;
  soldQuantity?: number; // Supports partial sales (e.g. 1 of 5 sold)
  platformFeePreset?: PlatformFeePresetId;
  customFeePercent?: number;
  customFixedPostage?: number;
  sellingFees?: number; // Commission, platform, payment processing in sellingCostsCurrency
  sellerPaidPostage?: number; // Out-of-pocket shipping cost in sellingCostsCurrency
  otherDirectCosts?: number; // Grading, slabs, conservation in sellingCostsCurrency
  sellingCostsCurrency?: CurrencyCode;
  realizedNetProfit?: number; // Cached net profit in base USD

  // Notes & Visuals
  personalNotes?: string;
  obverseImage: string; // Transparent PNG data URL or URL
  reverseImage?: string; // Transparent PNG data URL or URL
  originalObverseImage?: string; // Raw uncropped photo
  originalReverseImage?: string; // Raw uncropped photo

  // Demo isolation
  isSample?: boolean;

  // Valuation History & Tracking
  valuationHistory: ValuationSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionCategory {
  id: string;
  owner_user_id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  preferredCurrency: CurrencyCode;
  createdAt: string;
  updatedAt: string;
}

export type SkuAttribute = 'country' | 'year' | 'denomination' | 'mintMark' | 'storageLocation' | 'category';
export type SkuSettingsPreset = 'sequential' | 'descriptive' | 'storage_based' | 'custom';

export interface SkuSettings {
  preset: SkuSettingsPreset;
  prefix: string;
  attributes: SkuAttribute[];
  abbreviationLength: number;
  separator: string;
  startingSequence: number;
  sequencePadding: number;
  defaultStorageLocation: string;
  includeStorageInSku: boolean;
  autoGenerateOnSave: boolean;
  highestAllocatedSequence: number;
}

export type PaperSize = 'A4' | 'Letter' | 'Continuous' | 'Custom';
export type LabelPresetId =
  | 'a4_24_66x32'
  | 'a4_24_66x33'
  | 'a4_24_64x33'
  | 'a4_8_99x67'
  | 'thermal_single_54x28'
  | 'thermal_single_50x25'
  | 'custom';

export interface LabelTemplate {
  id: string;
  name: string;
  presetId: LabelPresetId;
  paperSize: PaperSize;
  paperWidthMm: number;
  paperHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  labelsAcross: number;
  labelsDown: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  gapHorizontalMm: number;
  gapVerticalMm: number;
  orientation: 'portrait' | 'landscape';
  showBorder: boolean;
  fontSize: 'small' | 'medium' | 'large';
  textAlign: 'left' | 'center';
  barcodeHeightMm: number;
  showBarcodeText: boolean;
  useShortBarcodeId?: boolean; // Encode compact immutable barcodeId when SKU exceeds physical width
  copiesPerRecord: number | 'quantity';
  startPosition: number; // 0-indexed starting slot for partially used sheets
  offsetXOffsetMm: number; // Calibration fine-tuning offset
  offsetYOffsetMm: number; // Calibration fine-tuning offset

  // Content toggles (with safe defaults)
  showItemName: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showStorageLocation: boolean;
  showCountry: boolean;
  showYear: boolean;
  showDenomination: boolean;
  showMintMark: boolean;
  showGrade: boolean;
  showQuantity: boolean;
  showAskingPrice: boolean;
  showCoinPhoto: boolean;
  showBusinessName: boolean;
  businessName: string;
  showQrCode: boolean;
  showPurchaseCost: boolean; // STRICTLY off by default
  showProfit: boolean; // STRICTLY off by default
}

export interface LabelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalGridWidthMm: number;
  totalGridHeightMm: number;
}

export interface StorageSaveResult {
  ok: boolean;
  indexedDbOk: boolean;
  localStorageOk: boolean;
  indexedDbBytes: number;
  localStorageBytes: number;
  error?: string;
}

export interface BackupStatusInfo {
  lastBackupAt: string | null;
  lastModifiedAt: string | null;
  hasChangesSinceBackup: boolean;
}

export interface BackupPayloadV2 {
  app: 'CoinScan Pro';
  schemaVersion: 2;
  exportDate: string;
  userId: string;
  coinCount: number;
  containsImages: boolean;
  photoCount?: number;
  coins: CoinRecord[];
  categories: CollectionCategory[];
  skuSettings?: SkuSettings;
  labelTemplates?: LabelTemplate[];
}

export interface BackupValidationResult {
  valid: boolean;
  version: number;
  isCsv?: boolean;
  errors: string[];
  warnings?: string[];
  totalCoins: number;
  photoCount: number;
  duplicateSkuCount: number;
  recordsToAdd: CoinRecord[];
  recordsToUpdate: CoinRecord[];
  recordsToSkip: CoinRecord[];
  categories: CollectionCategory[];
  skuSettings?: SkuSettings;
  labelTemplates?: LabelTemplate[];
}
