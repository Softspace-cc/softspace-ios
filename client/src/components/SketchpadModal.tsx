import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Eraser, Trash2, Maximize2, Minimize2, Check, Palette } from 'lucide-react';

interface SketchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (file: File) => void;
}

const CURATED_COLORS = [
  '#c9a8ff', // Softspace Purple
  '#ff9f43', // Softspace Orange
  '#1dd1a1', // Mint Green
  '#54a0ff', // Soft Blue
  '#ff6b6b', // Coral Red
  '#feca57', // Warm Yellow
  '#ff9ff3', // Pastel Pink
  '#ffffff', // White
  '#000000', // Black
];

export default function SketchpadModal({ isOpen, onClose, onSend }: SketchpadModalProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [color, setColor] = useState('#c9a8ff');
  const [lineWidth, setLineWidth] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const lastCoordsRef = useRef<{ x: number; y: number } | null>(null);

  // Resize canvas without losing drawing content
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const width = Math.floor(rect.width) || 500;
    const height = Math.floor(rect.height) || 350;

    // Skip if size hasn't changed to prevent unnecessary clears
    if (canvas.style.width === `${width}px` && canvas.style.height === `${height}px`) {
      return;
    }

    // Save existing drawing onto a temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx && canvas.width > 0 && canvas.height > 0) {
      tempCtx.drawImage(canvas, 0, 0);
    }

    // Apply high-DPI resolution scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Reset lines options (resizing resets canvas context state)
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill background color
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(0, 0, width, height);

    // Copy temp drawing back scaled to the new container size
    if (tempCanvas.width > 0 && tempCanvas.height > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  };

  // Monitor parent element size shifts (window resizes, maximized toggles)
  useEffect(() => {
    if (!isOpen) return;

    // Run first layout scale
    resizeCanvas();

    const container = canvasRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(resizeCanvas);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  // Global mouse release/touch end handler to stop drawing when releasing outside canvas
  useEffect(() => {
    if (!isDrawing) return;

    const handleGlobalMouseUp = () => {
      stopDrawing();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp, { passive: true });

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [isDrawing]);

  if (!isOpen) return null;

  // Drawing handlers
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Check if Touch Event
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    // Mouse Event
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    lastCoordsRef.current = { x, y };

    ctx.beginPath();
    ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? '#090a0f' : color;
    ctx.fill();

    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastCoordsRef.current) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    const last = lastCoordsRef.current;

    ctx.beginPath();
    ctx.strokeStyle = isEraser ? '#090a0f' : color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastCoordsRef.current = { x, y };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastCoordsRef.current = null;
  };

  // Canvas Actions
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const handleSend = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `sketch-${Date.now()}.png`, { type: 'image/png' });
        onSend(file);
        onClose();
      }
    }, 'image/png');
  };

  // Close when clicking overlay background
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fadeIn"
    >
      <div
        ref={containerRef}
        className={`bg-softspace-900 border border-softspace-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col transition-all duration-300 ease-out select-none ${
          isMaximized 
            ? 'w-full max-w-5xl h-[80vh]' 
            : 'w-full max-w-2xl h-[550px]'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-softspace-800 flex items-center justify-between bg-softspace-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <Palette className="text-softspace-400" size={18} />
            <h3 className="font-bold text-softspace-100">{t('sketchpad_title') || 'Skizzenblock'}</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Maximize Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 hover:bg-softspace-800 rounded-xl text-softspace-400 hover:text-softspace-100 transition-colors cursor-pointer"
              title={isMaximized ? (t('minimize') || 'Verkleinern') : (t('maximize') || 'Vergrößern')}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-softspace-800 rounded-xl text-softspace-400 hover:text-softspace-100 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Drawing Workspace */}
        <div className="flex-1 bg-[#090a0f] relative overflow-hidden cursor-crosshair">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="block touch-none"
          />
        </div>

        {/* Toolbar & Actions */}
        <div className="p-5 border-t border-softspace-800 bg-softspace-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          {/* Left: Colors & Thickness */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Curated Color Circles */}
            <div className="flex items-center gap-1.5 bg-softspace-950/60 p-1.5 rounded-2xl border border-softspace-800">
              {CURATED_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setIsEraser(false);
                  }}
                  className={`w-6 h-6 rounded-full transition-all relative ${
                    color === c && !isEraser
                      ? 'ring-2 ring-softspace-400 scale-110 shadow-lg'
                      : 'hover:scale-105 active:scale-95'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>

            {/* Thickness / Size Slider */}
            <div className="flex items-center gap-2 bg-softspace-950/60 px-3 py-1.5 rounded-2xl border border-softspace-800">
              <span className="text-xs font-semibold text-softspace-400 uppercase tracking-wider">{t('size') || 'Größe'}</span>
              <input
                type="range"
                min="2"
                max="40"
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-20 md:w-28 accent-softspace-500 cursor-pointer h-1 rounded-lg bg-softspace-800"
              />
              <span className="text-xs font-bold text-softspace-200 min-w-[20px] text-center">{lineWidth}px</span>
            </div>
          </div>

          {/* Right: Tools & Submit */}
          <div className="flex items-center gap-2.5 ml-auto">
            {/* Eraser */}
            <button
              type="button"
              onClick={() => setIsEraser(!isEraser)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                isEraser
                  ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                  : 'bg-softspace-900 border-softspace-850 hover:border-softspace-700 text-softspace-300'
              }`}
            >
              <Eraser size={14} />
              {t('eraser') || 'Radierer'}
            </button>

            {/* Trash / Clear */}
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-softspace-850 hover:border-red-900/40 bg-softspace-900 text-softspace-400 hover:text-red-400 hover:bg-red-950/20 transition-all text-sm font-semibold cursor-pointer"
              title={t('clear_canvas') || 'Leeren'}
            >
              <Trash2 size={14} />
              {t('clear') || 'Leeren'}
            </button>

            <span className="h-5 w-px bg-softspace-850 mx-0.5 hidden md:block" />

            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-softspace-900 border border-softspace-850 hover:border-softspace-700 rounded-xl text-softspace-300 font-semibold transition-colors text-sm cursor-pointer"
            >
              {t('cancel') || 'Abbrechen'}
            </button>

            {/* Send */}
            <button
              type="button"
              onClick={handleSend}
              className="flex items-center gap-1.5 px-4 py-2 bg-softspace-500 hover:bg-softspace-400 rounded-xl text-white font-semibold shadow-lg shadow-softspace-500/20 transition-all text-sm cursor-pointer"
            >
              <Check size={14} />
              {t('send') || 'Senden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
