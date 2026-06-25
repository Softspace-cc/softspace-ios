import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

type Point = { x: number; y: number };
type Area = { width: number; height: number; x: number; y: number };

type Props = {
  isOpen: boolean;
  imageSrc: string;
  aspect?: number;
  onClose: () => void;
  onCropComplete: (croppedImageFile: File) => void;
};

// Helper function to create a canvas and crop the image
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
): Promise<File> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'));
        return;
      }
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
      resolve(file);
    }, 'image/jpeg');
  });
}

export default function ImageCropperModal({ isOpen, imageSrc, aspect = 1, onClose, onCropComplete }: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedImage);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-softspace-900 rounded-2xl border border-softspace-800 shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-softspace-800">
          <h3 className="font-bold text-softspace-50">Crop Image</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-softspace-800 text-softspace-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative w-full h-80 bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <ZoomOut size={18} className="text-softspace-400" />
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-softspace-500"
            />
            <ZoomIn size={18} className="text-softspace-400" />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-softspace-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className="px-6 py-2 bg-softspace-500 hover:bg-softspace-400 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}