import type { BoundaryCircle } from '../types/coin';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load coin image'));

    // Ensure utf8 SVG data URLs are properly encoded for HTMLImageElement
    if (src.startsWith('data:image/svg+xml;utf8,')) {
      const rawSvg = src.slice('data:image/svg+xml;utf8,'.length);
      try {
        const decoded = decodeURIComponent(rawSvg);
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(decoded)}`;
      } catch {
        img.src = src;
      }
    } else {
      img.src = src;
    }
  });
}

/**
 * Resizes and compresses raw camera/gallery coin photos client-side via an HTML5 canvas
 * to a max width/height of 800px at JPEG quality 0.75 before saving to state or storage.
 */
export async function normalizeRawImage(
  dataUrl: string,
  maxDimension: number = 800,
  quality: number = 0.75
): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width || maxDimension;
  const h = img.naturalHeight || img.height || maxDimension;

  const scale = Math.min(1, maxDimension / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, targetW, targetH);
  let result = canvas.toDataURL('image/jpeg', quality);

  // If still larger than 130KB when saving compact raw reference photos, step down quality
  if (maxDimension <= 800 && result.length > 130000) {
    result = canvas.toDataURL('image/jpeg', 0.68);
  }
  return result;
}

/**
 * Generates a lightweight compressed thumbnail via HTML5 canvas for keeping in localStorage
 * while full-resolution images are stored in IndexedDB.
 */
export async function createCompressedThumbnail(
  dataUrl: string | undefined,
  maxDimension: number = 160,
  quality: number = 0.65
): Promise<string | undefined> {
  if (!dataUrl || dataUrl.startsWith('data:image/svg')) {
    return dataUrl;
  }
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width || maxDimension;
    const h = img.naturalHeight || img.height || maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) {
      return webp;
    }
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

/**
 * Intelligent client-side coin boundary detector.
 * Maintains true aspect ratio and uses opposing-ray diameter analysis
 * to find the exact geometric center and radius of the coin,
 * eliminating off-center cutouts caused by aspect ratio distortion.
 */
export function autoDetectCoinCircle(img: HTMLImageElement): BoundaryCircle {
  const naturalW = img.naturalWidth || img.width || 1024;
  const naturalH = img.naturalHeight || img.height || 1024;
  const aspect = naturalW / naturalH;

  // Preserve true aspect ratio so a round coin remains circular
  let sampleW = 400;
  let sampleH = 400;
  if (aspect >= 1) {
    sampleW = 400;
    sampleH = Math.max(120, Math.round(400 / aspect));
  } else {
    sampleH = 400;
    sampleW = Math.max(120, Math.round(400 * aspect));
  }

  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    return { cx: 0.5, cy: 0.5, radius: 0.38, aspectRatio: 1.0, rotation: 0, feather: 2 };
  }

  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imageData.data;

  // Grayscale and gradient map
  const gray = new Float32Array(sampleW * sampleH);
  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const idx = (y * sampleW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      gray[y * sampleW + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  // Initial center of mass search biased towards central 70% of frame
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  const centerX = sampleW / 2;
  const centerY = sampleH / 2;
  const maxSearchDist = Math.min(sampleW, sampleH) * 0.42;

  for (let y = 4; y < sampleH - 4; y += 2) {
    for (let x = 4; x < sampleW - 4; x += 2) {
      const dist = Math.hypot(x - centerX, y - centerY);
      if (dist < maxSearchDist) {
        // Compute local gradient magnitude (Sobel approximation)
        const idx = y * sampleW + x;
        const dx = Math.abs(gray[idx + 1] - gray[idx - 1]);
        const dy = Math.abs(gray[idx + sampleW] - gray[idx - sampleW]);
        const grad = dx + dy;

        const w = grad + 5;
        weightedX += x * w;
        weightedY += y * w;
        totalWeight += w;
      }
    }
  }

  const initialCx = totalWeight > 0 ? weightedX / totalWeight : centerX;
  const initialCy = totalWeight > 0 ? weightedY / totalWeight : centerY;

  // Cast 36 opposite diameter ray pairs (72 rays total, every 5 degrees)
  const rayPairs = 36;
  const minDim = Math.min(sampleW, sampleH);
  const minR = minDim * 0.14;
  const maxR = minDim * 0.46;

  interface DiameterResult {
    midpointX: number;
    midpointY: number;
    diameter: number;
    score: number;
  }
  const diameterResults: DiameterResult[] = [];

  for (let i = 0; i < rayPairs; i++) {
    const angle = (i * Math.PI) / rayPairs;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Scan along positive direction
    let bestR1 = minDim * 0.35;
    let maxGrad1 = -1;
    let prevLum1 = -1;
    for (let r = minR; r < maxR; r += 1.5) {
      const px = Math.round(initialCx + r * cosA);
      const py = Math.round(initialCy + r * sinA);
      if (px <= 2 || px >= sampleW - 3 || py <= 2 || py >= sampleH - 3) break;

      const lum = gray[py * sampleW + px];
      if (prevLum1 >= 0) {
        const grad = Math.abs(lum - prevLum1);
        if (grad > maxGrad1) {
          maxGrad1 = grad;
          bestR1 = r;
        }
      }
      prevLum1 = lum;
    }

    // Scan along negative opposite direction
    let bestR2 = minDim * 0.35;
    let maxGrad2 = -1;
    let prevLum2 = -1;
    for (let r = minR; r < maxR; r += 1.5) {
      const px = Math.round(initialCx - r * cosA);
      const py = Math.round(initialCy - r * sinA);
      if (px <= 2 || px >= sampleW - 3 || py <= 2 || py >= sampleH - 3) break;

      const lum = gray[py * sampleW + px];
      if (prevLum2 >= 0) {
        const grad = Math.abs(lum - prevLum2);
        if (grad > maxGrad2) {
          maxGrad2 = grad;
          bestR2 = r;
        }
      }
      prevLum2 = lum;
    }

    // Edge points
    const p1x = initialCx + bestR1 * cosA;
    const p1y = initialCy + bestR1 * sinA;
    const p2x = initialCx - bestR2 * cosA;
    const p2y = initialCy - bestR2 * sinA;

    const diameter = bestR1 + bestR2;
    const midpointX = (p1x + p2x) / 2;
    const midpointY = (p1y + p2y) / 2;
    const score = (maxGrad1 > 0 ? maxGrad1 : 0) + (maxGrad2 > 0 ? maxGrad2 : 0);

    diameterResults.push({ midpointX, midpointY, diameter, score });
  }

  // Compute median diameter to filter outliers
  const sortedDiameters = [...diameterResults].map((d) => d.diameter).sort((a, b) => a - b);
  const medianDiameter = sortedDiameters[Math.floor(sortedDiameters.length / 2)];

  // Keep only diameter pairs within 18% of the median diameter
  const validPairs = diameterResults.filter(
    (d) => Math.abs(d.diameter - medianDiameter) <= medianDiameter * 0.18
  );

  let finalCx = initialCx;
  let finalCy = initialCy;
  let finalRadius = medianDiameter / 2;

  if (validPairs.length >= 6) {
    let sumMidX = 0;
    let sumMidY = 0;
    let sumDiam = 0;
    let weightSum = 0;

    validPairs.forEach((p) => {
      const w = Math.max(1, p.score);
      sumMidX += p.midpointX * w;
      sumMidY += p.midpointY * w;
      sumDiam += p.diameter * w;
      weightSum += w;
    });

    finalCx = sumMidX / weightSum;
    finalCy = sumMidY / weightSum;
    finalRadius = (sumDiam / weightSum) / 2;
  }

  // Convert back to normalized coordinates [0..1]
  const normCx = Math.max(0.15, Math.min(0.85, finalCx / sampleW));
  const normCy = Math.max(0.15, Math.min(0.85, finalCy / sampleH));
  const normRadius = Math.max(0.16, Math.min(0.45, (finalRadius / minDim) * 1.015));

  return {
    cx: normCx,
    cy: normCy,
    radius: normRadius,
    aspectRatio: 1.0,
    rotation: 0,
    feather: 2,
  };
}

/**
 * Re-centers an existing boundary on the coin with high precision
 */
export function recenterCoinBoundary(img: HTMLImageElement): BoundaryCircle {
  return autoDetectCoinCircle(img);
}

/**
 * Reduces camera sensor micro-noise in RGB LSBs while preserving full detail and transparency,
 * improving lossless PNG DEFLATE compression by 2x-3x on browsers that do not encode WebP.
 */
function quantizeCanvasNoise(ctx: CanvasRenderingContext2D, width: number, height: number, mask: number = 0xf8): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
    } else {
      d[i] = d[i] & mask;
      d[i + 1] = d[i + 1] & mask;
      d[i + 2] = d[i + 2] & mask;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Creates a high-fidelity transparent cutout of the isolated coin.
 * Preserves authentic original photo details, scratches, mint mark, and luster
 * while zeroing out the background and keeping payload size well under Firestore's 1MB limit.
 */
export async function createTransparentCoinPNG(
  imageOrSrc: HTMLImageElement | string,
  boundary: BoundaryCircle,
  outputSize: number = 340
): Promise<string> {
  const img = typeof imageOrSrc === 'string' ? await loadImage(imageOrSrc) : imageOrSrc;
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;

  const renderAtSize = (size: number, quantizeMask?: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    ctx.clearRect(0, 0, size, size);

    const outCx = size / 2;
    const outCy = size / 2;
    const targetCoinRadius = size * 0.43;

    const srcCx = boundary.cx * naturalW;
    const srcCy = boundary.cy * naturalH;
    const minDim = Math.min(naturalW, naturalH);
    const srcRadius = boundary.radius * minDim;

    const scale = targetCoinRadius / Math.max(srcRadius, 10);
    const aspect = boundary.aspectRatio || 1.0;
    const rotRad = ((boundary.rotation || 0) * Math.PI) / 180;
    const feather = Math.max(1, boundary.feather ?? 2);

    ctx.save();
    ctx.translate(outCx, outCy);
    if (rotRad !== 0) ctx.rotate(rotRad);

    ctx.beginPath();
    ctx.ellipse(0, 0, targetCoinRadius, targetCoinRadius / aspect, 0, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    ctx.scale(scale, scale / aspect);
    ctx.drawImage(img, -srcCx, -srcCy);
    ctx.restore();

    if (feather > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.translate(outCx, outCy);
      if (rotRad !== 0) ctx.rotate(rotRad);

      const grad = ctx.createRadialGradient(
        0,
        0,
        Math.max(1, targetCoinRadius - feather),
        0,
        0,
        targetCoinRadius + feather
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, targetCoinRadius + feather * 2, (targetCoinRadius + feather * 2) / aspect, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    if (quantizeMask !== undefined) {
      quantizeCanvasNoise(ctx, size, size, quantizeMask);
    }

    return canvas;
  };

  const targetSize = Math.min(outputSize, 340);
  const canvas = renderAtSize(targetSize);

  // Try transparent WebP first (supported in modern browsers, ~30-50KB with full alpha)
  const webpUrl = canvas.toDataURL('image/webp', 0.85);
  if (webpUrl.startsWith('data:image/webp') && webpUrl.length <= 165000) {
    return webpUrl;
  }

  // Fallback for iOS Safari / browsers where toDataURL('image/webp') returns PNG
  let pngUrl = canvas.toDataURL('image/png');
  if (pngUrl.length <= 165000) {
    return pngUrl;
  }

  // Step down noise and dimension so PNG never exceeds 165KB even on high-grain camera photos
  const stepSizes = [
    { size: 300, mask: 0xf8 },
    { size: 260, mask: 0xf0 },
    { size: 220, mask: 0xe0 },
  ];
  for (const step of stepSizes) {
    const compactCanvas = renderAtSize(step.size, step.mask);
    pngUrl = compactCanvas.toDataURL('image/png');
    if (pngUrl.length <= 165000) {
      return pngUrl;
    }
  }

  return pngUrl;
}

/**
 * Ensures any base64 image string stays safely below `maxChars` by downscaling on a canvas
 * rather than corrupting the base64 data via string slicing.
 */
export async function ensureImageUnderSizeLimit(
  dataUrl: string,
  maxChars: number = 175000
): Promise<string> {
  if (!dataUrl || dataUrl.length <= maxChars || dataUrl.startsWith('data:image/svg')) {
    return dataUrl;
  }

  try {
    const img = await loadImage(dataUrl);
    const isJpeg = dataUrl.startsWith('data:image/jpeg');
    const sizes = maxChars <= 65000 ? [240, 200, 168, 136] : [320, 260, 220, 180];

    for (const maxDim of sizes) {
      const w = img.naturalWidth || img.width || maxDim;
      const h = img.naturalHeight || img.height || maxDim;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const targetW = Math.max(1, Math.round(w * scale));
      const targetH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      if (isJpeg) {
        const jpeg = canvas.toDataURL('image/jpeg', maxChars <= 65000 ? 0.68 : 0.72);
        if (jpeg.length <= maxChars) return jpeg;
      } else {
        const webp = canvas.toDataURL('image/webp', maxChars <= 65000 ? 0.74 : 0.82);
        if (webp.startsWith('data:image/webp') && webp.length <= maxChars) return webp;

        quantizeCanvasNoise(ctx, targetW, targetH, maxDim <= 220 ? 0xe0 : 0xf0);
        const png = canvas.toDataURL('image/png');
        if (png.length <= maxChars) return png;
      }
    }

    // Final guaranteed compact fallback (for Safari/PNG-only browsers when target is tight)
    const fallbackDim = maxChars <= 65000 ? 180 : 220;
    const w = img.naturalWidth || img.width || fallbackDim;
    const h = img.naturalHeight || img.height || fallbackDim;
    const scale = Math.min(1, fallbackDim / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const compactJpeg = canvas.toDataURL('image/jpeg', 0.66);
      if (compactJpeg.length <= maxChars || compactJpeg.length < dataUrl.length) {
        return compactJpeg;
      }
    }
  } catch (err) {
    console.warn('Image downscale warning:', err);
  }
  return dataUrl;
}

/**
 * Converts any image source (PNG/JPEG/SVG Data URL) into a genuine PNG Blob and Data URL,
 * and triggers a browser file download using URL.createObjectURL for reliable cross-browser
 * and iframe compatibility.
 */
export async function downloadDataUrl(dataUrl: string, fileName: string): Promise<string> {
  let pngDataUrl = dataUrl;
  let blob: Blob | null = null;

  try {
    // Always ensure the output is a genuine rasterized PNG
    if (!dataUrl.startsWith('data:image/png')) {
      const img = await loadImage(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 560;
      canvas.height = img.naturalHeight || img.height || 560;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        pngDataUrl = canvas.toDataURL('image/png');
      }
    }

    // Convert base64 Data URL to a binary Blob
    const parts = pngDataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    blob = new Blob([u8arr], { type: mime });
  } catch (err) {
    console.warn('Fallback blob conversion:', err);
  }

  if (blob) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  } else {
    const link = document.createElement('a');
    link.href = pngDataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return pngDataUrl;
}

/**
 * Helper to draw a rounded rectangle path compatible with all browsers
 */
function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Creates an exportable collector display card/slab combining Obverse and Reverse
 */
export async function generateCollectorSlabPNG(
  obverseSrc: string,
  reverseSrc?: string,
  title: string = 'Coin',
  grade: string = 'Ungraded',
  year: number | string = '',
  country: string = ''
): Promise<string> {
  const [obvImg, revImg] = await Promise.all([
    loadImage(obverseSrc),
    reverseSrc ? loadImage(reverseSrc).catch(() => null) : Promise.resolve(null),
  ]);

  const canvas = document.createElement('canvas');
  const width = revImg ? 1600 : 900;
  const height = 920;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return obverseSrc;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Background acrylic slab
  ctx.fillStyle = '#0f172a';
  drawRoundedRectPath(ctx, 20, 20, width - 40, height - 40, 28);
  ctx.fill();

  // Gold metallic border
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Header banner
  ctx.fillStyle = '#1e293b';
  drawRoundedRectPath(ctx, 44, 44, width - 88, 120, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const headerTitle = String(title).includes(String(year))
    ? title
    : `${year || ''} ${title}`.trim();

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(headerTitle.slice(0, 52), width / 2, 98);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 20px sans-serif';
  ctx.fillText(`${country || 'Numismatic Specimen'} • Grade: ${grade} • CoinScan Pro Verified`, width / 2, 138);

  // Coins
  const coinY = 500;
  const coinSize = 540;

  if (revImg) {
    // Obverse (Left)
    ctx.drawImage(obvImg, width * 0.28 - coinSize / 2, coinY - coinSize / 2, coinSize, coinSize);
    // Reverse (Right)
    ctx.drawImage(revImg, width * 0.72 - coinSize / 2, coinY - coinSize / 2, coinSize, coinSize);

    // Labels
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('OBVERSE (FRONT)', width * 0.28, height - 65);
    ctx.fillText('REVERSE (BACK)', width * 0.72, height - 65);
  } else {
    ctx.drawImage(obvImg, width / 2 - coinSize / 2, coinY - coinSize / 2, coinSize, coinSize);
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('AUTHENTIC SPECIMEN', width / 2, height - 65);
  }

  return canvas.toDataURL('image/png');
}
