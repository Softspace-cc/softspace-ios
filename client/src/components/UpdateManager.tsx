import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Check, AlertCircle, X, RefreshCw } from 'lucide-react';

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloaded' | 'error';
  info?: any;
  error?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export function UpdateManager() {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installCountdown, setInstallCountdown] = useState(3);

  useEffect(() => {
    if (!window.electron) return;

    const unsubscribe = window.electron.onUpdateStatus((status: UpdateStatus) => {
      setUpdateStatus(status);

      if (status.status === 'available') {
        setIsVisible(true);
      } else if (status.status === 'downloaded') {
        setIsDownloading(false);
      } else if (status.status === 'error') {
        // Don't show error modal if it's just a 404 (no update file yet)
        if (status.error && !status.error.includes('404')) {
          setIsVisible(true);
        }
      } else if (status.status === 'not-available') {
        setIsVisible(false);
      }
    });

    const unsubscribeProgress = window.electron.onUpdateDownloadProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress);
    });

    // Check for updates on app startup
    handleCheckForUpdates();

    return () => {
      unsubscribe();
      unsubscribeProgress();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electron) return;
    setUpdateStatus({ status: 'checking' });
    setIsInstalling(false);
    await window.electron.checkForUpdates();
  };

  const handleDownloadUpdate = async () => {
    if (!window.electron) return;
    setIsDownloading(true);
    await window.electron.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    if (!window.electron) return;
    setIsInstalling(true);
    setInstallCountdown(3);

    let count = 3;
    const interval = setInterval(async () => {
      count -= 1;
      setInstallCountdown(count);
      if (count === 0) {
        clearInterval(interval);
        await window.electron.installUpdate();
      }
    }, 1000);
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible || !updateStatus) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#121f20] rounded-lg shadow-2xl w-full max-w-md mx-4 border border-[#1a2a2b]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a2a2b]">
          <div className="flex items-center gap-2">
            {isInstalling ? (
              <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
            ) : (
              <>
                {updateStatus.status === 'checking' && (
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
                )}
                {updateStatus.status === 'available' && (
                  <Download className="w-5 h-5 text-emerald-400" />
                )}
                {updateStatus.status === 'downloaded' && (
                  <Check className="w-5 h-5 text-emerald-400" />
                )}
                {updateStatus.status === 'error' && (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
              </>
            )}
            <h2 className="text-lg font-semibold text-white">
              {isInstalling && t('update_install_now')}
              {!isInstalling && updateStatus.status === 'checking' && t('update_checking')}
              {!isInstalling && updateStatus.status === 'available' && t('update_available')}
              {!isInstalling && updateStatus.status === 'downloaded' && t('update_download_complete')}
              {!isInstalling && updateStatus.status === 'error' && t('update_error')}
            </h2>
          </div>
          {!isInstalling && (
            <button
              onClick={handleClose}
              className="text-softspace-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {isInstalling && (
            <div className="space-y-3 text-center py-4">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-white text-sm font-medium">
                {t('update_installing_countdown', { seconds: installCountdown })}
              </p>
            </div>
          )}

          {!isInstalling && updateStatus.status === 'checking' && (
            <p className="text-softspace-300 text-sm">{t('update_checking')}</p>
          )}

          {!isInstalling && updateStatus.status === 'available' && updateStatus.info && (
            <div className="space-y-3">
              <p className="text-softspace-300 text-sm">
                {t('update_available_desc', { version: updateStatus.info.version })}
              </p>
              {updateStatus.info.releaseNotes && (
                <div className="bg-[#1a2a2b] rounded p-3 text-sm text-softspace-300 max-h-40 overflow-y-auto">
                  <p className="whitespace-pre-wrap">{updateStatus.info.releaseNotes}</p>
                </div>
              )}
            </div>
          )}

          {!isInstalling && updateStatus.status === 'downloaded' && (
            <p className="text-softspace-300 text-sm">{t('update_download_complete')}</p>
          )}

          {!isInstalling && updateStatus.status === 'error' && (
            <div className="space-y-3">
              <p className="text-softspace-300 text-sm">{t('update_error_desc')}</p>
              {updateStatus.error && (
                <p className="text-red-400 text-sm font-mono bg-[#1a2a2b] rounded p-2">
                  {updateStatus.error}
                </p>
              )}
            </div>
          )}

          {!isInstalling && isDownloading && downloadProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-softspace-300">
                <span>{t('update_downloading')}</span>
                <span>{t('update_download_progress', { percent: Math.round(downloadProgress.percent) })}</span>
              </div>
              <div className="w-full bg-[#1a2a2b] rounded-full h-2">
                <div
                  className="bg-softspace-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isInstalling && (
          <div className="flex gap-2 p-4 border-t border-[#1a2a2b] justify-end">
            {updateStatus.status === 'available' && !isDownloading && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded bg-softspace-700 text-white hover:bg-softspace-600 transition-colors"
                >
                  {t('update_install_later')}
                </button>
                <button
                  onClick={handleDownloadUpdate}
                  className="px-4 py-2 rounded bg-softspace-600 text-white hover:bg-softspace-500 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('update_downloading')}
                </button>
              </>
            )}

            {updateStatus.status === 'downloaded' && (
              <button
                onClick={handleInstallUpdate}
                className="px-4 py-2 rounded bg-softspace-600 text-white hover:bg-softspace-500 transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t('update_install_now')}
              </button>
            )}

            {updateStatus.status === 'error' && (
              <button
                onClick={handleCheckForUpdates}
                className="px-4 py-2 rounded bg-softspace-600 text-white hover:bg-softspace-500 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {t('update_retry')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
