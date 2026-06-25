const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installer', {
  windowControls: {
    minimize: () => ipcRenderer.send('window-min'),
    close: () => ipcRenderer.send('window-close'),
  },
  getMode: () => ipcRenderer.invoke('installer:get-mode'),
  getReleaseInfo: () => ipcRenderer.invoke('installer:get-release-info'),
  getDefaultInstallDir: () => ipcRenderer.invoke('installer:get-default-install-dir'),
  getInstalledInfo: () => ipcRenderer.invoke('installer:get-installed-info'),
  pickInstallDir: () => ipcRenderer.invoke('installer:pick-install-dir'),
  install: (options) => ipcRenderer.invoke('installer:install', options),
  uninstall: () => ipcRenderer.invoke('installer:uninstall'),
  launchApp: () => ipcRenderer.invoke('installer:launch-app'),
  onInstallProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('install:progress', handler);
    return () => ipcRenderer.removeListener('install:progress', handler);
  },
  onUninstallProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('uninstall:progress', handler);
    return () => ipcRenderer.removeListener('uninstall:progress', handler);
  },
});
