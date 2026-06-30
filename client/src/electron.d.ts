type ElectronNotificationTarget =
  | { type: 'dm'; channelId: string }
  | { type: 'channel'; channelId: string; serverId: string | null }
  | { type: 'call'; channelId: string }
  | null;

type ElectronNotificationOptions = {
  title: string;
  body: string;
  icon?: string | null;
  navigationTarget?: ElectronNotificationTarget;
};

type DesktopCaptureSource = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string | null;
  displayId?: string;
};

type ElectronBridge = {
  windowControls: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  getActiveWindow: () => Promise<any>;
  getRunningProcesses?: () => Promise<Array<{ name: string; title: string }>>;
  getMediaSessions?: () => Promise<any[]>;
  getDesktopSources?: (options?: {
    types?: Array<'screen' | 'window'>;
    thumbnailSize?: { width: number; height: number };
  }) => Promise<DesktopCaptureSource[]>;
  showNotification?: (options: ElectronNotificationOptions) => void;
  setBadgeCount?: (count: number) => void;
  onNotificationClick?: (callback: (payload: ElectronNotificationTarget) => void) => () => void;
  /** Whether the app should minimize to system tray instead of closing */
  minimizeToTray?: boolean;
  /** Notify the main process of the current minimize-to-tray preference so it can update tray behavior */
  setMinimizeToTray?: (enabled: boolean) => void;
  // Update handlers
  checkForUpdates?: () => Promise<{ success: boolean; error?: string }>;
  downloadUpdate?: () => Promise<{ success: boolean; error?: string }>;
  installUpdate?: () => Promise<{ success: boolean; error?: string }>;
  onUpdateStatus?: (callback: (status: any) => void) => () => void;
  onUpdateDownloadProgress?: (callback: (progress: any) => void) => () => void;
};

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export {};
