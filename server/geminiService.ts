import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import type { CoinIdentification, MetalCategory } from '../src/types/coin';
import {
  evaluateCoinMeltValue,
  isPreciousMetalCategory,
  parseMetalCompositionStrict,
  toSpotPriceReference,
  validateCoinMetalConsistency,
} from '../src/services/marketRatesService';

dotenv.config();

function getGenAIClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDataUri(dataUri: string): { mimeType: string; data: string } {
  const trimmed = dataUri.trim();
  const base64Marker = ';base64,';
  const markerIndex = trimmed.indexOf(base64Marker);

  if (trimmed.startsWith('data:') && markerIndex !== -1) {
    const mimeType = trimmed.slice(5, markerIndex) || 'image/jpeg';
    const rawBase64 = trimmed.slice(markerIndex + base64Marker.length).replace(/\s/g, '');
    return { mimeType, data: rawBase64 };
  }

  return {
    mimeType: 'image/jpeg',
    data: trimmed.replace(/\s/g, ''),
  };
}

const VALID_METAL_CATEGORIES: MetalCategory[] = [
  'gold',
  'silver',
  'platinum',
  'palladium',
  'copper',
  'clad',
  'other',
];

const COIN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    country: { type: Type.STRING },
    denomination: { type: Type.STRING },
    currency: { type: Type.STRING },
    year: { type: Type.INTEGER },
    mintMark: { type: Type.STRING },
    mintMarkDiagnostic: {
      type: Type.STRING,
      description: 'Short note telling the user where to look on the coin to verify the mint mark.',
    },
    series: { type: Type.STRING },
    metalComposition: {
      type: Type.STRING,
      description: 'Explicit alloy breakdown (e.g. "22K Gold (.9167 Fineness)", "90% Silver, 10% Copper", "Cupro-Nickel Clad").',
    },
    metalCategory: {
      type: Type.STRING,
      description: 'One of: gold, silver, platinum, palladium, copper, clad, other. Must strictly agree with metalComposition.',
    },
    fineness: {
      type: Type.NUMBER,
      description: 'Decimal precious-metal purity between 0 and 1 (e.g. 0.9167 for 22K gold, 0.925 for sterling). Return 0 if unknown or base/clad metal.',
    },
    weightGrams: {
      type: Type.NUMBER,
      description: 'Standard specification weight in grams (0 if uncertain).',
    },
    diameterMm: { type: Type.NUMBER },
    rarity: { type: Type.STRING },
    identificationConfidence: {
      type: Type.INTEGER,
      description: '0-100 integer for confidence in coin type, country, year, and mint mark identification.',
    },
    gradingConfidence: {
      type: Type.INTEGER,
      description: '0-100 integer for confidence in estimating visible wear/grade from photographs alone.',
    },
    valuationConfidence: {
      type: Type.INTEGER,
      description: '0-100 integer for confidence in the provisional USD value range.',
    },
    confidenceScore: {
      type: Type.INTEGER,
      description: '0-100 integer representing overall identification confidence.',
    },
    estimatedGradeRange: {
      type: Type.STRING,
      description: 'Provisional Sheldon grade range (e.g., "AU-55 to MS-62") based strictly on photos.',
    },
    conditionDetails: { type: Type.STRING },
    historicalSignificance: { type: Type.STRING },
    estimatedValue: { type: Type.NUMBER },
    lowValue: { type: Type.NUMBER },
    highValue: { type: Type.NUMBER },
    slabbedEstimatedValue: { type: Type.NUMBER },
    slabbedLowValue: { type: Type.NUMBER },
    slabbedHighValue: { type: Type.NUMBER },
    valuationRationale: {
      type: Type.STRING,
      description: 'Concise 1-2 sentence explanation of why this provisional market range applies (key drivers: mintage, condition range, collector demand, or bullion content).',
    },
    faceValue: { type: Type.STRING },
    alternativeMatches: {
      type: Type.ARRAY,
      description: 'Array of up to 2 close varieties with country, year, mintMark, and distinguishingFeature.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          country: { type: Type.STRING },
          year: { type: Type.INTEGER },
          mintMark: { type: Type.STRING },
          denomination: { type: Type.STRING },
          distinguishingFeature: { type: Type.STRING },
          estimatedValue: { type: Type.NUMBER },
        },
        required: ['country', 'year', 'mintMark', 'distinguishingFeature'],
      },
    },
  },
  required: [
    'title',
    'country',
    'denomination',
    'year',
    'mintMark',
    'mintMarkDiagnostic',
    'metalComposition',
    'metalCategory',
    'fineness',
    'identificationConfidence',
    'gradingConfidence',
    'valuationConfidence',
    'confidenceScore',
    'estimatedGradeRange',
    'estimatedValue',
    'lowValue',
    'highValue',
    'valuationRationale',
    'alternativeMatches',
  ],
};

function isDailyQuotaExhausted(error: unknown): boolean {
  if (!error) return false;
  const str = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    str.includes('free tier') ||
    str.includes('per day limit exceeded') ||
    str.includes('daily limit') ||
    str.includes('generaterequestsperday') ||
    str.includes('quota exceeded for metric')
  );
}

function isRetryableGeminiError(error: unknown): boolean {
  if (!error) return false;
  if (isDailyQuotaExhausted(error)) return false;

  const errStr = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status = (error as any)?.status || (error as any)?.code || (error as any)?.statusCode;

  if (status === 503 || status === 429 || status === 500 || status === 502 || status === 504) {
    return true;
  }

  return (
    errStr.includes('overloaded') ||
    errStr.includes('too busy') ||
    errStr.includes('unavailable') ||
    errStr.includes('resource_exhausted') ||
    errStr.includes('socket hang up') ||
    errStr.includes('econnreset') ||
    errStr.includes('etimedout') ||
    errStr.includes('fetch failed') ||
    errStr.includes('network error')
  );
}

function sleepWithJitter(ms: number): Promise<void> {
  const jitter = Math.floor(Math.random() * (ms * 0.25));
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

export async function identifyAndValuateCoin(
  obverseBase64: string,
  reverseBase64?: string,
  preferredCurrency: string = 'USD'
): Promise<CoinIdentification> {
  const ai = getGenAIClient();

  const obverseParsed = parseDataUri(obverseBase64);
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [
    {
      inlineData: {
        mimeType: obverseParsed.mimeType,
        data: obverseParsed.data,
      },
    },
  ];

  if (reverseBase64) {
    const reverseParsed = parseDataUri(reverseBase64);
    if (reverseParsed.data) {
      parts.push({
        inlineData: {
          mimeType: reverseParsed.mimeType,
          data: reverseParsed.data,
        },
      });
    }
  }

  const promptText = `Examine the coin photo(s) (${reverseBase64 ? 'Obverse and Reverse' : 'Obverse'}) and return accurate JSON identification and provisional valuation in base USD (User display preference: ${preferredCurrency}):
1. Identify title, country, denomination, currency, year (integer, 0 if undated), mintMark (e.g. P, D, S, or None), mintMarkDiagnostic (short note telling the user where to look on the coin to verify the mint mark), series, metalComposition, metalCategory (strictly matching composition: gold, silver, platinum, palladium, copper, clad, or other), fineness (decimal purity 0..1 ONLY if certain; return 0 if uncertain or base metal), weightGrams (standard spec in grams; 0 if uncertain), diameterMm, rarity (Common, Uncommon, Scarce, Rare, Very Rare, or Key Date), and concise historicalSignificance.
2. Provide SEPARATE 0-100 confidence integers: identificationConfidence, gradingConfidence, valuationConfidence, plus overall confidenceScore.
3. Provide estimatedGradeRange (string range, e.g., "AU-55 to MS-62", keeping grading strictly provisional from photos) and brief conditionDetails.
4. Provide alternativeMatches: array of up to 2 close varieties with country, year, mintMark, distinguishingFeature, title, denomination, and estimatedValue (in base USD).
5. Estimate provisional market value in base USD: raw uncertified estimatedValue, lowValue, highValue, certified holder estimates (slabbedEstimatedValue, slabbedLowValue, slabbedHighValue), faceValue, and valuationRationale explaining why this range applies. DO NOT invent auction citations, lot numbers, or URLs.`;

  parts.push({ text: promptText });

  const systemInstruction =
    'You are a Senior Numismatist and Coin Appraiser. Provide conservative numismatic identification, consistent metallurgy, separate identification/grading/valuation confidence scores, grade ranges, mint mark diagnostics, close alternative varieties, and provisional USD estimates. Never fabricate auction citations, lot numbers, URLs, or unverified fineness values.';

  const modelTiers: Array<{
    model: string;
    maxAttempts: number;
    backoffMs: number;
    config: Record<string, any>;
  }> = [
    {
      model: 'gemini-3.1-flash-lite',
      maxAttempts: 2,
      backoffMs: 500,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: COIN_RESPONSE_SCHEMA,
      },
    },
    {
      model: 'gemini-4-hydrogen',
      maxAttempts: 1,
      backoffMs: 600,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: COIN_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  ];

  let lastError: unknown = null;
  let totalAttemptNumber = 0;

  for (const tier of modelTiers) {
    for (let tryIndex = 0; tryIndex < tier.maxAttempts; tryIndex++) {
      totalAttemptNumber++;

      if (totalAttemptNumber > 1) {
        const waitTime = tier.backoffMs * Math.pow(1.3, tryIndex);
        console.warn(`[GeminiService] Retrying AI valuation with ${tier.model} (attempt ${totalAttemptNumber}) after ${waitTime}ms...`);
        await sleepWithJitter(waitTime);
      }

      try {
        const response = await ai.models.generateContent({
          model: tier.model,
          contents: { parts },
          config: tier.config,
        });

        const responseText = response.text;
        if (!responseText) {
          throw new Error(`Empty response from ${tier.model}`);
        }

        const cleanedJson = responseText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();

        const parsed = JSON.parse(cleanedJson);

        // Enforce strict metal consistency & verified-only bullion math
        const compositionStr = String(parsed.metalComposition || 'Unspecified Alloy').trim();
        const strictParsed = parseMetalCompositionStrict(compositionStr);

        let metalCategory: MetalCategory = VALID_METAL_CATEGORIES.includes(parsed.metalCategory)
          ? parsed.metalCategory
          : strictParsed.metalCategory || 'other';

        // Never allow contradicting category like 22K Gold + Clad
        if (strictParsed.metalCategory && isPreciousMetalCategory(strictParsed.metalCategory) && metalCategory !== strictParsed.metalCategory) {
          metalCategory = strictParsed.metalCategory;
        } else if (strictParsed.metalCategory === 'clad' && isPreciousMetalCategory(metalCategory)) {
          metalCategory = 'clad';
        }

        const rawFineness = typeof parsed.fineness === 'number' && parsed.fineness > 0 && parsed.fineness <= 1 ? parsed.fineness : undefined;
        const verifiedFineness =
          strictParsed.finenessVerified && strictParsed.fineness
            ? strictParsed.fineness
            : metalCategory === 'clad'
            ? 0
            : rawFineness;

        const weightGrams =
          typeof parsed.weightGrams === 'number' && parsed.weightGrams > 0 ? parsed.weightGrams : undefined;

        const identificationConfidence = Math.max(
          0,
          Math.min(100, Math.round(Number(parsed.identificationConfidence ?? parsed.confidenceScore ?? 78)))
        );
        const gradingConfidence = Math.max(
          0,
          Math.min(100, Math.round(Number(parsed.gradingConfidence ?? (reverseBase64 ? identificationConfidence - 10 : identificationConfidence - 20))))
        );
        const valuationConfidence = Math.max(
          0,
          Math.min(100, Math.round(Number(parsed.valuationConfidence ?? identificationConfidence - 12)))
        );
        const confidenceScore = Math.max(0, Math.min(100, Math.round(Number(parsed.confidenceScore ?? identificationConfidence))));

        const gradeRange =
          (typeof parsed.estimatedGradeRange === 'string' && parsed.estimatedGradeRange.trim()) ||
          'VF-20 to EF-40';

        const rawEst = typeof parsed.estimatedValue === 'number' && parsed.estimatedValue >= 0 ? parsed.estimatedValue : 1;
        const rawLow = typeof parsed.lowValue === 'number' && parsed.lowValue >= 0 ? parsed.lowValue : Math.round(rawEst * 0.75 * 100) / 100;
        const rawHigh = typeof parsed.highValue === 'number' && parsed.highValue >= 0 ? parsed.highValue : Math.round(rawEst * 1.3 * 100) / 100;

        const slabbedEst =
          typeof parsed.slabbedEstimatedValue === 'number' && parsed.slabbedEstimatedValue > 0
            ? parsed.slabbedEstimatedValue
            : Math.round(Math.max(rawEst * 1.35, rawEst + 25) * 100) / 100;
        const slabbedLow =
          typeof parsed.slabbedLowValue === 'number' && parsed.slabbedLowValue > 0
            ? parsed.slabbedLowValue
            : Math.round(Math.max(rawLow * 1.3, rawLow + 18) * 100) / 100;
        const slabbedHigh =
          typeof parsed.slabbedHighValue === 'number' && parsed.slabbedHighValue > 0
            ? parsed.slabbedHighValue
            : Math.round(Math.max(rawHigh * 1.4, rawHigh + 35) * 100) / 100;

        const candidateForMelt = {
          metalComposition: compositionStr,
          metalCategory,
          fineness: verifiedFineness,
          weightGrams,
        };
        const consistency = validateCoinMetalConsistency(candidateForMelt);
        const meltResult = evaluateCoinMeltValue(candidateForMelt, 'USD');
        const verifiedMeltUSD = meltResult.available && meltResult.breakdown ? meltResult.breakdown.meltValueUSD : undefined;

        const valuationMethodology =
          verifiedMeltUSD !== undefined && verifiedMeltUSD >= rawEst * 0.8
            ? 'bullion_melt'
            : 'provisional_ai_inference';

        const evidenceQuality =
          confidenceScore >= 75 && Boolean(reverseBase64) ? 'moderate_confidence' : 'provisional_estimate';

        const nowIso = new Date().toISOString();

        const alternativeMatches = Array.isArray(parsed.alternativeMatches)
          ? parsed.alternativeMatches.slice(0, 2).map((alt: any) => ({
              title:
                alt.title ||
                `${alt.year || parsed.year || ''} ${alt.country || parsed.country || ''} ${alt.denomination || parsed.denomination || 'Coin'}${
                  alt.mintMark && alt.mintMark !== 'None' ? ` (${alt.mintMark})` : ''
                }`.trim(),
              country: alt.country || parsed.country || 'Unknown',
              year: typeof alt.year === 'number' ? alt.year : parseInt(String(alt.year)) || parsed.year || 0,
              mintMark: alt.mintMark || 'None',
              denomination: alt.denomination || parsed.denomination || 'Unknown',
              distinguishingFeature:
                alt.distinguishingFeature || 'Close die or mint mark variety requiring physical inspection.',
              estimatedValue: typeof alt.estimatedValue === 'number' ? alt.estimatedValue : rawEst,
            }))
          : [];

        return {
          title: parsed.title || `${parsed.year || ''} ${parsed.country || ''} ${parsed.denomination || 'Coin'}`.trim(),
          country: parsed.country || 'Unknown',
          denomination: parsed.denomination || 'Unknown',
          currency: 'USD',
          year: typeof parsed.year === 'number' ? parsed.year : parseInt(String(parsed.year)) || 0,
          mintMark: parsed.mintMark || 'None',
          mintMarkDiagnostic:
            parsed.mintMarkDiagnostic ||
            'Inspect the reverse lower field or obverse near the date under magnification to verify the mint mark.',
          series: parsed.series || parsed.denomination || 'Standard Issue',
          metalComposition: compositionStr,
          metalCategory,
          fineness: verifiedFineness,
          preciousMetalGrams: consistency.valid ? consistency.preciousMetalGrams : undefined,
          metalVerified: Boolean(
            consistency.valid &&
              (metalCategory === 'clad' ||
                (isPreciousMetalCategory(metalCategory) && verifiedFineness && verifiedFineness > 0 && weightGrams && weightGrams > 0))
          ),
          weightGrams,
          diameterMm: typeof parsed.diameterMm === 'number' && parsed.diameterMm > 0 ? parsed.diameterMm : undefined,
          rarity: (['Common', 'Uncommon', 'Scarce', 'Rare', 'Very Rare', 'Key Date'].includes(parsed.rarity) ? parsed.rarity : 'Common') as any,
          identificationConfidence,
          gradingConfidence,
          valuationConfidence,
          confidenceScore,
          estimatedGradeRange: gradeRange,
          estimatedGrade: gradeRange,
          conditionDetails: parsed.conditionDetails || 'Typical circulation wear consistent with age.',
          gradingProvisionalNotice:
            'Provisional photo assessment only — does not verify authenticity or equate to PCGS/NGC/ANACS certification.',
          historicalSignificance: parsed.historicalSignificance || 'Standard numismatic issue.',
          estimatedValue: rawEst,
          lowValue: rawLow,
          highValue: rawHigh,
          slabbedEstimatedValue: slabbedEst,
          slabbedLowValue: slabbedLow,
          slabbedHighValue: slabbedHigh,
          bullionMeltValue: verifiedMeltUSD,
          bullionDetails: meltResult.available ? meltResult.breakdown : undefined,
          spotPriceReference: meltResult.available ? toSpotPriceReference(metalCategory) : undefined,
          faceValue: parsed.faceValue || parsed.denomination || 'N/A',
          valuationMethodology,
          evidenceQuality,
          evidenceCount: 0,
          valuationRationale:
            (typeof parsed.valuationRationale === 'string' && parsed.valuationRationale.trim()) ||
            'Provisional AI estimate derived from visible type, grade range, and general collector demand without verified live auction comps.',
          isProvisionalValuation: true,
          valuationDate: nowIso,
          lastValuationUpdate: nowIso,
          supportingSources: ['Provisional AI Photo Assessment (Unverified against Live Comps)'],
          alternativeMatches,
          recentAuctionComps: [],
        };
      } catch (err: any) {
        lastError = err;

        if (isDailyQuotaExhausted(err)) {
          console.warn(`[GeminiService] Daily quota exhausted on ${tier.model}, advancing to fallback...`);
          break;
        }

        const isTransient = isRetryableGeminiError(err);
        console.warn(`[GeminiService] Attempt ${totalAttemptNumber} (${tier.model}) failed:`, err?.message || err);

        if (!isTransient && tryIndex < tier.maxAttempts - 1) {
          break;
        }
      }
    }
  }

  const isTransient = isRetryableGeminiError(lastError);
  const rawMsg = lastError instanceof Error ? lastError.message : String(lastError || 'Coin identification failed');
  const userFriendlyMsg = isTransient
    ? 'The AI valuation service is temporarily busy due to high network demand. Please tap "Identify Coin" to retry.'
    : rawMsg;

  const finalError: any = new Error(userFriendlyMsg);
  finalError.isRetryable = isTransient;
  finalError.statusCode = isTransient ? 503 : 500;
  throw finalError;
}
