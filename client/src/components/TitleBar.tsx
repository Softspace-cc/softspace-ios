import { X, Minus, Square } from 'lucide-react';

export default function TitleBar() {
  // @ts-ignore
  if (!window.electron) return null;

  const handleMinimize = () => {
    // @ts-ignore
    window.electron.windowControls.minimize();
  };

  const handleMaximize = () => {
    // @ts-ignore
    window.electron.windowControls.maximize();
  };

  const handleClose = () => {
    // @ts-ignore
    window.electron.windowControls.close();
  };

  return (
    <div className="h-8 w-full bg-softspace-950 flex justify-between items-center select-none" style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="flex items-center px-3 gap-2">
        <img src="./heart.svg" alt="Logo" className="w-4 h-4" />
        <span className="text-xs font-semibold text-softspace-300">SoftSpace</span>
      </div>
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={handleMinimize}
          className="h-full px-4 hover:bg-softspace-800 text-softspace-300 transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-4 hover:bg-softspace-800 text-softspace-300 transition-colors"
        >
          <Square size={14} />
        </button>
        <button
          onClick={handleClose}
          className="h-full px-4 hover:bg-red-500 hover:text-white text-softspace-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
