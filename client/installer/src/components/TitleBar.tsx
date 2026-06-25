import { Minus, X } from 'lucide-react';

export function TitleBar() {
  if (!window.installer) return null;

  return (
    <div
      className="h-8 w-full bg-softspace-950 flex justify-between items-center select-none border-b border-softspace-800"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center px-3 gap-2">
        <img src="./heart.svg" alt="" className="w-4 h-4" />
        <span className="text-xs font-semibold text-softspace-300">SoftSpace</span>
      </div>
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => window.installer?.windowControls.minimize()}
          className="h-full px-4 hover:bg-softspace-800 text-softspace-300 transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => window.installer?.windowControls.close()}
          className="h-full px-4 hover:bg-red-500 hover:text-white text-softspace-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
