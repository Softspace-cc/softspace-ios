import { useEffect, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { InstallWizard, UninstallWizard } from './components/Wizard';

type InstallStep = 'welcome' | 'location' | 'progress' | 'done';
type UninstallStep = 'confirm' | 'progress' | 'done';

export default function App() {
  const [mode, setMode] = useState<'install' | 'uninstall' | null>(null);
  const [installStep, setInstallStep] = useState<InstallStep>('welcome');
  const [uninstallStep, setUninstallStep] = useState<UninstallStep>('confirm');
  const [installDir, setInstallDir] = useState('');
  const [installedDir, setInstalledDir] = useState('');
  const [desktopShortcut, setDesktopShortcut] = useState(true);
  const [startMenuShortcut, setStartMenuShortcut] = useState(true);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressFile, setProgressFile] = useState('');
  const [progressPhase, setProgressPhase] = useState<'download' | 'extract' | 'install' | undefined>();
  const [progressBytesDone, setProgressBytesDone] = useState<number | undefined>();
  const [progressBytesTotal, setProgressBytesTotal] = useState<number | null | undefined>();
  const [releaseVersion, setReleaseVersion] = useState('0.1.0');
  const [requiresInternet, setRequiresInternet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.installer) return;

    void (async () => {
      const nextMode = await window.installer!.getMode();
      setMode(nextMode);

      if (nextMode === 'install') {
        const [defaultDir, releaseInfo] = await Promise.all([
          window.installer!.getDefaultInstallDir(),
          window.installer!.getReleaseInfo(),
        ]);
        setInstallDir(defaultDir);
        setReleaseVersion(releaseInfo.version);
        setRequiresInternet(releaseInfo.requiresInternet);
      } else {
        const info = await window.installer!.getInstalledInfo();
        if (info?.installDir) {
          setInstalledDir(info.installDir);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!window.installer) return;

    const unsubInstall = window.installer.onInstallProgress((progress) => {
      setProgressDone(progress.done);
      setProgressTotal(progress.total);
      setProgressFile(progress.file);
      setProgressPhase(progress.phase);
      setProgressBytesDone(progress.bytesDone);
      setProgressBytesTotal(progress.bytesTotal);
    });

    const unsubUninstall = window.installer.onUninstallProgress((progress) => {
      setProgressDone(progress.done);
      setProgressTotal(progress.total);
      setProgressFile(progress.file);
    });

    return () => {
      unsubInstall();
      unsubUninstall();
    };
  }, []);

  const handleInstall = async () => {
    if (!window.installer) return;
    setError(null);
    setInstallStep('progress');
    setProgressDone(0);
    setProgressTotal(0);
    setProgressFile('');
    setProgressPhase(undefined);
    setProgressBytesDone(undefined);
    setProgressBytesTotal(undefined);

    try {
      await window.installer.install({
        installDir: installDir.trim(),
        desktopShortcut,
        startMenuShortcut,
      });
      setInstallStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation fehlgeschlagen.');
      setInstallStep('location');
    }
  };

  const handleUninstall = async () => {
    if (!window.installer) return;
    setError(null);
    setUninstallStep('progress');
    setProgressDone(0);
    setProgressTotal(0);
    setProgressFile('');
    setProgressPhase(undefined);
    setProgressBytesDone(undefined);
    setProgressBytesTotal(undefined);

    try {
      await window.installer.uninstall();
      setUninstallStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deinstallation fehlgeschlagen.');
      setUninstallStep('confirm');
    }
  };

  const handleBrowse = async () => {
    if (!window.installer) return;
    const picked = await window.installer.pickInstallDir();
    if (picked) setInstallDir(picked);
  };

  const handleClose = () => window.installer?.windowControls.close();
  const handleLaunch = () => void window.installer?.launchApp();

  if (!window.installer) {
    return (
      <div className="h-full flex items-center justify-center text-softspace-400 text-sm">
        Installer bridge nicht verfügbar.
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="h-full flex flex-col">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center text-softspace-400 text-sm">
          Laden…
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TitleBar />
      <main className="flex-1 min-h-0">
        {mode === 'install' ? (
          <InstallWizard
            step={installStep}
            installDir={installDir}
            desktopShortcut={desktopShortcut}
            startMenuShortcut={startMenuShortcut}
            progressDone={progressDone}
            progressTotal={progressTotal}
            progressFile={progressFile}
            progressPhase={progressPhase}
            progressBytesDone={progressBytesDone}
            progressBytesTotal={progressBytesTotal}
            releaseVersion={releaseVersion}
            requiresInternet={requiresInternet}
            error={error}
            onNext={() => {
              if (installStep === 'welcome') setInstallStep('location');
              else if (installStep === 'location') void handleInstall();
            }}
            onBack={() => setInstallStep('welcome')}
            onInstallDirChange={setInstallDir}
            onBrowse={() => void handleBrowse()}
            onDesktopShortcutChange={setDesktopShortcut}
            onStartMenuShortcutChange={setStartMenuShortcut}
            onLaunch={handleLaunch}
            onClose={handleClose}
          />
        ) : (
          <UninstallWizard
            installDir={installedDir}
            progressDone={progressDone}
            progressTotal={progressTotal}
            progressFile={progressFile}
            step={uninstallStep}
            error={error}
            onConfirm={() => void handleUninstall()}
            onClose={handleClose}
          />
        )}
      </main>
    </div>
  );
}
