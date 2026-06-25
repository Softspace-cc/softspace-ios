import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, AppWindow, X } from 'lucide-react';
import type { DesktopCaptureSource } from '../lib/screenCapture';
import { listDesktopCaptureSources } from '../lib/screenCapture';

export function ScreenSourcePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (sourceId: string) => void;
}) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listDesktopCaptureSources()
      .then((items) => {
        if (!cancelled) setSources(items);
      })
      .catch((err) => {
        console.error('listDesktopCaptureSources failed', err);
        if (!cancelled) setSources([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-softspace-800 bg-softspace-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-softspace-800">
          <div>
            <h2 className="text-lg font-semibold text-softspace-100">{t('screen_picker_title')}</h2>
            <p className="text-sm text-softspace-400">{t('screen_picker_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-softspace-400 hover:text-softspace-100 hover:bg-softspace-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="text-center text-softspace-400 py-8">{t('screen_picker_loading')}</div>
          ) : sources.length === 0 ? (
            <div className="text-center text-softspace-400 py-8">{t('screen_picker_empty')}</div>
          ) : (
            <>
              {screens.length > 0 && (
                <SourceSection
                  title={t('screen_picker_screens')}
                  icon={<Monitor size={16} />}
                  sources={screens}
                  onSelect={onSelect}
                />
              )}
              {windows.length > 0 && (
                <SourceSection
                  title={t('screen_picker_windows')}
                  icon={<AppWindow size={16} />}
                  sources={windows}
                  onSelect={onSelect}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceSection({
  title,
  icon,
  sources,
  onSelect,
}: {
  title: string;
  icon: ReactNode;
  sources: DesktopCaptureSource[];
  onSelect: (sourceId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-softspace-300 mb-3">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => onSelect(source.id)}
            className="group rounded-xl border border-softspace-800 bg-softspace-950 hover:border-indigo-500/60 hover:bg-softspace-900 transition-colors overflow-hidden text-left"
          >
            <div className="aspect-video bg-softspace-900 flex items-center justify-center overflow-hidden">
              {source.thumbnail ? (
                <img src={source.thumbnail} alt={source.name} className="w-full h-full object-cover" />
              ) : (
                <Monitor size={28} className="text-softspace-600" />
              )}
            </div>
            <div className="px-3 py-2 text-sm text-softspace-200 truncate">{source.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
