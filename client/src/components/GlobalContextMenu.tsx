import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, RefreshCw, LogOut, ArrowLeft, ArrowRight, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

type MenuPosition = { x: number; y: number };

export function GlobalContextMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuthStore(state => state.logout);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) {
        return;
      }

      // Don't override if they clicked on an input or textarea
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      e.preventDefault();
      
      // Ensure the menu stays within the viewport
      let x = e.clientX;
      let y = e.clientY;
      
      const menuWidth = 200;
      const menuHeight = 250; // approximate
      
      if (x + menuWidth > window.innerWidth) x -= menuWidth;
      if (y + menuHeight > window.innerHeight) y -= menuHeight;
      
      setPosition({ x, y });
    };

    const handleClick = () => {
      setPosition(null);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClick);
    
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClick);
    };
  }, []);

  if (!position) return null;

  return (
    <div 
      className="fixed z-[9999] bg-softspace-900 border border-softspace-800 shadow-2xl rounded-xl py-2 w-48 text-sm animate-fadeIn"
      style={{ top: position.y, left: position.x }}
    >
      <button 
        onClick={() => window.history.back()}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-softspace-800 text-softspace-200 transition-colors"
      >
        <ArrowLeft size={16} className="text-softspace-400" />
        {t('back') || 'Back'}
      </button>
      <button 
        onClick={() => window.history.forward()}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-softspace-800 text-softspace-200 transition-colors"
      >
        <ArrowRight size={16} className="text-softspace-400" />
        Forward
      </button>
      <button 
        onClick={() => window.location.reload()}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-softspace-800 text-softspace-200 transition-colors"
      >
        <RefreshCw size={16} className="text-softspace-400" />
        Reload
      </button>
      
      <div className="h-px bg-softspace-800 my-1 mx-2" />
      
      <button 
        onClick={() => {
          navigator.clipboard.writeText(window.location.href);
        }}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-softspace-800 text-softspace-200 transition-colors"
      >
        <Copy size={16} className="text-softspace-400" />
        Copy Link
      </button>

      <div className="h-px bg-softspace-800 my-1 mx-2" />

      <button 
        onClick={() => navigate('/app/settings')}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-softspace-800 text-softspace-200 transition-colors"
      >
        <Settings size={16} className="text-softspace-400" />
        Settings
      </button>

      <button 
        onClick={() => logout()}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-red-500/20 text-red-400 transition-colors"
      >
        <LogOut size={16} className="text-red-400" />
        {t('logout') || 'Log out'}
      </button>
    </div>
  );
}
