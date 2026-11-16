import React, { useState, useRef, useEffect } from 'react';
import { X, Check, RotateCcw, ZoomIn, ZoomOut, Eye, ShieldCheck, Move, Target } from 'lucide-react';
import type { BoundaryCircle } from '../types/coin';
import { createTransparentCoinPNG, loadImage, autoDetectCoinCircle } from '../utils/imageProcessor';

interface CropAdjusterModalProps {
  imageSrc: string;
  initialBoundary: BoundaryCircle;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onApply: (processedTransparentPng: string, adjustedBoundary: BoundaryCircle) => void;
}

export const CropAdjusterModal: React.FC<CropAdjusterModalProps> = ({
  imageSrc,
  initialBoundary,
  title = 'Adjust Coin Boundary',
  isOpen,
  onClose,
  onApply,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [boundary, setBoundary] = useState<BoundaryCircle>(initialBoundary);
  const [bgMode, setBgMode] = useState<'checker' | 'white' | 'dark'>('checker');
  const [previewOnly, setPreviewOnly] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [processing, setProcessing] = useState(false);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setBoundary(initialBoundary);
  }, [initialBoundary, isOpen]);

  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    loadImage(imageSrc).then((img) => {
      imageElementRef.current = img;
      renderCanvas();
    });
  }, [isOpen, imageSrc, boundary, bgMode, previewOnly, zoom]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageElementRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;

    if (bgMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    } else if (bgMode === 'dark') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
    } else {
      const square = 16;
      for (let y = 0; y < h; y += square) {
        for (let x = 0; x < w; x += square) {
          ctx.fillStyle = (Math.floor(x / square) + Math.floor(y / square)) % 2 === 0 ? '#1e293b' : '#0f172a';
          ctx.fillRect(x, y, square, square);
        }
      }
    }

    const scale = Math.min(w / naturalW, h / naturalH) * zoom;
    const offsetX = (w - naturalW * scale) / 2;
    const offsetY = (h - naturalH * scale) / 2;

    const coinPixelCx = offsetX + boundary.cx * naturalW * scale;
    const coinPixelCy = offsetY + boundary.cy * naturalH * scale;
    const minDim = Math.min(naturalW, naturalH);
    const coinPixelR = boundary.radius * minDim * scale;
    const aspect = boundary.aspectRatio || 1.0;
    const rotRad = ((boundary.rotation || 0) * Math.PI) / 180;

    if (previewOnly) {
      ctx.save();
      ctx.beginPath();
      ctx.translate(coinPixelCx, coinPixelCy);
      if (rotRad !== 0) ctx.rotate(rotRad);
      ctx.ellipse(0, 0, coinPixelR, coinPixelR / aspect, 0, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(img, -boundary.cx * naturalW * scale, -boundary.cy * naturalH * scale, naturalW * scale, naturalH * scale);
      ctx.restore();
    } else {
      ctx.drawImage(img, offsetX, offsetY, naturalW * scale, naturalH * scale);

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);

      ctx.translate(coinPixelCx, coinPixelCy);
      if (rotRad !== 0) ctx.rotate(rotRad);
      ctx.ellipse(0, 0, coinPixelR, coinPixelR / aspect, 0, 0, 2 * Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(coinPixelCx, coinPixelCy);
      if (rotRad !== 0) ctx.rotate(rotRad);

      ctx.beginPath();
      ctx.ellipse(0, 0, coinPixelR, coinPixelR / aspect, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, 2 * Math.PI);
      ctx.fill();

      const ticks = [
        [coinPixelR, 0],
        [-coinPixelR, 0],
        [0, coinPixelR / aspect],
        [0, -coinPixelR / aspect],
      ];
      ctx.fillStyle = '#ffffff';
      ticks.forEach(([tx, ty]) => {
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      ctx.restore();
    }
  };

  const applyDeltaDrag = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStart || !canvasRef.current || !imageElementRef.current) return;

    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;
    setDragStart({ x: clientX, y: clientY });

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cssToCanvasScaleX = canvas.width / Math.max(1, rect.width);
    const cssToCanvasScaleY = canvas.height / Math.max(1, rect.height);

    const img = imageElementRef.current;
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    const scale = Math.min(canvas.width / naturalW, canvas.height / naturalH) * zoom;

    setBoundary((prev) => ({
      ...prev,
      cx: Math.max(0.05, Math.min(0.95, prev.cx + (dx * cssToCanvasScaleX) / (naturalW * scale))),
      cy: Math.max(0.05, Math.min(0.95, prev.cy + (dy * cssToCanvasScaleY) / (naturalH * scale))),
    }));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (previewOnly) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    applyDeltaDrag(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (previewOnly || e.touches.length === 0) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || e.touches.length === 0) return;
    const touch = e.touches[0];
    applyDeltaDrag(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleAutoCenter = () => {
    if (imageElementRef.current) {
      const detected = autoDetectCoinCircle(imageElementRef.current);
      setBoundary((prev) => ({
        ...prev,
        cx: detected.cx,
        cy: detected.cy,
        radius: detected.radius || prev.radius,
      }));
    } else {
      setBoundary((prev) => ({ ...prev, cx: 0.5, cy: 0.5 }));
    }
  };

  const handleCenterMiddle = () => {
    setBoundary((prev) => ({ ...prev, cx: 0.5, cy: 0.5 }));
  };

  const handleApply = async () => {
    try {
      setProcessing(true);
      const transparentDataUrl = await createTransparentCoinPNG(imageSrc, boundary, 420);
      onApply(transparentDataUrl, boundary);
      onClose();
    } catch (err) {
      console.error('Error applying crop:', err);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[94dvh] sm:h-auto sm:max-h-[92vh]">
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-full pt-2 pb-0.5 bg-slate-950 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-950/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-slate-100 font-serif-title truncate">
                {title}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Drag circle to center coin · Use sliders to match rim
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas & Controls Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 flex-1 overflow-y-auto">
          {/* Main Viewport */}
          <div className="lg:col-span-2 relative flex flex-col items-center justify-center bg-slate-950 p-2.5 sm:p-4 border-b lg:border-b-0 lg:border-r border-slate-800">
            <div className="relative w-full max-w-[300px] sm:max-w-[440px] aspect-square rounded-xl overflow-hidden shadow-inner border border-slate-800">
              <canvas
                ref={canvasRef}
                width={520}
                height={520}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="w-full h-full cursor-move select-none touch-none"
              />

              {!previewOnly && (
                <div className="absolute top-2.5 left-2.5 pointer-events-none flex items-center gap-1.5 bg-slate-950/85 text-amber-300 text-[10px] sm:text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-amber-500/30">
                  <Move className="w-3 h-3" />
                  <span>Touch & drag circle</span>
                </div>
              )}

              {/* Viewport Floating Controls */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 bg-slate-900/90 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-slate-700/60 text-xs">
                <div className="flex items-center gap-1">
                  {(['checker', 'white', 'dark'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBgMode(m)}
                      className={`min-h-[30px] px-2 py-1 rounded text-[11px] font-semibold capitalize ${
                        bgMode === m ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {m === 'checker' ? 'Grid' : m}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewOnly(!previewOnly)}
                  className={`min-h-[30px] flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    previewOnly
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{previewOnly ? 'Edit' : 'Preview'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Control Panel */}
          <div className="p-4 sm:p-5 bg-slate-900/60 flex flex-col justify-between gap-4">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs sm:text-sm font-semibold text-slate-200">Boundary & Centering</span>
                <button
                  type="button"
                  onClick={() => setBoundary(initialBoundary)}
                  className="min-h-[32px] flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Instant Alignment / Centering Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleAutoCenter}
                  className="min-h-[40px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors"
                >
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto-Center</span>
                </button>
                <button
                  type="button"
                  onClick={handleCenterMiddle}
                  className="min-h-[40px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  <Move className="w-3.5 h-3.5 text-slate-400" />
                  <span>Center 50/50</span>
                </button>
              </div>

              {/* Radius Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Coin Circle Size</span>
                  <span className="text-amber-400 font-mono-num">{Math.round(boundary.radius * 200)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.48"
                  step="0.005"
                  value={boundary.radius}
                  onChange={(e) => setBoundary({ ...boundary, radius: parseFloat(e.target.value) })}
                  className="w-full h-2.5 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Ellipse Aspect Ratio */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Perspective Tilt / Oval</span>
                  <span className="text-amber-400 font-mono-num">
                    {boundary.aspectRatio?.toFixed(2) || '1.00'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.80"
                  max="1.25"
                  step="0.01"
                  value={boundary.aspectRatio || 1.0}
                  onChange={(e) => setBoundary({ ...boundary, aspectRatio: parseFloat(e.target.value) })}
                  className="w-full h-2.5 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Edge Feathering Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Edge Softness</span>
                  <span className="text-amber-400 font-mono-num">{boundary.feather ?? 2}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.5"
                  value={boundary.feather ?? 2}
                  onChange={(e) => setBoundary({ ...boundary, feather: parseFloat(e.target.value) })}
                  className="w-full h-2.5 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Zoom Viewer Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Inspection Zoom</span>
                  <span className="text-amber-400 font-mono-num">{zoom.toFixed(1)}x</span>
                </div>
                <div className="flex items-center gap-2">
                  <ZoomOut
                    className="w-4 h-4 text-slate-400 cursor-pointer shrink-0"
                    onClick={() => setZoom(Math.max(0.8, zoom - 0.2))}
                  />
                  <input
                    type="range"
                    min="0.8"
                    max="2.5"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full h-2.5 accent-amber-500 cursor-pointer"
                  />
                  <ZoomIn
                    className="w-4 h-4 text-slate-400 cursor-pointer shrink-0"
                    onClick={() => setZoom(Math.min(2.5, zoom + 0.2))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="px-4 sm:px-6 pt-2.5 pb-safe bg-slate-950/95 border-t border-slate-800 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold text-xs sm:text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={processing}
            className="min-h-[44px] flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition-all"
          >
            {processing ? (
              <span>Applying...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Cutout</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
