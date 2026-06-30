const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  windowControls: {
    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close'),
  },
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  getRunningProcesses: () => ipcRenderer.invoke('get-running-processes'),
  getMediaSessions: () => ipcRenderer.invoke('get-media-sessions'),
  getDesktopSources: (options) => ipcRenderer.invoke('desktop-capturer-get-sources', options),
  showNotification: (options) => ipcRenderer.send('show-notification', options),
  onNotificationClick: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('notification-clicked', handler);
    return () => ipcRenderer.removeListener('notification-clicked', handler);
  },
  minimizeToTray: false,
  setMinimizeToTray: (enabled) => ipcRenderer.send('set-minimize-to-tray', enabled),
  // Update handlers
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },
});
