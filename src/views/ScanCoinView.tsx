import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  Trash2,
  Image as ImageIcon,
  X,
  Check,
  Eye,
  Target,
  Crosshair,
  Zap,
  FlipHorizontal,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../context/CollectionContext';
import { formatCoinValue, toUsdAmount, USD_FX_RATES } from '../utils/currency';
import {
  evaluateCoinMeltValue,
  parseMetalCompositionStrict,
  toSpotPriceReference,
  validateCoinMetalConsistency,
} from '../services/marketRatesService';
import { autoDetectCoinCircle, createTransparentCoinPNG, loadImage, normalizeRawImage } from '../utils/imageProcessor';
import { CropAdjusterModal } from '../components/CropAdjusterModal';
import { VALID_CURRENCIES } from '../types/coin';
import type {
  AlternativeCoinMatch,
  BoundaryCircle,
  CoinIdentification,
  CoinRecord,
  CurrencyCode,
  MetalCategory,
} from '../types/coin';

interface ScanCoinViewProps {
  onSuccessSave?: (coin: CoinRecord) => void;
  onOpenAuth: () => void;
}

export const ScanCoinView: React.FC<ScanCoinViewProps> = ({ onSuccessSave, onOpenAuth }) => {
  const { user, currency } = useAuth();
  const { addCoin, checkForDuplicate, categories } = useCollection();

  const [obverseRaw, setObverseRaw] = useState<string | null>(null);
  const [reverseRaw, setReverseRaw] = useState<string | null>(null);
  const [obverseTransparent, setObverseTransparent] = useState<string | null>(null);
  const [reverseTransparent, setReverseTransparent] = useState<string | null>(null);

  const [obverseBoundary, setObverseBoundary] = useState<BoundaryCircle | null>(null);
  const [reverseBoundary, setReverseBoundary] = useState<BoundaryCircle | null>(null);

  const [processingSide, setProcessingSide] = useState<'obverse' | 'reverse' | null>(null);
  const [obverseViewMode, setObverseViewMode] = useState<'cutout' | 'original'>('cutout');
  const [reverseViewMode, setReverseViewMode] = useState<'cutout' | 'original'>('cutout');
  const [previewBackdrop, setPreviewBackdrop] = useState<'grid' | 'dark' | 'white'>('grid');

  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  const [obverseShowGuide, setObverseShowGuide] = useState(false);
  const [reverseShowGuide, setReverseShowGuide] = useState(false);

  const [reticleSize, setReticleSize] = useState<'standard' | 'large' | 'small'>('standard');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);

  const [liveCameraSide, setLiveCameraSide] = useState<'obverse' | 'reverse' | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [shutterFlash, setShutterFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [adjusterSide, setAdjusterSide] = useState<'obverse' | 'reverse' | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [savingCoin, setSavingCoin] = useState(false);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [identification, setIdentification] = useState<CoinIdentification | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<CoinRecord | null>(null);
  const [valuationMode, setValuationMode] = useState<'raw' | 'slabbed'>('raw');
  const [activeSwapIndex, setActiveSwapIndex] = useState<number | null>(null);

  const [editedRecord, setEditedRecord] = useState<Partial<CoinRecord>>({
    purchasePrice: undefined,
    purchaseDate: new Date().toISOString().split('T')[0],
    quantity: 1,
    category: 'General Collection',
    personalNotes: '',
    status: 'in_collection',
    isFavorite: false,
  });

  const obverseCameraInputRef = useRef<HTMLInputElement | null>(null);
  const obverseGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const reverseCameraInputRef = useRef<HTMLInputElement | null>(null);
  const reverseGalleryInputRef = useRef<HTMLInputElement | null>(null);

  const analysisSteps = [
    'Isolating high-resolution coin reliefs & rim boundaries...',
    'Matching country, denomination, year & mint mark...',
    'Inspecting surface wear, luster & Sheldon numerical grade...',
    `Calculating current market valuation & bullion melt in ${currency}...`,
  ];

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  useEffect(() => {
    if (!analyzing) {
      setAnalysisStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setAnalysisStepIndex((prev) => (prev < analysisSteps.length - 1 ? prev + 1 : prev));
    }, 1800);
    return () => clearInterval(interval);
  }, [analyzing]);

  const triggerCaptureNotice = (message: string) => {
    setCaptureNotice(message);
    setTimeout(() => {
      setCaptureNotice((prev) => (prev === message ? null : prev));
    }, 4500);
  };

  const openLiveCamera = async (side: 'obverse' | 'reverse', mode: 'environment' | 'user' = 'environment') => {
    setError(null);
    setLiveCameraSide(side);
    setFacingMode(mode);
    setTorchOn(false);

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
      });
      setCameraStream(stream);

      const track = stream.getVideoTracks()[0];
      const capabilities: any = track?.getCapabilities ? track.getCapabilities() : {};
      setHasTorchCapability(Boolean(capabilities?.torch));

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err) {
      console.warn('Live camera unavailable, falling back to native camera input:', err);
      setLiveCameraSide(null);
      if (side === 'obverse') {
        obverseCameraInputRef.current?.click();
      } else {
        reverseCameraInputRef.current?.click();
      }
    }
  };

  const closeLiveCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    setLiveCameraSide(null);
    setTorchOn(false);
  };

  const switchCameraFacing = () => {
    if (!liveCameraSide) return;
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    openLiveCamera(liveCameraSide, nextMode);
  };

  const toggleTorch = async () => {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn(!torchOn);
    } catch (err) {
      console.warn('Torch constraint error:', err);
    }
  };

  const captureFromLiveCamera = async () => {
    if (!videoRef.current || !liveCameraSide) return;
    const video = videoRef.current;
    const side = liveCameraSide;

    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 250);

    const vw = video.videoWidth || 1024;
    const vh = video.videoHeight || 1024;
    const cropSize = Math.min(vw, vh);
    const sx = Math.round((vw - cropSize) / 2);
    const sy = Math.round((vh - cropSize) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 800, 800);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

    closeLiveCamera();
    await processRawCapture(dataUrl, side);
  };

  const handleAutoCenterSide = async (side: 'obverse' | 'reverse') => {
    const raw = side === 'obverse' ? obverseRaw : reverseRaw;
    if (!raw) return;

    setProcessingSide(side);
    try {
      const img = await loadImage(raw);
      const newBoundary = autoDetectCoinCircle(img);
      const newPNG = await createTransparentCoinPNG(img, newBoundary, 420);

      if (side === 'obverse') {
        setObverseBoundary(newBoundary);
        setObverseTransparent(newPNG);
      } else {
        setReverseBoundary(newBoundary);
        setReverseTransparent(newPNG);
      }
      triggerCaptureNotice(`${side === 'obverse' ? 'Front' : 'Back'} coin centered!`);
    } catch (err) {
      console.error('Auto-center failed:', err);
      setError('Could not auto-center coin.');
    } finally {
      setProcessingSide(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, side: 'obverse' | 'reverse') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setProcessingSide(side);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        await processRawCapture(dataUrl, side);
      } else {
        setProcessingSide(null);
      }
    };
    reader.onerror = () => {
      setProcessingSide(null);
      setError('Failed to read the selected photo. Please try another image.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const processRawCapture = async (dataUrl: string, side: 'obverse' | 'reverse') => {
    setProcessingSide(side);
    setError(null);

    try {
      const normalizedRaw = await normalizeRawImage(dataUrl, 800, 0.75);
      if (side === 'obverse') {
        setObverseRaw(normalizedRaw);
      } else {
        setReverseRaw(normalizedRaw);
      }

      const img = await loadImage(normalizedRaw);
      const detectedBoundary = autoDetectCoinCircle(img);
      const transparentPNG = await createTransparentCoinPNG(img, detectedBoundary, 420);

      if (side === 'obverse') {
        setObverseBoundary(detectedBoundary);
        setObverseTransparent(transparentPNG);
        setObverseViewMode('cutout');
        triggerCaptureNotice(
          'Front (Obverse) photo captured & background removed! Add Back photo or tap "Identify Now".'
        );
      } else {
        setReverseBoundary(detectedBoundary);
        setReverseTransparent(transparentPNG);
        setReverseViewMode('cutout');
        triggerCaptureNotice('Back (Reverse) photo captured & background removed!');
      }
    } catch (err: any) {
      console.error('Boundary processing error:', err);
      setError('Could not automatically isolate the coin edge. You can still adjust the crop manually.');
    } finally {
      setProcessingSide(null);
    }
  };

  const clearSide = (side: 'obverse' | 'reverse') => {
    if (side === 'obverse') {
      setObverseRaw(null);
      setObverseTransparent(null);
      setObverseBoundary(null);
    } else {
      setReverseRaw(null);
      setReverseTransparent(null);
      setReverseBoundary(null);
    }
  };

  const scanAbortRef = useRef<AbortController | null>(null);

  const handleCancelScan = () => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
      scanAbortRef.current = null;
    }
    setAnalyzing(false);
  };

  const handleRunAIIdentification = async () => {
    if (!obverseRaw && !obverseTransparent) {
      setError('Please take or upload a photo of the Front (Obverse) of the coin first.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setRetryNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const abortController = new AbortController();
    scanAbortRef.current = abortController;
    // Generous 75s timeout to allow server-side multi-model retry and backoff to complete
    const timeoutId = setTimeout(() => abortController.abort(), 75000);

    const MAX_CLIENT_ATTEMPTS = 3;

    try {
      const compactObverse = await normalizeRawImage((obverseRaw || obverseTransparent)!, 600);
      const compactReverse =
        reverseRaw || reverseTransparent
          ? await normalizeRawImage((reverseRaw || reverseTransparent)!, 600)
          : undefined;

      const payload = {
        obverseImage: compactObverse,
        reverseImage: compactReverse,
        currency,
      };

      let result: CoinIdentification | null = null;
      let lastErr: any = null;

      for (let attempt = 1; attempt <= MAX_CLIENT_ATTEMPTS; attempt++) {
        if (abortController.signal.aborted) break;

        try {
          if (attempt > 1) {
            setRetryNotice(`AI valuation service is busy right now. Automatically retrying (attempt ${attempt} of ${MAX_CLIENT_ATTEMPTS})...`);
            // Wait 2.2s before re-calling to let upstream API cluster clear
            await new Promise((resolve) => setTimeout(resolve, 2200));
            if (abortController.signal.aborted) break;
          }

          const response = await fetch('/api/identify-coin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal,
          });

          const responseText = await response.text();
          let parsedBody: any = null;
          try {
            parsedBody = JSON.parse(responseText);
          } catch {
            throw new Error(
              !response.ok
                ? `Server error (${response.status}): ${responseText.slice(0, 140)}`
                : 'Invalid JSON response from coin identification server.'
            );
          }

          if (!response.ok) {
            const errObj: any = new Error(parsedBody?.error || `Server responded with ${response.status}`);
            errObj.status = response.status;
            errObj.retryable = parsedBody?.retryable || response.status === 503 || response.status === 429;
            throw errObj;
          }

          result = parsedBody;
          break; // Succeeded!
        } catch (fetchErr: any) {
          lastErr = fetchErr;
          if (fetchErr?.name === 'AbortError') throw fetchErr;

          const errMsg = String(fetchErr?.message || '').toLowerCase();
          const isBusyOrTransient =
            fetchErr?.retryable ||
            fetchErr?.status === 503 ||
            fetchErr?.status === 429 ||
            errMsg.includes('busy') ||
            errMsg.includes('overloaded') ||
            errMsg.includes('capacity') ||
            errMsg.includes('rate limit') ||
            errMsg.includes('failed to fetch') ||
            errMsg.includes('network');

          if (isBusyOrTransient && attempt < MAX_CLIENT_ATTEMPTS) {
            console.warn(`[Client] Transient busy error encountered on attempt ${attempt}, retrying...`);
            continue;
          }
          throw fetchErr;
        }
      }

      if (!result) {
        throw lastErr || new Error('Coin identification could not be completed.');
      }

      setRetryNotice(null);
      setValuationMode('raw');
      setActiveSwapIndex(null);
      setIdentification(result);

      const initialGradeRange = result!.estimatedGradeRange || result!.estimatedGrade;
      const strictMetal = parseMetalCompositionStrict(result!.metalComposition || '');
      const initialCategory = (result!.metalCategory || strictMetal.metalCategory || 'other') as MetalCategory;
      const initialFineness =
        result!.fineness !== undefined && result!.fineness !== null
          ? result!.fineness
          : strictMetal.finenessVerified
          ? strictMetal.fineness
          : undefined;

      setEditedRecord((prev) => ({
        ...prev,
        title: result!.title,
        country: result!.country,
        year: result!.year,
        denomination: result!.denomination,
        mintMark: result!.mintMark,
        estimatedGrade: initialGradeRange,
        estimatedValue: result!.estimatedValue,
        metalCategory: initialCategory,
        metalComposition: result!.metalComposition || '',
        fineness: initialFineness,
        weightGrams: result!.weightGrams,
        purchaseCurrency: prev.purchaseCurrency || currency,
        category: result!.series ? `${result!.country} ${result!.series}` : `${result!.country} Coins`,
      }));

      const duplicate = checkForDuplicate({
        country: result.country,
        year: result.year,
        denomination: result.denomination,
        mintMark: result.mintMark,
      });
      setDuplicateWarning(duplicate);

      if (result.detectedBoundaries?.obverse && obverseRaw) {
        const refinedBoundary: BoundaryCircle = {
          cx: Math.max(0.15, Math.min(0.85, result.detectedBoundaries.obverse.cx || 0.5)),
          cy: Math.max(0.15, Math.min(0.85, result.detectedBoundaries.obverse.cy || 0.5)),
          radius: Math.max(0.15, Math.min(0.46, result.detectedBoundaries.obverse.radius || 0.38)),
          aspectRatio: 1.0,
          rotation: 0,
          feather: 2,
        };
        setObverseBoundary(refinedBoundary);
        const refinedPNG = await createTransparentCoinPNG(obverseRaw, refinedBoundary, 420);
        setObverseTransparent(refinedPNG);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Valuation took too long or was cancelled. Please tap "Identify Coin" to try again.');
      } else {
        console.error('AI Identification failed:', err);
        setError(err?.message || 'Coin identification failed. Please ensure the coin is clearly visible.');
      }
    } finally {
      clearTimeout(timeoutId);
      scanAbortRef.current = null;
      setRetryNotice(null);
      setAnalyzing(false);
    }
  };

  const handleSwapAlternativeMatch = (alt: AlternativeCoinMatch, index: number) => {
    if (!identification) return;
    const swappedTitle =
      alt.title ||
      `${alt.year} ${alt.country} ${alt.denomination || identification.denomination}${
        alt.mintMark && alt.mintMark !== 'None' ? ` (${alt.mintMark})` : ''
      }`.trim();
    const baseRawVal = alt.estimatedValue !== undefined ? alt.estimatedValue : identification.estimatedValue;
    const effectiveVal =
      valuationMode === 'slabbed'
        ? Math.round(Math.max(baseRawVal * 1.35, baseRawVal + 25) * 100) / 100
        : baseRawVal;

    setActiveSwapIndex(index);
    setEditedRecord((prev) => ({
      ...prev,
      title: swappedTitle,
      country: alt.country,
      year: alt.year,
      mintMark: alt.mintMark,
      denomination: alt.denomination || identification.denomination,
      estimatedValue: effectiveVal,
      category: `${alt.country} Coins`,
    }));

    const duplicate = checkForDuplicate({
      country: alt.country,
      year: alt.year,
      denomination: alt.denomination || identification.denomination,
      mintMark: alt.mintMark,
    });
    setDuplicateWarning(duplicate);
    triggerCaptureNotice(`Swapped to variety: ${swappedTitle}`);
  };

  const handleRestorePrimaryMatch = () => {
    if (!identification) return;
    setActiveSwapIndex(null);
    const effectiveVal =
      valuationMode === 'slabbed'
        ? identification.slabbedEstimatedValue ||
          Math.round(Math.max(identification.estimatedValue * 1.35, identification.estimatedValue + 25) * 100) / 100
        : identification.estimatedValue;

    setEditedRecord((prev) => ({
      ...prev,
      title: identification.title,
      country: identification.country,
      year: identification.year,
      mintMark: identification.mintMark,
      denomination: identification.denomination,
      estimatedGrade: identification.estimatedGradeRange || identification.estimatedGrade,
      estimatedValue: effectiveVal,
      category: identification.series
        ? `${identification.country} ${identification.series}`
        : `${identification.country} Coins`,
    }));

    const duplicate = checkForDuplicate({
      country: identification.country,
      year: identification.year,
      denomination: identification.denomination,
      mintMark: identification.mintMark,
    });
    setDuplicateWarning(duplicate);
    triggerCaptureNotice(`Restored primary identification: ${identification.title}`);
  };

  const handleToggleValuationMode = (mode: 'raw' | 'slabbed') => {
    setValuationMode(mode);
    if (!identification) return;
    const activeAlt =
      activeSwapIndex !== null && identification.alternativeMatches?.[activeSwapIndex]
        ? identification.alternativeMatches[activeSwapIndex]
        : null;
    const baseRaw = activeAlt?.estimatedValue ?? identification.estimatedValue;
    const nextValue =
      mode === 'slabbed'
        ? activeAlt
          ? Math.round(Math.max(baseRaw * 1.35, baseRaw + 25) * 100) / 100
          : identification.slabbedEstimatedValue ||
            Math.round(Math.max(baseRaw * 1.35, baseRaw + 25) * 100) / 100
        : baseRaw;
    setEditedRecord((prev) => ({
      ...prev,
      estimatedValue: nextValue,
    }));
  };

  const handleSaveToCollection = async () => {
    if (!identification || !obverseTransparent || savingCoin) return;

    const mergedMetalCandidate: Partial<CoinIdentification> = {
      ...identification,
      metalCategory: editedRecord.metalCategory ?? identification.metalCategory,
      metalComposition:
        editedRecord.metalComposition !== undefined ? editedRecord.metalComposition : identification.metalComposition,
      fineness: editedRecord.fineness !== undefined ? editedRecord.fineness : identification.fineness,
      weightGrams: editedRecord.weightGrams !== undefined ? editedRecord.weightGrams : identification.weightGrams,
    };
    const metalValidation = validateCoinMetalConsistency(mergedMetalCandidate);
    if (!metalValidation.valid) {
      setError(`Metal data contradiction: ${metalValidation.errors[0]} Please align composition, category, and fineness before saving.`);
      return;
    }

    setSavingCoin(true);
    setError(null);
    try {
      const newCoinId = `coin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      // Normalize raw photos via HTML5 canvas to max 800px at JPEG quality 0.75
      const safeRawObverse = obverseRaw ? await normalizeRawImage(obverseRaw, 800, 0.75) : undefined;
      const safeRawReverse = reverseRaw ? await normalizeRawImage(reverseRaw, 800, 0.75) : undefined;

      const meltEval = evaluateCoinMeltValue(mergedMetalCandidate, currency);

      const finalGrade =
        editedRecord.estimatedGrade || identification.estimatedGradeRange || identification.estimatedGrade;
      const finalEstValue =
        editedRecord.estimatedValue !== undefined ? editedRecord.estimatedValue : identification.estimatedValue;
      const finalLowValue =
        valuationMode === 'slabbed'
          ? identification.slabbedLowValue || Math.round(finalEstValue * 0.8 * 100) / 100
          : identification.lowValue;
      const finalHighValue =
        valuationMode === 'slabbed'
          ? identification.slabbedHighValue || Math.round(finalEstValue * 1.25 * 100) / 100
          : identification.highValue;

      const effectivePurchaseCur = editedRecord.purchaseCurrency || currency;

      const newRecord: CoinRecord = {
        id: newCoinId,
        owner_user_id: user?.uid || 'guest',
        ...identification,
        currency: 'USD',
        title: editedRecord.title || identification.title,
        country: editedRecord.country || identification.country,
        year: editedRecord.year !== undefined ? editedRecord.year : identification.year,
        denomination: editedRecord.denomination || identification.denomination,
        mintMark: editedRecord.mintMark !== undefined ? editedRecord.mintMark : identification.mintMark,
        metalCategory: mergedMetalCandidate.metalCategory,
        metalComposition: mergedMetalCandidate.metalComposition || '',
        fineness: mergedMetalCandidate.fineness,
        weightGrams: mergedMetalCandidate.weightGrams,
        preciousMetalGrams: meltEval.preciousMetalGrams ?? metalValidation.preciousMetalGrams,
        metalVerified: Boolean(meltEval.available),
        bullionMeltValue: meltEval.available && meltEval.breakdown ? meltEval.breakdown.meltValueUSD : undefined,
        bullionDetails: meltEval.available ? meltEval.breakdown : undefined,
        spotPriceReference:
          mergedMetalCandidate.metalCategory ? toSpotPriceReference(mergedMetalCandidate.metalCategory) : undefined,
        estimatedGradeRange: finalGrade,
        estimatedGrade: finalGrade,
        estimatedValue: finalEstValue,
        lowValue: finalLowValue,
        highValue: finalHighValue,
        category: editedRecord.category || 'General Collection',
        purchaseCurrency: effectivePurchaseCur,
        ...(editedRecord.purchasePrice !== undefined ? { purchasePrice: editedRecord.purchasePrice } : {}),
        ...(editedRecord.purchaseDate ? { purchaseDate: editedRecord.purchaseDate } : {}),
        quantity: editedRecord.quantity || 1,
        personalNotes: editedRecord.personalNotes || '',
        status: editedRecord.status || 'in_collection',
        isFavorite: editedRecord.isFavorite || false,
        obverseImage: obverseTransparent,
        ...(reverseTransparent ? { reverseImage: reverseTransparent } : {}),
        ...(safeRawObverse ? { originalObverseImage: safeRawObverse } : {}),
        ...(safeRawReverse ? { originalReverseImage: safeRawReverse } : {}),
        valuationHistory: [
          {
            date: now,
            estimatedValue: finalEstValue,
            lowValue: finalLowValue,
            highValue: finalHighValue,
            currency: 'USD',
            grade: finalGrade,
            methodology: identification.valuationMethodology || 'provisional_ai_inference',
            evidenceQuality: identification.evidenceQuality || 'provisional_estimate',
            evidenceCount: identification.evidenceCount ?? (identification.recentAuctionComps?.length || 0),
            valuationConfidence: identification.valuationConfidence,
            valuationRationale: identification.valuationRationale,
            bullionMeltValue: meltEval.available && meltEval.breakdown ? meltEval.breakdown.meltValueUSD : undefined,
            spotPriceReference:
              mergedMetalCandidate.metalCategory ? toSpotPriceReference(mergedMetalCandidate.metalCategory) : undefined,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      await addCoin(newRecord);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#d4af37', '#fef08a', '#10b981'],
        });
      } catch {
        // Fallback if confetti fails
      }

      if (onSuccessSave) {
        onSuccessSave(newRecord);
      }

      handleResetScanner();
    } catch (err: any) {
      console.error('Failed to save coin:', err);
      let errorMsg = 'Failed to save coin to collection. Please check your network and try again.';
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          errorMsg = parsed?.error || err.message;
        } catch {
          errorMsg = err.message;
        }
      }
      setError(errorMsg);
    } finally {
      setSavingCoin(false);
    }
  };

  const handleResetScanner = () => {
    setObverseRaw(null);
    setReverseRaw(null);
    setObverseTransparent(null);
    setReverseTransparent(null);
    setObverseBoundary(null);
    setReverseBoundary(null);
    setIdentification(null);
    setDuplicateWarning(null);
    setValuationMode('raw');
    setActiveSwapIndex(null);
    setError(null);
    setCaptureNotice(null);
  };

  const getBackdropClass = () => {
    if (previewBackdrop === 'white') return 'bg-white';
    if (previewBackdrop === 'dark') return 'bg-slate-950';
    return 'bg-transparency-grid';
  };

  const currentStep = identification ? 3 : analyzing ? 2 : 1;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-32 md:pb-12">
      {/* Hidden Native File & Camera Inputs */}
      <input
        ref={obverseCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e, 'obverse')}
        className="hidden"
      />
      <input
        ref={obverseGalleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileSelect(e, 'obverse')}
        className="hidden"
      />
      <input
        ref={reverseCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e, 'reverse')}
        className="hidden"
      />
      <input
        ref={reverseGalleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileSelect(e, 'reverse')}
        className="hidden"
      />

      {/* Compact Mobile-Optimized Header & 3-Step Progress Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold font-serif-title text-slate-100">
              AI Coin Scanner & Valuator
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Snap or upload coin photos — automatic background removal & valuation in {currency}
            </p>
          </div>
          {(obverseRaw || reverseRaw || identification) && (
            <button
              type="button"
              onClick={handleResetScanner}
              className="min-h-[40px] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 shrink-0 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* 3-Step Visual Stepper */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-0.5">
          {[
            { step: 1, label: '1. Photos' },
            { step: 2, label: '2. AI Scan' },
            { step: 3, label: '3. Valuation' },
          ].map((item) => (
            <div
              key={item.step}
              className={`flex items-center gap-1.5 sm:gap-2 p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-semibold transition-all ${
                currentStep === item.step
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                  : currentStep > item.step
                  ? 'bg-emerald-950/40 border-emerald-700/40 text-emerald-400'
                  : 'bg-slate-950/50 border-slate-800 text-slate-500'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  currentStep === item.step
                    ? 'bg-amber-500 text-slate-950'
                    : currentStep > item.step
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {currentStep > item.step ? '✓' : item.step}
              </span>
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Instant Photo Captured Toast Banner */}
      {captureNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{captureNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setCaptureNotice(null)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-emerald-400 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-700/80 text-rose-200 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5 text-xs sm:text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <div>
              <span className="font-bold block text-rose-300">Scanner Notice</span>
              <p className="mt-0.5">{error}</p>
              {!analyzing && (obverseRaw || obverseTransparent) && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    handleRunAIIdentification();
                  }}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/80 hover:bg-rose-800 border border-rose-500/70 rounded-xl text-xs font-semibold text-rose-100 transition-colors shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Try Valuation Again
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-rose-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 1 & 2: PHOTO CARDS OR AI ANALYZING */}
      {analyzing ? (
        <div className="p-5 sm:p-8 rounded-3xl bg-slate-900/95 border border-amber-500/50 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-transparency-grid border-2 border-amber-400 p-3 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.3)]">
              <div className="absolute inset-0 rounded-full border-3 border-amber-400 border-t-transparent animate-spin" />
              {obverseTransparent && (
                <img
                  src={obverseTransparent}
                  alt="Scanning coin"
                  className="max-h-full max-w-full object-contain filter drop-shadow-lg"
                />
              )}
            </div>
            <div>
              <span className="text-[11px] text-amber-400 font-bold block">
                Step 2 of 3 · AI Vision & Valuation
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100 font-serif-title mt-0.5">
                Analyzing Coin & Market Value...
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Matching mintage, Sheldon grade & collector valuation in {currency}
              </p>
            </div>
          </div>

          {retryNotice && (
            <div className="max-w-lg mx-auto flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/20 border border-amber-400/60 text-amber-200 text-xs sm:text-sm animate-pulse shadow-md">
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="font-medium">{retryNotice}</span>
            </div>
          )}

          <div className="max-w-lg mx-auto space-y-2">
            {analysisSteps.map((stepText, idx) => {
              const isDone = idx < analysisStepIndex;
              const isCurrent = idx === analysisStepIndex;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 text-xs sm:text-sm p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold shadow-md'
                      : isDone
                      ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                      : 'bg-slate-950/50 border-slate-800/70 text-slate-500'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                  )}
                  <span>{stepText}</span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleCancelScan}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition-colors"
            >
              Cancel Scan
            </button>
          </div>
        </div>
      ) : !identification ? (
        <div className="space-y-4 sm:space-y-5">
          {/* Alignment & Centering Guide Tip Banner */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 text-xs shadow-md">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-amber-300">Alignment & Centering Guide: </span>
              <span className="text-slate-300">
                Use <strong>Scan with Camera Guide</strong> to align your coin inside the golden circle, or tap <strong>Auto-Center</strong> on any photo.
              </span>
            </div>
          </div>

          {/* Backdrop Switcher when at least one photo is loaded */}
          {(obverseTransparent || reverseTransparent) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Background Removed (Transparent PNG)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Surface:</span>
                {(['grid', 'dark', 'white'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewBackdrop(mode)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg font-semibold capitalize transition-colors ${
                      previewBackdrop === mode
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-Side / Mobile-Stacked Coin Slot Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* ================= CARD 1: FRONT (OBVERSE) ================= */}
            <div
              className={`rounded-3xl border p-4 sm:p-5 flex flex-col justify-between transition-all ${
                obverseTransparent
                  ? 'bg-slate-900/90 border-emerald-500/50 shadow-xl shadow-emerald-950/20'
                  : 'bg-slate-900/60 border-amber-500/40 shadow-lg'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      obverseTransparent ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {obverseTransparent ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '1'}
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-100">
                      Front of Coin (Obverse)
                    </h2>
                    <span className="text-[11px] text-slate-400">Heads / Main portrait side</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {obverseTransparent ? (
                    <button
                      type="button"
                      onClick={() => setObverseShowGuide(!obverseShowGuide)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold border flex items-center gap-1 transition-colors ${
                        obverseShowGuide
                          ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                      <span>{obverseShowGuide ? 'Hide Guide' : 'Guide'}</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-amber-400">Required</span>
                  )}
                </div>
              </div>

              {processingSide === 'obverse' ? (
                <div className="aspect-square max-h-64 w-full mx-auto rounded-2xl bg-slate-950 border border-amber-500/40 flex flex-col items-center justify-center p-6 text-center space-y-3 relative overflow-hidden">
                  {obverseRaw && (
                    <img
                      src={obverseRaw}
                      alt="Processing Obverse"
                      className="absolute inset-0 w-full h-full object-cover opacity-25 blur-xs"
                    />
                  )}
                  <div className="relative z-10 w-12 h-12 rounded-full border-3 border-amber-400 border-t-transparent animate-spin" />
                  <div className="relative z-10">
                    <p className="text-sm font-bold text-amber-300">Photo Received!</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Detecting coin rim & centering boundary...
                    </p>
                  </div>
                </div>
              ) : obverseTransparent ? (
                <div className="space-y-3">
                  <div
                    className={`relative aspect-square max-h-64 w-full mx-auto rounded-2xl ${getBackdropClass()} border border-slate-700/80 flex items-center justify-center p-4 overflow-hidden shadow-inner`}
                  >
                    <img
                      src={obverseViewMode === 'cutout' ? obverseTransparent : obverseRaw || obverseTransparent}
                      alt="Captured Front Coin"
                      className="max-h-full max-w-full object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] transition-all"
                    />

                    {obverseShowGuide && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-[86%] h-[86%] rounded-full border-2 border-dashed border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.4)] flex items-center justify-center relative">
                          <div className="w-[74%] h-[74%] rounded-full border border-amber-400/40" />
                          <div className="absolute w-full h-[1px] bg-amber-400/40" />
                          <div className="absolute h-full w-[1px] bg-amber-400/40" />
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-950 z-10" />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setObverseViewMode(obverseViewMode === 'cutout' ? 'original' : 'cutout')}
                      className="absolute bottom-2.5 right-2.5 min-h-[34px] flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-950/90 hover:bg-slate-900 text-[11px] font-semibold text-amber-300 border border-slate-700 backdrop-blur-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{obverseViewMode === 'cutout' ? 'Original' : 'Cutout'}</span>
                    </button>
                  </div>

                  {/* Captured Actions Bar with 42px Touch Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAutoCenterSide('obverse')}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold whitespace-nowrap transition-colors"
                    >
                      <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Auto-Center</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjusterSide('obverse')}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Adjust Crop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => obverseGalleryInputRef.current?.click()}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSide('obverse')}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div
                    onClick={() => openLiveCamera('obverse')}
                    className="aspect-[4/3] max-h-52 w-full rounded-2xl bg-slate-950/90 border-2 border-dashed border-amber-500/40 hover:border-amber-400 flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all group"
                  >
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-amber-400/70 bg-amber-500/10 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <Target className="w-6 h-6 text-amber-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-100">Add Front (Obverse) Photo</p>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-xs">
                      Align coin inside the golden circle for automatic centering.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openLiveCamera('obverse')}
                    className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 hover:brightness-110 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-500/25 active:scale-98 transition-all cursor-pointer"
                  >
                    <Target className="w-4 h-4 text-slate-950 shrink-0" />
                    <span>Scan with Camera Guide</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => obverseCameraInputRef.current?.click()}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs active:scale-98 transition-all"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Phone Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => obverseGalleryInputRef.current?.click()}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs active:scale-98 transition-all"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Upload Photo</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ================= CARD 2: BACK (REVERSE) ================= */}
            <div
              className={`rounded-3xl border p-4 sm:p-5 flex flex-col justify-between transition-all ${
                reverseTransparent
                  ? 'bg-slate-900/90 border-emerald-500/50 shadow-xl shadow-emerald-950/20'
                  : 'bg-slate-900/60 border-slate-800 shadow-lg'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      reverseTransparent
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {reverseTransparent ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '2'}
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-100">
                      Back of Coin (Reverse)
                    </h2>
                    <span className="text-[11px] text-slate-400">Tails / Mint mark side</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {reverseTransparent ? (
                    <button
                      type="button"
                      onClick={() => setReverseShowGuide(!reverseShowGuide)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold border flex items-center gap-1 transition-colors ${
                        reverseShowGuide
                          ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                      <span>{reverseShowGuide ? 'Hide Guide' : 'Guide'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Optional</span>
                  )}
                </div>
              </div>

              {processingSide === 'reverse' ? (
                <div className="aspect-square max-h-64 w-full mx-auto rounded-2xl bg-slate-950 border border-amber-500/40 flex flex-col items-center justify-center p-6 text-center space-y-3 relative overflow-hidden">
                  {reverseRaw && (
                    <img
                      src={reverseRaw}
                      alt="Processing Reverse"
                      className="absolute inset-0 w-full h-full object-cover opacity-25 blur-xs"
                    />
                  )}
                  <div className="relative z-10 w-12 h-12 rounded-full border-3 border-amber-400 border-t-transparent animate-spin" />
                  <div className="relative z-10">
                    <p className="text-sm font-bold text-amber-300">Photo Received!</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Detecting coin rim & centering boundary...
                    </p>
                  </div>
                </div>
              ) : reverseTransparent ? (
                <div className="space-y-3">
                  <div
                    className={`relative aspect-square max-h-64 w-full mx-auto rounded-2xl ${getBackdropClass()} border border-slate-700/80 flex items-center justify-center p-4 overflow-hidden shadow-inner`}
                  >
                    <img
                      src={reverseViewMode === 'cutout' ? reverseTransparent : reverseRaw || reverseTransparent}
                      alt="Captured Back Coin"
                      className="max-h-full max-w-full object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] transition-all"
                    />

                    {reverseShowGuide && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-[86%] h-[86%] rounded-full border-2 border-dashed border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.4)] flex items-center justify-center relative">
                          <div className="w-[74%] h-[74%] rounded-full border border-amber-400/40" />
                          <div className="absolute w-full h-[1px] bg-amber-400/40" />
                          <div className="absolute h-full w-[1px] bg-amber-400/40" />
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-950 z-10" />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setReverseViewMode(reverseViewMode === 'cutout' ? 'original' : 'cutout')}
                      className="absolute bottom-2.5 right-2.5 min-h-[34px] flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-950/90 hover:bg-slate-900 text-[11px] font-semibold text-amber-300 border border-slate-700 backdrop-blur-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{reverseViewMode === 'cutout' ? 'Original' : 'Cutout'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAutoCenterSide('reverse')}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold whitespace-nowrap transition-colors"
                    >
                      <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Auto-Center</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjusterSide('reverse')}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Adjust Crop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => reverseGalleryInputRef.current?.click()}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSide('reverse')}
                      className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div
                    onClick={() => openLiveCamera('reverse')}
                    className="aspect-[4/3] max-h-52 w-full rounded-2xl bg-slate-950/60 border-2 border-dashed border-slate-800 hover:border-amber-500/40 flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all group"
                  >
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-slate-700 bg-slate-900 flex items-center justify-center mb-2 group-hover:border-amber-400/50 transition-colors">
                      <Target className="w-6 h-6 text-slate-400 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <p className="text-sm font-bold text-slate-200">Add Back (Reverse) Photo</p>
                    <p className="text-xs text-slate-500 mt-0.5 max-w-xs">
                      Capture mint mark & reverse emblem for higher accuracy.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openLiveCamera('reverse')}
                    className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold text-xs sm:text-sm active:scale-98 transition-all cursor-pointer"
                  >
                    <Target className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Scan with Camera Guide</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => reverseCameraInputRef.current?.click()}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs active:scale-98 transition-all"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Phone Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => reverseGalleryInputRef.current?.click()}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs active:scale-98 transition-all"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Upload Photo</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Primary CTA Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleRunAIIdentification}
              disabled={!obverseTransparent || analyzing || !!processingSide}
              className={`w-full min-h-[52px] flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base shadow-xl transition-all ${
                obverseTransparent && !analyzing && !processingSide
                  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-slate-950 hover:brightness-110 shadow-amber-500/30 cursor-pointer'
                  : 'bg-slate-800/80 text-slate-500 border border-slate-800 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>
                {obverseTransparent
                  ? `Identify Coin & Estimate Value (${currency})`
                  : 'Step 1: Add Front Coin Photo Above'}
              </span>
              {obverseTransparent && <ArrowRight className="w-5 h-5 shrink-0" />}
            </button>
          </div>

          {/* Sticky Mobile Floating Bar when Front Photo is Ready */}
          {obverseTransparent && (
            <div className="md:hidden fixed bottom-16 left-3 right-3 z-30 bg-slate-900/95 backdrop-blur-lg border border-amber-500/50 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-transparency-grid border border-emerald-500/50 p-1 flex items-center justify-center shrink-0">
                  <img src={obverseTransparent} alt="Front ready" className="max-h-full max-w-full object-contain" />
                </div>
                {reverseTransparent && (
                  <div className="w-10 h-10 rounded-xl bg-transparency-grid border border-emerald-500/50 p-1 flex items-center justify-center shrink-0">
                    <img src={reverseTransparent} alt="Back ready" className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs font-bold text-emerald-400 block truncate">
                    {reverseTransparent ? 'Front & Back Ready' : 'Front Photo Ready'}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    Tap to run AI valuation
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunAIIdentification}
                className="min-h-[42px] flex items-center gap-1.5 py-2 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-300 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/30 shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>Identify Now</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ================= STEP 3: IDENTIFICATION & VALUATION RESULTS ================= */
        <div className="space-y-5 sm:space-y-6">
          {duplicateWarning && (
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/60 text-amber-200 flex items-start gap-3 shadow-lg">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
              <div className="text-xs sm:text-sm">
                <span className="font-bold block text-amber-300">Similar Coin in Collection:</span>
                You already have a <strong className="text-white">{duplicateWarning.title}</strong> (
                {duplicateWarning.year} {duplicateWarning.mintMark || ''}) in your gallery. You can still save this specimen below.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
            {/* Left: Isolated Transparent Coin Showcase */}
            <div className="lg:col-span-5 bg-slate-950 p-4 sm:p-5 rounded-3xl border border-slate-800 flex flex-col items-center justify-between shadow-2xl space-y-4">
              <div className="w-full flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400">Isolated Specimen</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Transparent PNG
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-full aspect-square rounded-2xl ${getBackdropClass()} border border-slate-800 p-3 flex items-center justify-center`}
                  >
                    <img
                      src={obverseTransparent || ''}
                      alt={identification.title}
                      className="max-h-full max-w-full object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.8)]"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] font-semibold text-slate-400">Front</span>
                    <button
                      type="button"
                      onClick={() => setAdjusterSide('obverse')}
                      className="text-[11px] text-amber-400 hover:underline font-semibold"
                    >
                      Adjust
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  {reverseTransparent ? (
                    <>
                      <div
                        className={`w-full aspect-square rounded-2xl ${getBackdropClass()} border border-slate-800 p-3 flex items-center justify-center`}
                      >
                        <img
                          src={reverseTransparent}
                          alt="Reverse"
                          className="max-h-full max-w-full object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.8)]"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] font-semibold text-slate-400">Back</span>
                        <button
                          type="button"
                          onClick={() => setAdjusterSide('reverse')}
                          className="text-[11px] text-amber-400 hover:underline font-semibold"
                        >
                          Adjust
                        </button>
                      </div>
                    </>
                  ) : (
                    <div
                      onClick={() => reverseGalleryInputRef.current?.click()}
                      className="w-full aspect-square rounded-2xl bg-slate-900/50 border border-dashed border-slate-800 hover:border-amber-500/40 p-3 flex flex-col items-center justify-center text-center cursor-pointer"
                    >
                      <Camera className="w-6 h-6 text-slate-500 mb-1" />
                      <span className="text-[11px] text-slate-400 font-semibold">Add Back Photo</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-1">
                <span className="text-[11px] text-amber-400 font-bold block">
                  Condition & Surface Notes
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">{identification.conditionDetails}</p>
              </div>
            </div>

            {/* Right: Valuation & Editable Identification Form */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">
              {/* Valuation Card with Separate Confidence Badges, Traceable Evidence & Verified Melt */}
              {(() => {
                const idConf = identification.identificationConfidence ?? identification.confidenceScore ?? 75;
                const gradeConf = identification.gradingConfidence ?? identification.confidenceScore ?? 65;
                const valConf = identification.valuationConfidence ?? identification.confidenceScore ?? 60;
                const gradeRangeText =
                  editedRecord.estimatedGrade ||
                  identification.estimatedGradeRange ||
                  identification.estimatedGrade ||
                  'VF-20 to EF-40';
                const activeAlt =
                  activeSwapIndex !== null && identification.alternativeMatches?.[activeSwapIndex]
                    ? identification.alternativeMatches[activeSwapIndex]
                    : null;
                const baseRawEst = activeAlt?.estimatedValue ?? identification.estimatedValue;
                const baseRawLow = activeAlt
                  ? Math.round(baseRawEst * 0.75 * 100) / 100
                  : identification.lowValue;
                const baseRawHigh = activeAlt
                  ? Math.round(baseRawEst * 1.3 * 100) / 100
                  : identification.highValue;

                const slabEst = activeAlt
                  ? Math.round(Math.max(baseRawEst * 1.35, baseRawEst + 25) * 100) / 100
                  : identification.slabbedEstimatedValue ||
                    Math.round(Math.max(baseRawEst * 1.35, baseRawEst + 25) * 100) / 100;
                const slabLow = activeAlt
                  ? Math.round(Math.max(baseRawLow * 1.3, baseRawLow + 18) * 100) / 100
                  : identification.slabbedLowValue ||
                    Math.round(Math.max(baseRawLow * 1.3, baseRawLow + 18) * 100) / 100;
                const slabHigh = activeAlt
                  ? Math.round(Math.max(baseRawHigh * 1.4, baseRawHigh + 35) * 100) / 100
                  : identification.slabbedHighValue ||
                    Math.round(Math.max(baseRawHigh * 1.4, baseRawHigh + 35) * 100) / 100;

                const displayedCenterUsd =
                  editedRecord.estimatedValue !== undefined
                    ? editedRecord.estimatedValue
                    : valuationMode === 'slabbed'
                    ? slabEst
                    : baseRawEst;
                const displayedLowUsd = valuationMode === 'slabbed' ? slabLow : baseRawLow;
                const displayedHighUsd = valuationMode === 'slabbed' ? slabHigh : baseRawHigh;

                const meltCheck = evaluateCoinMeltValue(
                  {
                    ...identification,
                    metalCategory: editedRecord.metalCategory ?? identification.metalCategory,
                    metalComposition:
                      editedRecord.metalComposition !== undefined
                        ? editedRecord.metalComposition
                        : identification.metalComposition,
                    fineness: editedRecord.fineness !== undefined ? editedRecord.fineness : identification.fineness,
                    weightGrams:
                      editedRecord.weightGrams !== undefined ? editedRecord.weightGrams : identification.weightGrams,
                  },
                  currency
                );
                const evidenceCount =
                  identification.evidenceCount ?? (identification.recentAuctionComps?.length || 0);

                return (
                  <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/40 shadow-xl space-y-3.5">
                    {/* Top Row: Currency Label & 3 Separate Confidence Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-amber-400 font-semibold block">
                          Provisional AI Valuation ({currency})
                        </span>
                        <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 font-bold text-[10px] rounded">
                          {currency}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-num font-bold">
                        <span
                          className={`px-2 py-0.5 rounded-lg border ${
                            idConf >= 80
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          ID: {idConf}%
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg border ${
                            gradeConf >= 80
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          Grade: {gradeConf}%
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg border ${
                            valConf >= 80
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          Valuation: {valConf}%
                        </span>
                      </div>
                    </div>

                    {/* Raw vs. Slabbed (PCGS/NGC) Value Toggle + Grade Range */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                      <div className="inline-flex p-1 rounded-xl bg-slate-950/90 border border-slate-800 self-start">
                        <button
                          type="button"
                          onClick={() => handleToggleValuationMode('raw')}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            valuationMode === 'raw'
                              ? 'bg-amber-500 text-slate-950 shadow-md'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Raw Coin Value
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleValuationMode('slabbed')}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            valuationMode === 'slabbed'
                              ? 'bg-amber-500 text-slate-950 shadow-md'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Slabbed (PCGS / NGC)
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400">Provisional Grade Range:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-300 font-bold font-mono-num">
                          {gradeRangeText}
                        </span>
                      </div>
                    </div>

                    {/* Main Converted Value & Low-High Range */}
                    <div className="flex flex-wrap items-baseline justify-between gap-2 pt-0.5">
                      <div className="flex flex-wrap items-baseline gap-2.5">
                        <span className="text-2xl sm:text-4xl font-extrabold text-amber-400 font-mono-num">
                          {formatCoinValue(displayedCenterUsd, currency, USD_FX_RATES, true)}
                        </span>
                        <span className="text-xs text-slate-400 font-mono-num">
                          Range: {formatCoinValue(displayedLowUsd, currency, USD_FX_RATES, true)} –{' '}
                          {formatCoinValue(displayedHighUsd, currency, USD_FX_RATES, true)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Date: {(identification.valuationDate || new Date().toISOString()).split('T')[0]} · Evidence refs:{' '}
                        <strong className="text-slate-200">{evidenceCount}</strong>
                      </span>
                    </div>

                    {/* Rationale for range */}
                    {identification.valuationRationale && (
                      <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800 text-[11px] text-slate-300">
                        <strong className="text-slate-200">Estimate Basis: </strong>
                        {identification.valuationRationale}
                      </div>
                    )}

                    {/* Verified Melt Floor or Honest Unavailable Notice */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                      {meltCheck.available && meltCheck.breakdown ? (
                        <>
                          <div>
                            <span className="text-amber-300 font-bold block">
                              Verified Bullion Melt Floor: {formatCoinValue(meltCheck.breakdown.meltValueUSD, currency, USD_FX_RATES, true)}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {meltCheck.breakdown.pureGrams}g pure {meltCheck.breakdown.metalType} ({meltCheck.breakdown.pureTroyOunces} ozt) · Snapshot: {meltCheck.breakdown.spotSource} ({meltCheck.breakdown.spotTimestamp.split('T')[0]})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {meltCheck.breakdown.fxConversion?.direction || 'USD'}
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {meltCheck.unavailableReason || 'Melt value unavailable'}
                        </span>
                      )}
                    </div>

                    {/* Comparable Evidence Notice */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
                      {identification.recentAuctionComps && identification.recentAuctionComps.length > 0 ? (
                        <div className="space-y-1">
                          <strong className="text-slate-200 block">Comparable Evidence Recorded ({identification.recentAuctionComps.length}):</strong>
                          {identification.recentAuctionComps.map((comp, idx) => (
                            <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                              <span>
                                {comp.auctionHouse} {comp.lotNumber ? `(${comp.lotNumber})` : ''} · {comp.grade} · {comp.date}
                              </span>
                              <span className="font-mono font-bold text-amber-300">
                                {formatCoinValue(
                                  toUsdAmount(comp.originalPrice ?? comp.realizedPrice, (comp.originalCurrency || comp.currency || 'USD') as CurrencyCode),
                                  currency,
                                  USD_FX_RATES,
                                  true
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>No verified comparable sales available. Price range is an AI catalogue estimate—add documented auction lots in Coin Details.</span>
                      )}
                    </div>

                    {/* Mint Mark Diagnostic Guidance */}
                    {identification.mintMarkDiagnostic && (
                      <div className="p-3 rounded-xl bg-slate-950/85 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                        <Target className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                        <div>
                          <span className="font-bold text-amber-300 block">
                            Mint Mark Diagnostic ({editedRecord.mintMark ?? identification.mintMark ?? 'None'}):
                          </span>
                          <span className="text-slate-300 leading-relaxed">
                            {identification.mintMarkDiagnostic}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Reverse Photo Guidance if missing */}
                    {!reverseTransparent && (
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                        <span>
                          <strong>Preliminary assessment from Front photo:</strong> For definitive variety identification, mint mark verification, and complete Sheldon grading, add a Back (Reverse) photo.
                        </span>
                      </div>
                    )}

                    {/* Provisional Grading Disclaimer */}
                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                      Photo grading is provisional and does not establish authenticity or professional PCGS/NGC/ANACS certification.
                    </div>
                  </div>
                );
              })()}

              {/* Alternative Matches (Up to 2 Close Varieties with 1-Click Swap) */}
              {identification.alternativeMatches && identification.alternativeMatches.length > 0 && (
                <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Close Alternative Varieties (1-Click Swap)</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        If your specimen matches one of these close die or mint mark varieties, swap to it in one click before saving.
                      </p>
                    </div>
                    {activeSwapIndex !== null && (
                      <button
                        type="button"
                        onClick={handleRestorePrimaryMatch}
                        className="min-h-[32px] px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-[11px] font-semibold cursor-pointer transition-colors"
                      >
                        Restore Primary Match
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {identification.alternativeMatches.slice(0, 2).map((alt, idx) => {
                      const isSwapped = activeSwapIndex === idx;
                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border text-xs flex flex-col justify-between gap-2.5 transition-all ${
                            isSwapped
                              ? 'bg-amber-500/15 border-amber-400 shadow-lg'
                              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-slate-100">
                                {alt.year} {alt.country} ({alt.mintMark || 'No Mint Mark'})
                              </span>
                              {alt.estimatedValue !== undefined && alt.estimatedValue > 0 && (
                                <span className="font-mono-num font-bold text-amber-400 shrink-0">
                                  {formatCoinValue(alt.estimatedValue, currency, USD_FX_RATES, true)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              <strong className="text-slate-400">Distinguishing feature:</strong>{' '}
                              {alt.distinguishingFeature}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSwapAlternativeMatch(alt, idx)}
                            className={`w-full min-h-[36px] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              isSwapped
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-slate-700'
                            }`}
                          >
                            {isSwapped ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Active Selected Variety</span>
                              </>
                            ) : (
                              <>
                                <ArrowRight className="w-3.5 h-3.5" />
                                <span>Swap to This Variety</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Editable Details Form */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="text-xs sm:text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 flex items-center justify-between">
                  <span>Numismatic Details</span>
                  <span className="text-[11px] font-normal text-amber-400">Tap any field to edit</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-slate-400 font-medium">Coin Title</label>
                    <input
                      type="text"
                      value={editedRecord.title !== undefined ? editedRecord.title : identification.title}
                      onChange={(e) => setEditedRecord({ ...editedRecord, title: e.target.value })}
                      className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Country</label>
                    <input
                      type="text"
                      value={editedRecord.country !== undefined ? editedRecord.country : identification.country}
                      onChange={(e) => setEditedRecord({ ...editedRecord, country: e.target.value })}
                      className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Year & Mint Mark</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editedRecord.year !== undefined ? editedRecord.year : identification.year}
                        onChange={(e) => setEditedRecord({ ...editedRecord, year: parseInt(e.target.value) || 0 })}
                        className="w-2/3 min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        placeholder="Mint"
                        value={editedRecord.mintMark !== undefined ? editedRecord.mintMark : identification.mintMark}
                        onChange={(e) => setEditedRecord({ ...editedRecord, mintMark: e.target.value })}
                        className="w-1/3 min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Estimated Sheldon Grade Range</label>
                    <input
                      type="text"
                      value={
                        editedRecord.estimatedGrade !== undefined
                          ? editedRecord.estimatedGrade
                          : identification.estimatedGradeRange || identification.estimatedGrade
                      }
                      onChange={(e) => setEditedRecord({ ...editedRecord, estimatedGrade: e.target.value })}
                      className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Metal Category</label>
                    <select
                      value={editedRecord.metalCategory || identification.metalCategory || 'other'}
                      onChange={(e) =>
                        setEditedRecord({ ...editedRecord, metalCategory: e.target.value as MetalCategory })
                      }
                      className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      <option value="gold">Gold</option>
                      <option value="silver">Silver</option>
                      <option value="platinum">Platinum</option>
                      <option value="palladium">Palladium</option>
                      <option value="copper">Copper / Bronze</option>
                      <option value="clad">Cupro-Nickel / Clad</option>
                      <option value="other">Other / Mixed</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Metal Composition</label>
                    <input
                      type="text"
                      value={
                        editedRecord.metalComposition !== undefined
                          ? editedRecord.metalComposition
                          : identification.metalComposition
                      }
                      onChange={(e) => setEditedRecord({ ...editedRecord, metalComposition: e.target.value })}
                      className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-slate-400 font-medium">Fineness (0–1)</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="1"
                        placeholder="e.g. 0.9167"
                        value={editedRecord.fineness ?? ''}
                        onChange={(e) =>
                          setEditedRecord({
                            ...editedRecord,
                            fineness: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                        className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 font-medium">Weight (g)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 7.99"
                        value={editedRecord.weightGrams ?? ''}
                        onChange={(e) =>
                          setEditedRecord({
                            ...editedRecord,
                            weightGrams: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                        className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Purchase Price & Source Currency</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Optional"
                        value={editedRecord.purchasePrice || ''}
                        onChange={(e) =>
                          setEditedRecord({ ...editedRecord, purchasePrice: parseFloat(e.target.value) || undefined })
                        }
                        className="flex-1 min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono-num focus:outline-none focus:border-amber-500"
                      />
                      <select
                        value={editedRecord.purchaseCurrency || currency}
                        onChange={(e) =>
                          setEditedRecord({ ...editedRecord, purchaseCurrency: e.target.value as CurrencyCode })
                        }
                        aria-label="Purchase currency"
                        className="w-24 min-h-[44px] px-2 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-bold"
                      >
                        {VALID_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Category</label>
                    <input
                      type="text"
                      list="category-options"
                      value={editedRecord.category || ''}
                      onChange={(e) => setEditedRecord({ ...editedRecord, category: e.target.value })}
                      className="w-full min-h-[44px] px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <datalist id="category-options">
                      {categories.map((c) => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-slate-400 font-medium">Personal Notes / Provenance</label>
                    <textarea
                      rows={2}
                      placeholder="Optional notes, storage album, or dealer info..."
                      value={editedRecord.personalNotes || ''}
                      onChange={(e) => setEditedRecord({ ...editedRecord, personalNotes: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Live Metal Consistency Check Banner */}
                {(() => {
                  const check = validateCoinMetalConsistency({
                    ...identification,
                    metalCategory: editedRecord.metalCategory ?? identification.metalCategory,
                    metalComposition:
                      editedRecord.metalComposition !== undefined
                        ? editedRecord.metalComposition
                        : identification.metalComposition,
                    fineness: editedRecord.fineness !== undefined ? editedRecord.fineness : identification.fineness,
                    weightGrams:
                      editedRecord.weightGrams !== undefined ? editedRecord.weightGrams : identification.weightGrams,
                  });
                  if (check.valid && check.warnings.length === 0) return null;
                  return (
                    <div
                      className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                        !check.valid
                          ? 'bg-rose-950/60 border-rose-700 text-rose-200'
                          : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{!check.valid ? 'Metal Data Contradiction (Fix Before Saving)' : 'Metal Verification Note'}</span>
                        </span>
                        {check.suggestedCategory && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditedRecord((prev) => ({
                                ...prev,
                                metalCategory: check.suggestedCategory,
                                ...(check.suggestedFineness !== undefined ? { fineness: check.suggestedFineness } : {}),
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                          >
                            Align to {check.suggestedCategory.toUpperCase()}
                            {check.suggestedFineness ? ` (${check.suggestedFineness})` : ''}
                          </button>
                        )}
                      </div>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5">
                        {check.errors.map((e, i) => (
                          <li key={`err-${i}`}>{e}</li>
                        ))}
                        {check.warnings.map((w, i) => (
                          <li key={`warn-${i}`}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>

              {/* Save / Reset Action Buttons */}
              {(() => {
                const saveMetalCheck = validateCoinMetalConsistency({
                  ...identification,
                  metalCategory: editedRecord.metalCategory ?? identification.metalCategory,
                  metalComposition:
                    editedRecord.metalComposition !== undefined
                      ? editedRecord.metalComposition
                      : identification.metalComposition,
                  fineness: editedRecord.fineness !== undefined ? editedRecord.fineness : identification.fineness,
                  weightGrams:
                    editedRecord.weightGrams !== undefined ? editedRecord.weightGrams : identification.weightGrams,
                });
                return (
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleResetScanner}
                      className="min-h-[48px] w-full sm:w-1/3 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-sm transition-colors text-center"
                    >
                      Scan Another Coin
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToCollection}
                      disabled={savingCoin || !saveMetalCheck.valid}
                      className="min-h-[48px] w-full sm:w-2/3 py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 hover:brightness-110 text-slate-950 font-bold text-sm shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-5 h-5 text-slate-950 shrink-0" />
                      <span>{savingCoin ? 'Saving to Vault...' : 'Save Coin to My Collection'}</span>
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Mobile-Optimized Live Camera Viewfinder (`100dvh`) */}
      {liveCameraSide && (
        <div className="fixed inset-0 z-50 h-[100dvh] bg-black/95 flex flex-col justify-between p-3 sm:p-5 pt-safe pb-safe">
          {/* Top Bar */}
          <div className="flex items-center justify-between text-white pb-2 max-w-lg mx-auto w-full shrink-0">
            <div>
              <div className="flex items-center gap-1.5 text-amber-400">
                <Target className="w-4 h-4" />
                <span className="text-[11px] font-bold">Live Guided Camera Scanner</span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100">
                Center {liveCameraSide === 'obverse' ? 'Front (Obverse)' : 'Back (Reverse)'} of Coin
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {hasTorchCapability && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border transition-colors ${
                    torchOn
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                  title="Toggle Flash / Torch"
                >
                  <Zap className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={switchCameraFacing}
                className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white transition-colors"
                title="Switch Front / Back Camera"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={closeLiveCamera}
                className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centering Prompt Banner */}
          <div className="max-w-lg mx-auto w-full px-3 py-1.5 rounded-xl bg-slate-900/90 border border-amber-500/40 text-center mb-2 shrink-0">
            <p className="text-[11px] sm:text-xs text-amber-300 font-semibold flex items-center justify-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>Position coin inside the golden circle — auto-centered on capture</span>
            </p>
          </div>

          {/* Main Viewfinder Frame */}
          <div className="relative flex-1 min-h-0 w-full max-w-lg mx-auto rounded-3xl overflow-hidden border-2 border-slate-800 bg-slate-950 flex items-center justify-center shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {shutterFlash && <div className="absolute inset-0 bg-white z-30 animate-ping" />}

            {/* Responsive Coin Centering Reticle Guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div
                className={`relative rounded-full border-2 border-dashed border-amber-400 shadow-[0_0_60px_rgba(212,175,55,0.45)] flex items-center justify-center transition-all duration-300 max-w-[78vw] max-h-[78vw] ${
                  reticleSize === 'small'
                    ? 'w-48 h-48 sm:w-56 sm:h-56'
                    : reticleSize === 'large'
                    ? 'w-68 h-68 sm:w-80 sm:h-80'
                    : 'w-58 h-58 sm:w-68 sm:h-68'
                }`}
              >
                <div className="w-[78%] h-[78%] rounded-full border border-amber-400/40" />
                <div className="absolute w-full h-[1px] bg-amber-400/40" />
                <div className="absolute h-full w-[1px] bg-amber-400/40" />
                <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md z-10" />
              </div>
            </div>

            {/* Sizing Preset Selector */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-700/80 text-xs">
              {(['small', 'standard', 'large'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setReticleSize(sz)}
                  className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize whitespace-nowrap transition-colors ${
                    reticleSize === sz
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Bar: Thumb-Zone Shutter & Secondary Switch */}
          <div className="pt-3 pb-1 flex flex-col items-center gap-2 max-w-lg mx-auto w-full shrink-0">
            <div className="flex items-center justify-between w-full px-6">
              <button
                type="button"
                onClick={() => {
                  closeLiveCamera();
                  if (liveCameraSide === 'obverse') {
                    obverseGalleryInputRef.current?.click();
                  } else {
                    reverseGalleryInputRef.current?.click();
                  }
                }}
                className="min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 text-[11px] text-slate-300 hover:text-amber-300"
              >
                <ImageIcon className="w-5 h-5" />
                <span>Gallery</span>
              </button>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={captureFromLiveCamera}
                className="p-1.5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 shadow-2xl shadow-amber-500/50 active:scale-95 transition-transform"
                title="Capture Centered Coin Photo"
              >
                <div className="w-16 h-16 rounded-full bg-slate-950 border-2 border-white flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-amber-400 shadow-inner" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeLiveCamera();
                  if (liveCameraSide === 'obverse') {
                    obverseCameraInputRef.current?.click();
                  } else {
                    reverseCameraInputRef.current?.click();
                  }
                }}
                className="min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 text-[11px] text-slate-300 hover:text-amber-300"
              >
                <Camera className="w-5 h-5" />
                <span>Phone App</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Boundary Adjuster Modal */}
      {adjusterSide && (
        <CropAdjusterModal
          isOpen={!!adjusterSide}
          imageSrc={adjusterSide === 'obverse' ? obverseRaw! : reverseRaw!}
          initialBoundary={
            adjusterSide === 'obverse'
              ? obverseBoundary || { cx: 0.5, cy: 0.5, radius: 0.38, aspectRatio: 1.0, rotation: 0, feather: 2 }
              : reverseBoundary || { cx: 0.5, cy: 0.5, radius: 0.38, aspectRatio: 1.0, rotation: 0, feather: 2 }
          }
          title={`Adjust ${adjusterSide === 'obverse' ? 'Front (Obverse)' : 'Back (Reverse)'} Cutout`}
          onClose={() => setAdjusterSide(null)}
          onApply={(newTransparentPNG, newBoundary) => {
            if (adjusterSide === 'obverse') {
              setObverseTransparent(newTransparentPNG);
              setObverseBoundary(newBoundary);
            } else {
              setReverseTransparent(newTransparentPNG);
              setReverseBoundary(newBoundary);
            }
          }}
        />
      )}
    </div>
  );
};
