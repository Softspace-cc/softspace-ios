/// <reference types="vite/client" />

type InstallProgress = {
  done: number;
  total: number;
  file: string;
  phase?: 'download' | 'extract' | 'install';
  bytesDone?: number;
  bytesTotal?: number | null;
};

type InstallOptions = {
  installDir: string;
  desktopShortcut: boolean;
  startMenuShortcut: boolean;
};

type InstallResult = {
  installDir: string;
  exePath: string;
};

type ReleaseInfo = {
  version: string;
  requiresInternet: boolean;
};

type InstallerBridge = {
  windowControls: {
    minimize: () => void;
    close: () => void;
  };
  getMode: () => Promise<'install' | 'uninstall'>;
  getReleaseInfo: () => Promise<ReleaseInfo>;
  getDefaultInstallDir: () => Promise<string>;
  getInstalledInfo: () => Promise<{ installDir: string; version: string } | null>;
  pickInstallDir: () => Promise<string | null>;
  install: (options: InstallOptions) => Promise<InstallResult>;
  uninstall: () => Promise<void>;
  launchApp: () => Promise<void>;
  onInstallProgress: (callback: (progress: InstallProgress) => void) => () => void;
  onUninstallProgress: (callback: (progress: InstallProgress) => void) => () => void;
};

declare global {
  interface Window {
    installer?: InstallerBridge;
  }
}

export {};
