import { Heart } from 'lucide-react';
import type { ReactNode } from 'react';

function Shell({
  subtitle,
  children,
  footer,
}: {
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="h-full bg-softspace-950 flex items-center justify-center p-10">
      <div className="w-full max-w-xl bg-softspace-900 border border-softspace-800 rounded-2xl shadow-xl">
        <div className="px-10 pt-10 pb-7 border-b border-softspace-800">
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-softspace-600 rounded-xl flex items-center justify-center mb-4">
              <Heart className="text-white" size={26} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-softspace-50">SoftSpace</h1>
            <p className="text-sm text-softspace-400 mt-1.5">{subtitle}</p>
          </div>
        </div>

        <div className="px-10 py-8">{children}</div>

        <div className="px-10 py-5 border-t border-softspace-800 flex items-center justify-between gap-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-softspace-950 overflow-hidden">
      <div
        className="h-full bg-softspace-600 transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function btnPrimary(extra = '') {
  return `px-4 py-2.5 bg-softspace-600 hover:bg-softspace-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none ${extra}`;
}

function btnGhost(extra = '') {
  return `px-4 py-2.5 text-sm text-softspace-400 hover:text-softspace-100 rounded-lg transition-colors ${extra}`;
}

function btnDanger(extra = '') {
  return `px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors ${extra}`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

type InstallStep = 'welcome' | 'location' | 'progress' | 'done';

export function InstallWizard({
  step,
  installDir,
  desktopShortcut,
  startMenuShortcut,
  progressDone,
  progressTotal,
  progressFile,
  progressPhase,
  progressBytesDone,
  progressBytesTotal,
  releaseVersion,
  requiresInternet,
  error,
  onNext,
  onBack,
  onInstallDirChange,
  onBrowse,
  onDesktopShortcutChange,
  onStartMenuShortcutChange,
  onLaunch,
  onClose,
}: {
  step: InstallStep;
  installDir: string;
  desktopShortcut: boolean;
  startMenuShortcut: boolean;
  progressDone: number;
  progressTotal: number;
  progressFile: string;
  progressPhase?: 'download' | 'extract' | 'install';
  progressBytesDone?: number;
  progressBytesTotal?: number | null;
  releaseVersion: string;
  requiresInternet: boolean;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
  onInstallDirChange: (value: string) => void;
  onBrowse: () => void;
  onDesktopShortcutChange: (value: boolean) => void;
  onStartMenuShortcutChange: (value: boolean) => void;
  onLaunch: () => void;
  onClose: () => void;
}) {
  const isDownload = progressPhase === 'download';
  const downloadPct =
    isDownload && progressBytesTotal && progressBytesDone !== undefined
      ? Math.round((progressBytesDone / progressBytesTotal) * 100)
      : null;
  const pct = downloadPct ?? (progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0);

  const subtitles: Record<InstallStep, string> = {
    welcome: 'Setup',
    location: 'Installationsordner',
    progress: isDownload ? 'Wird heruntergeladen…' : 'Installiert…',
    done: 'Fertig',
  };

  return (
    <Shell
      subtitle={subtitles[step]}
      footer={
        <>
          <div>
            {step === 'location' && (
              <button type="button" onClick={onBack} className={btnGhost()}>
                Zurück
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'welcome' && (
              <>
                <button type="button" onClick={onClose} className={btnGhost()}>
                  Abbrechen
                </button>
                <button type="button" onClick={onNext} className={btnPrimary()}>
                  Weiter
                </button>
              </>
            )}
            {step === 'location' && (
              <>
                <button type="button" onClick={onClose} className={btnGhost()}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!installDir.trim()}
                  className={btnPrimary()}
                >
                  Installieren
                </button>
              </>
            )}
            {step === 'done' && (
              <>
                <button type="button" onClick={onClose} className={btnGhost()}>
                  Schließen
                </button>
                <button type="button" onClick={onLaunch} className={btnPrimary()}>
                  Öffnen
                </button>
              </>
            )}
          </div>
        </>
      }
    >
      {step === 'welcome' && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-softspace-300 leading-relaxed">
            SoftSpace wird auf deinem PC installiert.
          </p>
          {requiresInternet && (
            <p className="text-xs text-softspace-500 leading-relaxed">
              Die App wird beim Installieren aus dem Internet geladen. Eine aktive Verbindung ist nötig.
            </p>
          )}
          <p className="text-softspace-500 text-xs">Version {releaseVersion}</p>
        </div>
      )}

      {step === 'location' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">
              Ordner
            </label>
            <div className="flex gap-2">
              <input
                value={installDir}
                onChange={(e) => onInstallDirChange(e.target.value)}
                className="flex-1 min-w-0 bg-softspace-950 border border-softspace-800 rounded-lg px-3 py-2.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
              />
              <button type="button" onClick={onBrowse} className={btnGhost('shrink-0 border border-softspace-800 px-3')}>
                Ordner
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={desktopShortcut}
              onChange={(e) => onDesktopShortcutChange(e.target.checked)}
              className="rounded border-softspace-700 bg-softspace-950 text-softspace-600"
            />
            <span className="text-sm text-softspace-300">Verknüpfung auf dem Desktop</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={startMenuShortcut}
              onChange={(e) => onStartMenuShortcutChange(e.target.checked)}
              className="rounded border-softspace-700 bg-softspace-950 text-softspace-600"
            />
            <span className="text-sm text-softspace-300">Eintrag im Startmenü</span>
          </label>
        </div>
      )}

      {step === 'progress' && (
        <div className="space-y-4">
          <ProgressBar value={pct} />
          <p className="text-xs text-softspace-500 text-center tabular-nums">{pct}%</p>
          {isDownload && progressBytesDone !== undefined && progressBytesTotal ? (
            <p className="text-xs text-softspace-500 text-center tabular-nums">
              {formatBytes(progressBytesDone)} / {formatBytes(progressBytesTotal)}
            </p>
          ) : null}
          {progressFile && (
            <p className="text-[11px] text-softspace-600 truncate text-center">{progressFile}</p>
          )}
        </div>
      )}

      {step === 'done' && (
        <p className="text-sm text-softspace-300 text-center leading-relaxed">
          Installation abgeschlossen.
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
      )}
    </Shell>
  );
}

export function UninstallWizard({
  installDir,
  progressDone,
  progressTotal,
  step,
  error,
  onConfirm,
  onClose,
}: {
  installDir: string;
  progressDone: number;
  progressTotal: number;
  progressFile: string;
  step: 'confirm' | 'progress' | 'done';
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const pct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

  const subtitles = {
    confirm: 'Deinstallieren',
    progress: 'Entfernt…',
    done: 'Entfernt',
  };

  return (
    <Shell
      subtitle={subtitles[step]}
      footer={
        <div className="w-full flex justify-end gap-2">
          {step === 'confirm' && (
            <>
              <button type="button" onClick={onClose} className={btnGhost()}>
                Abbrechen
              </button>
              <button type="button" onClick={onConfirm} className={btnDanger()}>
                Entfernen
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className={btnPrimary()}>
              Schließen
            </button>
          )}
        </div>
      }
    >
      {step === 'confirm' && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-softspace-300 leading-relaxed">
            SoftSpace wird deinstalliert.
          </p>
          <p className="text-xs text-softspace-500 break-all font-mono">{installDir}</p>
        </div>
      )}

      {step === 'progress' && (
        <div className="space-y-4">
          <ProgressBar value={pct} />
          <p className="text-xs text-softspace-500 text-center tabular-nums">{pct}%</p>
        </div>
      )}

      {step === 'done' && (
        <p className="text-sm text-softspace-300 text-center">SoftSpace wurde entfernt.</p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
      )}
    </Shell>
  );
}
