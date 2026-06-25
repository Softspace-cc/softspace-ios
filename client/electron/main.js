import { app, BrowserWindow, ipcMain, shell, Notification, nativeImage, desktopCapturer, session } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const APP_USER_MODEL_ID = 'com.softspace.app';

if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath);
}

let activeWin = null;
const execFileAsync = promisify(execFile);
try {
  // active-win might fail to load if native modules aren't built for the correct Electron version
  activeWin = (await import('active-win')).default;
} catch (e) {
  console.warn('active-win module could not be loaded. Game presence will be disabled.', e);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let mediaSessionsCache = [];
let stopMediaSessionsWatcher = null;

function isSpotifyMediaSession(session) {
  if (!session) return false;
  return (
    session.id === 'Spotify.exe' ||
    (typeof session.sourceAppUserModelId === 'string' &&
      session.sourceAppUserModelId.toLowerCase().includes('spotify'))
  );
}

function mergeSessionsWithCachedThumbnails(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return sessions;
  }

  const cachedSpotify = mediaSessionsCache.find(
    (session) => isSpotifyMediaSession(session) && session.thumbnail
  );

  return sessions.map((session) => {
    if (!isSpotifyMediaSession(session) || session.thumbnail) {
      return session;
    }

    const cachedMatch = mediaSessionsCache.find(
      (cached) =>
        isSpotifyMediaSession(cached) &&
        cached.thumbnail &&
        cached.title === session.title &&
        cached.artist === session.artist
    );

    const thumbnail = cachedMatch?.thumbnail ?? cachedSpotify?.thumbnail;
    return thumbnail ? { ...session, thumbnail } : session;
  });
}

async function startMediaSessionsWatcher() {
  if (process.platform !== 'win32') return;

  try {
    const wms = await import('windows-media-sessions');
    const sessions = await wms.getAllSessions();
    if (Array.isArray(sessions) && sessions.length > 0) {
      mediaSessionsCache = sessions;
    }
    stopMediaSessionsWatcher = wms.onSessionsChanged((updatedSessions) => {
      mediaSessionsCache = Array.isArray(updatedSessions) ? [...updatedSessions] : [];
    });
  } catch (error) {
    console.warn('windows-media-sessions watcher could not start:', error);
  }
}

function getDefaultNotificationIconPath() {
  const candidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[1];
}

function getDefaultNotificationIcon() {
  const iconPath = getDefaultNotificationIconPath();
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

async function getNotificationIcon(iconUrl) {
  if (!iconUrl) {
    return getDefaultNotificationIcon();
  }

  try {
    if (iconUrl.startsWith('data:')) {
      const image = nativeImage.createFromDataURL(iconUrl);
      if (!image.isEmpty()) return image;
    } else if (/\.(svg|webp)(\?|$)/i.test(iconUrl)) {
      // Windows toast icons must be raster images.
      return getDefaultNotificationIcon();
    } else {
      const res = await fetch(iconUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        throw new Error(`Failed to fetch notification icon: ${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('svg')) {
        return getDefaultNotificationIcon();
      }

      const arrayBuffer = await res.arrayBuffer();
      const image = nativeImage.createFromBuffer(Buffer.from(arrayBuffer));
      if (!image.isEmpty()) {
        return image;
      }
    }
  } catch (error) {
    console.error('Error loading notification icon:', error);
  }

  return getDefaultNotificationIcon();
}

async function getSpotifyMediaSessionFallback() {
  if (process.platform !== 'win32') {
    return [];
  }

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 })[0]
$managerTask = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()))
$manager = $managerTask.Result
$items = foreach ($session in $manager.GetSessions()) {
  if (($session.SourceAppUserModelId + '') -notmatch 'spotify') { continue }
  $propsTask = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]).Invoke($null, @($session.TryGetMediaPropertiesAsync()))
  $props = $propsTask.Result
  $timeline = $session.GetTimelineProperties()
  [pscustomobject]@{
    id = $session.SourceAppUserModelId
    sourceAppUserModelId = $session.SourceAppUserModelId
    title = $props.Title
    artist = $props.Artist
    playbackStatus = $session.GetPlaybackInfo().PlaybackStatus.ToString().ToLowerInvariant()
    timeline = @{
      positionMs = [int64]($timeline.Position.Ticks / 10000)
      durationMs = [int64]($timeline.EndTime.Ticks / 10000)
    }
  }
}
$items | ConvertTo-Json -Depth 5 -Compress
`.trim();

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      }
    );

    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }

    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('Error getting Spotify fallback media session:', error);
    return [];
  }
}

async function getRunningProcesses() {
  if (process.platform !== 'win32') {
    return [];
  }

  const script = `
Get-Process | ForEach-Object {
  [pscustomobject]@{
    name = $_.ProcessName
    title = $_.MainWindowTitle
  }
} | ConvertTo-Json -Compress
`.trim();

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    const trimmed = stdout.trim();
    if (!trimmed) return [];

    const parsed = JSON.parse(trimmed);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item) => ({
      name: String(item.name ?? ''),
      title: String(item.title ?? ''),
    }));
  } catch (error) {
    console.error('Error getting running processes:', error);
    return [];
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Custom frameless window
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../build/icon.ico')
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    // mainWindow.webContents.openDevTools();
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'display-capture' || permission === 'media') {
      callback(true);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'display-capture' || permission === 'media' || permission === 'fullscreen';
  });

  createWindow();
  startMediaSessionsWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (typeof stopMediaSessionsWatcher === 'function') {
    stopMediaSessionsWatcher();
    stopMediaSessionsWatcher = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for window controls
ipcMain.on('window-min', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-max', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Active window tracking (Game presence)
ipcMain.handle('get-active-window', async () => {
  try {
    if (activeWin) {
      const win = await activeWin();
      return win;
    }
    return null;
  } catch (error) {
    console.error('Error getting active window:', error);
    return null;
  }
});

ipcMain.handle('get-running-processes', async () => {
  return await getRunningProcesses();
});

// Media sessions tracking
ipcMain.handle('get-media-sessions', async () => {
  if (mediaSessionsCache.length > 0) {
    return mediaSessionsCache;
  }

  try {
    const wms = await import('windows-media-sessions');
    const sessions = await wms.getAllSessions();
    if (Array.isArray(sessions) && sessions.length > 0) {
      mediaSessionsCache = sessions;
      return sessions;
    }
  } catch (error) {
    console.error('Error getting media sessions:', error);
  }

  const fallback = await getSpotifyMediaSessionFallback();
  return mergeSessionsWithCachedThumbnails(fallback);
});

// Desktop capture sources for high-quality screen sharing in the desktop app
ipcMain.handle('desktop-capturer-get-sources', async (_event, options = {}) => {
  try {
    const sources = await desktopCapturer.getSources({
      types: options.types ?? ['screen', 'window'],
      thumbnailSize: options.thumbnailSize ?? { width: 320, height: 180 },
      fetchWindowIcons: true,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnail: source.thumbnail?.isEmpty?.() ? '' : source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.isEmpty?.() ? null : source.appIcon?.toDataURL?.() ?? null,
    }));
  } catch (error) {
    console.error('desktop-capturer-get-sources failed', error);
    return [];
  }
});

// Native notifications
ipcMain.on('show-notification', async (_event, payload = {}) => {
  try {
    if (!Notification.isSupported()) {
      console.warn('Native notifications are not supported on this platform.');
      return;
    }

    const { title, body, icon, navigationTarget } = payload;
    if (!title) return;

    const notification = new Notification({
      title: String(title),
      body: body ? String(body) : '',
      icon: await getNotificationIcon(icon),
      silent: false,
    });

    notification.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      if (process.platform === 'win32') {
        mainWindow.flashFrame(false);
      }
      mainWindow.webContents.send('notification-clicked', navigationTarget ?? null);
    });

    notification.on('failed', (_failedEvent, error) => {
      console.error('Notification failed to display:', error);
    });

    notification.show();

    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
    }
  } catch (error) {
    console.error('show-notification handler failed:', error);
  }
});

// (custom notification handler removed - reverted to original behavior)
