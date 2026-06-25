import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { createRequire } from 'module';
import { execFile, spawn, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const fsDisk = require('original-fs');

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCT_NAME = 'SoftSpace';
const APP_EXE = 'SoftSpace.exe';
const VERSION = '0.1.0';
const UNINSTALL_REG_NAME = 'SoftSpace';
const LEGACY_UNINSTALL_REG_NAME = 'com.softspace.app';
const UNINSTALL_KEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${UNINSTALL_REG_NAME}`;
const LEGACY_UNINSTALL_KEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${LEGACY_UNINSTALL_REG_NAME}`;

const isUninstallMode =
  process.argv.includes('--uninstall') || process.argv.includes('/uninstall');

let mainWindow = null;
let lastInstallDir = null;
let lastExePath = null;

if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.softspace.setup' : process.execPath);
}

function readRegistryInstallDir(keyPath) {
  try {
    const output = execFileSync(
      'reg.exe',
      ['query', `HKCU\\${keyPath}`, '/v', 'InstallLocation'],
      { encoding: 'utf8', windowsHide: true }
    );
    const match = output.match(/InstallLocation\s+REG_\w+\s+(.+)/i);
    const value = match?.[1]?.trim();
    return value && fs.existsSync(value) ? value : null;
  } catch {
    return null;
  }
}

function getRegistryInstallDir() {
  if (process.platform !== 'win32') return null;

  const fromRegistry =
    readRegistryInstallDir(UNINSTALL_KEY) || readRegistryInstallDir(LEGACY_UNINSTALL_KEY);
  if (fromRegistry) return fromRegistry;

  const defaultDir = getDefaultInstallDir();
  if (fs.existsSync(path.join(defaultDir, APP_EXE))) {
    return defaultDir;
  }

  return null;
}

function getReleaseConfig() {
  const configPath = path.join(__dirname, '../release-config.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function getLoosePayloadDir() {
  return path.resolve(__dirname, '../../release-buildv3/win-unpacked');
}

function getCachedPayloadZipPath(version) {
  return path.join(app.getPath('temp'), `softspace-app-${version}.zip`);
}

function sendInstallProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install:progress', payload);
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsDisk.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function isZipBuffer(buffer) {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function looksLikeHtml(buffer) {
  const start = buffer.slice(0, 256).toString('utf8').trimStart().toLowerCase();
  return start.startsWith('<!doctype html') || start.startsWith('<html') || start.includes('<head>');
}

async function downloadPayloadZip(url, destPath, expectedSha256, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error('Download fehlgeschlagen (zu viele Weiterleitungen).');
  }

  const tempPath = `${destPath}.part`;
  if (fsDisk.existsSync(tempPath)) {
    fsDisk.unlinkSync(tempPath);
  }

  await new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const protocol = requestUrl.protocol === 'https:' ? https : http;

    const request = protocol.get(
      requestUrl,
      {
        headers: {
          'User-Agent': `SoftSpace-Setup/${VERSION}`,
          Accept: 'application/zip,application/octet-stream,*/*',
        },
      },
      (response) => {
        const status = response.statusCode || 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, requestUrl).href;
          downloadPayloadZip(nextUrl, destPath, expectedSha256, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status !== 200) {
          response.resume();
          reject(
            new Error(
              status === 404
                ? 'Installationsdatei auf dem Server nicht gefunden. Bitte später erneut versuchen.'
                : `Download fehlgeschlagen (HTTP ${status}).`
            )
          );
          return;
        }

        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html')) {
          response.resume();
          reject(
            new Error(
              'Download fehlgeschlagen: Server liefert die Webseite statt der Installationsdatei.'
            )
          );
          return;
        }

        const totalBytes = Number(response.headers['content-length'] || 0);
        let downloaded = 0;
        let validated = false;
        const fileStream = fsDisk.createWriteStream(tempPath);

        response.on('data', (chunk) => {
          if (!validated) {
            validated = true;
            if (looksLikeHtml(chunk)) {
              fileStream.destroy();
              response.destroy();
              reject(
                new Error(
                  'Download fehlgeschlagen: Server liefert die Webseite statt der Installationsdatei.'
                )
              );
              return;
            }
            if (!isZipBuffer(chunk)) {
              fileStream.destroy();
              response.destroy();
              reject(new Error('Download fehlgeschlagen: Datei ist keine gültige ZIP-Datei.'));
              return;
            }
          }

          downloaded += chunk.length;
          sendInstallProgress({
            done: downloaded,
            total: totalBytes || Math.max(downloaded, 1),
            file: 'SoftSpace wird heruntergeladen…',
            phase: 'download',
            bytesDone: downloaded,
            bytesTotal: totalBytes || null,
          });
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => resolve());
        });

        fileStream.on('error', (error) => {
          reject(error);
        });
      }
    );

    request.on('error', (error) => {
      reject(new Error(`Keine Internetverbindung oder Server nicht erreichbar (${error.message}).`));
    });

    request.setTimeout(120_000, () => {
      request.destroy(new Error('Download-Zeitlimit überschritten.'));
    });
  });

  if (!isZipBuffer(fsDisk.readFileSync(tempPath).slice(0, 2))) {
    fsDisk.unlinkSync(tempPath);
    throw new Error('Download fehlgeschlagen: Datei ist keine gültige ZIP-Datei.');
  }

  if (expectedSha256) {
    const hash = await sha256File(tempPath);
    if (hash !== expectedSha256.toLowerCase()) {
      fsDisk.unlinkSync(tempPath);
      throw new Error(
        'Download ungültig (Prüfsumme stimmt nicht). Der Server hat evtl. noch nicht die neueste Version.'
      );
    }
  }

  if (fsDisk.existsSync(destPath)) {
    fsDisk.unlinkSync(destPath);
  }

  fsDisk.renameSync(tempPath, destPath);
}

async function ensurePayloadZip(config) {
  const zipPath = getCachedPayloadZipPath(config.version);

  if (fsDisk.existsSync(zipPath)) {
    if (!config.sha256) {
      return zipPath;
    }

    try {
      const hash = await sha256File(zipPath);
      if (hash === config.sha256.toLowerCase()) {
        return zipPath;
      }
    } catch {
      // re-download below
    }

    fsDisk.unlinkSync(zipPath);
  }

  if (!config.payloadUrl) {
    throw new Error('Keine Download-URL konfiguriert.');
  }

  await downloadPayloadZip(config.payloadUrl, zipPath, config.sha256);
  return zipPath;
}

async function extractPayloadZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const script = `Expand-Archive -LiteralPath '${psEscape(zipPath)}' -DestinationPath '${psEscape(destDir)}' -Force`;
  await runPowerShell(script);
}

async function resolvePayloadDir() {
  if (!app.isPackaged) {
    const localDir = getLoosePayloadDir();
    if (fsDisk.existsSync(path.join(localDir, APP_EXE))) {
      return localDir;
    }
  }

  const config = getReleaseConfig();
  if (!config?.payloadUrl) {
    throw new Error('Release-Konfiguration fehlt. Bitte Setup neu bauen.');
  }

  sendInstallProgress({
    done: 0,
    total: 1,
    file: 'Verbindung zum Server…',
    phase: 'download',
  });

  const zipPath = await ensurePayloadZip(config);
  const extractDir = path.join(app.getPath('temp'), `softspace-payload-${config.version}`);

  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  sendInstallProgress({
    done: 0,
    total: 1,
    file: 'App-Paket wird entpackt…',
    phase: 'extract',
  });

  await extractPayloadZip(zipPath, extractDir);
  return extractDir;
}

function getInstallerSourcePath() {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portableExe && fsDisk.existsSync(portableExe)) {
    return portableExe;
  }

  return process.execPath;
}

function getDefaultInstallDir() {
  const base = process.env.LOCALAPPDATA || app.getPath('home');
  return path.join(base, 'Programs', PRODUCT_NAME);
}

function shouldCopyEntry(entryName) {
  return entryName !== 'node_modules';
}

function listFilesRecursive(rootDir) {
  const files = [];

  function walk(currentDir) {
    for (const name of fsDisk.readdirSync(currentDir)) {
      if (!shouldCopyEntry(name)) continue;

      const fullPath = path.join(currentDir, name);
      const stat = fsDisk.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        files.push(fullPath);
      }
    }
  }

  if (fsDisk.existsSync(rootDir)) {
    walk(rootDir);
  }

  return files;
}

async function copyDirWithProgress(sourceDir, targetDir, eventName) {
  const files = listFilesRecursive(sourceDir);
  if (files.length === 0) {
    throw new Error(`Keine Installationsdateien in ${sourceDir} gefunden.`);
  }

  const total = files.length;
  let done = 0;

  const send = (file) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(eventName, { done, total, file, phase: 'install' });
    }
  };

  fsDisk.mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    const relative = path.relative(sourceDir, file);
    const destination = path.join(targetDir, relative);

    try {
      fsDisk.mkdirSync(path.dirname(destination), { recursive: true });
      fsDisk.copyFileSync(file, destination);
    } catch (error) {
      throw new Error(`Kopieren fehlgeschlagen: ${relative} (${error.message})`);
    }

    done += 1;
    send(relative);
  }

  return { done, total };
}

async function runPowerShell(script) {
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
  );
}

async function createShortcut({
  shortcutPath,
  targetPath,
  workingDir,
  description,
  arguments: shortcutArgs = '',
}) {
  const escaped = (value) => value.replace(/'/g, "''");
  const script = `
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut('${escaped(shortcutPath)}')
$shortcut.TargetPath = '${escaped(targetPath)}'
$shortcut.WorkingDirectory = '${escaped(workingDir)}'
$shortcut.Description = '${escaped(description)}'
$shortcut.Arguments = '${escaped(shortcutArgs)}'
$shortcut.Save()
`.trim();

  await runPowerShell(script);
}

async function removeShortcutIfExists(shortcutPath) {
  if (fs.existsSync(shortcutPath)) {
    fs.unlinkSync(shortcutPath);
  }
}

function psEscape(value) {
  return value.replace(/'/g, "''");
}

async function createUninstaller(installDir) {
  const uninstallerPath = path.join(installDir, 'Uninstall SoftSpace.exe');

  if (fsDisk.existsSync(uninstallerPath)) {
    fsDisk.unlinkSync(uninstallerPath);
  }

  try {
    fsDisk.copyFileSync(getInstallerSourcePath(), uninstallerPath);
  } catch {
    await execFileAsync(
      'cmd.exe',
      ['/c', 'copy', '/Y', getInstallerSourcePath(), uninstallerPath],
      { windowsHide: true }
    );
  }

  if (!fsDisk.existsSync(uninstallerPath)) {
    throw new Error('Deinstaller konnte nicht erstellt werden.');
  }

  return uninstallerPath;
}

async function writeUninstallRegistry(installDir, exePath, uninstallerPath) {
  if (process.platform !== 'win32') return;

  let estimatedSizeKb = 0;
  try {
    for (const file of listFilesRecursive(installDir)) {
      estimatedSizeKb += fsDisk.statSync(file).size;
    }
    estimatedSizeKb = Math.ceil(estimatedSizeKb / 1024);
  } catch {
    estimatedSizeKb = 0;
  }

  const uninstallCmd = `"${uninstallerPath}" --uninstall`;
  const regKey = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${UNINSTALL_REG_NAME}`;

  const script = `
$Key = '${regKey}'
New-Item -Path $Key -Force | Out-Null
Set-ItemProperty -Path $Key -Name DisplayName -Value '${psEscape(PRODUCT_NAME)}'
Set-ItemProperty -Path $Key -Name DisplayVersion -Value '${VERSION}'
Set-ItemProperty -Path $Key -Name Publisher -Value 'Jamie'
Set-ItemProperty -Path $Key -Name InstallLocation -Value '${psEscape(installDir)}'
Set-ItemProperty -Path $Key -Name DisplayIcon -Value '${psEscape(exePath)}'
Set-ItemProperty -Path $Key -Name UninstallString -Value '${psEscape(uninstallCmd)}'
Set-ItemProperty -Path $Key -Name QuietUninstallString -Value '${psEscape(uninstallCmd)}'
Set-ItemProperty -Path $Key -Name EstimatedSize -Value ${estimatedSizeKb} -Type DWord
Set-ItemProperty -Path $Key -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $Key -Name NoRepair -Value 1 -Type DWord
`.trim();

  await runPowerShell(script);
}

async function removeUninstallRegistry() {
  if (process.platform !== 'win32') return;

  for (const keyPath of [UNINSTALL_KEY, LEGACY_UNINSTALL_KEY]) {
    try {
      await execFileAsync('reg.exe', ['delete', `HKCU\\${keyPath}`, '/f'], {
        windowsHide: true,
      });
    } catch {
      // ignore missing key
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 640,
    minHeight: 480,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: true,
    frame: false,
    backgroundColor: '#0b1516',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../../build/icon.ico'),
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('installer:get-mode', () => (isUninstallMode ? 'uninstall' : 'install'));

ipcMain.handle('installer:get-release-info', () => {
  const config = getReleaseConfig();
  return {
    version: config?.version || VERSION,
    requiresInternet: app.isPackaged,
  };
});

ipcMain.handle('installer:get-default-install-dir', () => getDefaultInstallDir());

ipcMain.handle('installer:get-installed-info', () => {
  const installDir = getRegistryInstallDir();
  if (!installDir) return null;
  return { installDir, version: VERSION };
});

ipcMain.handle('installer:pick-install-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Installationsordner wählen',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: getDefaultInstallDir(),
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return path.join(result.filePaths[0], PRODUCT_NAME);
});

ipcMain.handle('installer:install', async (_event, options) => {
  const installDir = path.resolve(options.installDir);
  const exePath = path.join(installDir, APP_EXE);

  if (fs.existsSync(installDir)) {
    const existing = fs.readdirSync(installDir);
    if (existing.length > 0) {
      const overwrite = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Überschreiben', 'Abbrechen'],
        defaultId: 0,
        cancelId: 1,
        title: PRODUCT_NAME,
        message: 'Ordner existiert bereits',
        detail: `${installDir}\n\nVorhandene Dateien werden aktualisiert.`,
      });
      if (overwrite.response !== 0) {
        throw new Error('Installation abgebrochen.');
      }
    }
  }

  const payloadDir = await resolvePayloadDir();
  const payloadExe = path.join(payloadDir, APP_EXE);

  if (!fsDisk.existsSync(payloadExe)) {
    throw new Error(
      `App-Paket nicht gefunden (${payloadExe}). Bitte Setup-Datei erneut herunterladen.`
    );
  }

  await copyDirWithProgress(payloadDir, installDir, 'install:progress');

  const uninstallerPath = await createUninstaller(installDir);

  if (options.desktopShortcut) {
    const desktop = app.getPath('desktop');
    await createShortcut({
      shortcutPath: path.join(desktop, `${PRODUCT_NAME}.lnk`),
      targetPath: exePath,
      workingDir: installDir,
      description: PRODUCT_NAME,
    });
  }

  if (options.startMenuShortcut) {
    const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const menuDir = path.join(startMenu, PRODUCT_NAME);
    fs.mkdirSync(menuDir, { recursive: true });
    await createShortcut({
      shortcutPath: path.join(menuDir, `${PRODUCT_NAME}.lnk`),
      targetPath: exePath,
      workingDir: installDir,
      description: PRODUCT_NAME,
    });
    await createShortcut({
      shortcutPath: path.join(menuDir, 'SoftSpace deinstallieren.lnk'),
      targetPath: uninstallerPath,
      workingDir: installDir,
      description: 'SoftSpace deinstallieren',
      arguments: '--uninstall',
    });
  }

  await writeUninstallRegistry(installDir, exePath, uninstallerPath);

  lastInstallDir = installDir;
  lastExePath = exePath;

  return { installDir, exePath };
});

ipcMain.handle('installer:uninstall', async () => {
  const installDir = getRegistryInstallDir();
  if (!installDir) {
    throw new Error('Keine SoftSpace-Installation gefunden.');
  }

  const files = listFilesRecursive(installDir);
  const total = Math.max(files.length + 4, 1);
  let done = 0;

  const send = (file) => {
    done += 1;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('uninstall:progress', { done, total, file });
    }
  };

  send('Verknüpfungen entfernen…');
  const desktop = app.getPath('desktop');
  await removeShortcutIfExists(path.join(desktop, `${PRODUCT_NAME}.lnk`));

  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', PRODUCT_NAME);
  await removeShortcutIfExists(path.join(startMenu, `${PRODUCT_NAME}.lnk`));
  await removeShortcutIfExists(path.join(startMenu, 'SoftSpace deinstallieren.lnk'));
  if (fs.existsSync(startMenu)) {
    fs.rmSync(startMenu, { recursive: true, force: true });
  }

  send('Registry bereinigen…');
  await removeUninstallRegistry();

  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch {
      // file may be locked
    }
    send(path.relative(installDir, file));
  }

  send('Ordner entfernen…');
  try {
    fs.rmSync(installDir, { recursive: true, force: true });
  } catch {
    throw new Error('Installationsordner konnte nicht vollständig gelöscht werden.');
  }
});

ipcMain.handle('installer:launch-app', async () => {
  const exePath =
    lastExePath ||
    (lastInstallDir ? path.join(lastInstallDir, APP_EXE) : path.join(getDefaultInstallDir(), APP_EXE));

  if (!fs.existsSync(exePath)) {
    throw new Error('SoftSpace.exe wurde nicht gefunden.');
  }

  spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(exePath),
  }).unref();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.on('window-min', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
