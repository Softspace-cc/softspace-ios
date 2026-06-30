/**
 * Builds SoftSpace release:
 * 1. Main app → win-unpacked (relative asset paths for Electron)
 * 2. Compressed app payload → upload to server (SoftSpace-x.y.z.zip)
 * 3. Small portable Setup EXE → downloads payload on install (Internet required)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const clientDir = path.join(__dirname, '..');
const installerDir = path.join(clientDir, 'installer');
const releaseDir = path.join(clientDir, 'release-buildv3');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const serverReleasesDir = path.join(clientDir, '..', 'server', 'releases', 'windows');

const version = require(path.join(clientDir, 'package.json')).version;
const payloadFileName = `SoftSpace-${version}.zip`;
const payloadZip = path.join(releaseDir, payloadFileName);
const releaseConfigPath = path.join(installerDir, 'release-config.json');
const setupExe = path.join(releaseDir, 'installer', `SoftSpace-Setup-${version}.exe`);

const buildTmp = path.join(process.env.LOCALAPPDATA || 'C:\\Temp', 'softspace-build-tmp');
fs.mkdirSync(buildTmp, { recursive: true });

const buildEnv = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  TEMP: buildTmp,
  TMP: buildTmp,
};

const releaseBaseUrl =
  process.env.SOFTSPACE_RELEASE_URL || 'https://softspace.cc/api/releases/windows';

function run(command, cwd) {
  console.log(`\n> ${command}\n`);
  execSync(command, { cwd, stdio: 'inherit', env: buildEnv });
}

function psEscape(value) {
  return value.replace(/'/g, "''");
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1024)} KB`;
}

function trimPayload(dir) {
  const localesDir = path.join(dir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  for (const file of fs.readdirSync(localesDir)) {
    if (!['de.pak', 'en-US.pak'].includes(file)) {
      fs.unlinkSync(path.join(localesDir, file));
    }
  }
}

function createPayloadZip(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const source = psEscape(sourceDir);
  const destination = psEscape(zipPath);
  const script = `Compress-Archive -Path '${source}\\*' -DestinationPath '${destination}' -CompressionLevel Optimal`;

  console.log('\nCompressing app payload…\n');
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, {
    stdio: 'inherit',
    env: buildEnv,
  });
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha512File(filePath) {
  return crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('hex');
}

function writeReleaseConfig() {
  const payloadUrl = `${releaseBaseUrl.replace(/\/$/, '')}/${payloadFileName}`;
  const sha256 = sha256File(payloadZip);
  const config = { version, payloadUrl, payloadFileName, sha256 };

  fs.writeFileSync(releaseConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Release config → ${releaseConfigPath}`);
  console.log(`Download URL   → ${payloadUrl}`);

  return config;
}

function publishReleaseAssets() {
  fs.mkdirSync(serverReleasesDir, { recursive: true });
  
  // Copy payload zip
  const targetZip = path.join(serverReleasesDir, payloadFileName);
  fs.copyFileSync(payloadZip, targetZip);
  console.log(`Server payload ZIP → ${targetZip}`);
  
  // Copy Setup EXE
  const targetSetup = path.join(serverReleasesDir, `SoftSpace-Setup-${version}.exe`);
  fs.copyFileSync(setupExe, targetSetup);
  console.log(`Server Setup EXE   → ${targetSetup}`);
}

function writeLatestYml() {
  const stats = fs.statSync(setupExe);
  const sha512 = sha512File(setupExe);
  const size = stats.size;
  const releaseDate = new Date().toISOString();

  let notesContent = '';
  const notesFile = path.join(clientDir, 'release-notes.md');
  if (fs.existsSync(notesFile)) {
    const rawNotes = fs.readFileSync(notesFile, 'utf8').trim();
    if (rawNotes) {
      const formattedNotes = rawNotes
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
      notesContent = `\nreleaseNotes: |\n${formattedNotes}`;
    }
  }

  const ymlContent = `version: ${version}
files:
  - url: SoftSpace-Setup-${version}.exe
    sha512: ${sha512}
    size: ${size}
path: SoftSpace-Setup-${version}.exe
sha512: ${sha512}
releaseDate: ${releaseDate}${notesContent}
`;

  const ymlPath = path.join(releaseDir, 'latest.yml');
  fs.writeFileSync(ymlPath, ymlContent);
  console.log(`latest.yml → ${ymlPath}`);

  // Also copy to server releases directory
  const serverYmlPath = path.join(serverReleasesDir, 'latest.yml');
  fs.writeFileSync(serverYmlPath, ymlContent);
  console.log(`Server latest.yml → ${serverYmlPath}`);
}


function verifyElectronBuild() {
  const payloadExe = path.join(unpackedDir, 'SoftSpace.exe');
  if (!fs.existsSync(payloadExe)) {
    throw new Error(`Missing app build at ${payloadExe}`);
  }

  const indexHtml = path.join(clientDir, 'dist', 'index.html');
  const html = fs.readFileSync(indexHtml, 'utf8');
  if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
    throw new Error('Electron build has absolute asset paths — run build:electron with --base=./');
  }

  console.log(`App payload ready → ${unpackedDir}`);
}

function writeAppUpdateYml() {
  const resourcesDir = path.join(unpackedDir, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  const ymlContent = `provider: generic
url: ${releaseBaseUrl}
updaterCacheDirName: softspace-updater
`;
  const ymlPath = path.join(resourcesDir, 'app-update.yml');
  fs.writeFileSync(ymlPath, ymlContent);
  console.log(`app-update.yml → ${ymlPath}`);
}

console.log('=== SoftSpace release build ===');

run('npm run build:electron', clientDir);
run('npx electron-builder --win dir', clientDir);
verifyElectronBuild();
writeAppUpdateYml();
trimPayload(unpackedDir);
createPayloadZip(unpackedDir, payloadZip);
console.log(`Payload zip → ${payloadZip} (${formatSize(fs.statSync(payloadZip).size)})`);

writeReleaseConfig();

// Sync version to installer package.json to avoid build name mismatch
const installerPackageJsonPath = path.join(installerDir, 'package.json');
const installerPackageJson = JSON.parse(fs.readFileSync(installerPackageJsonPath, 'utf8'));
installerPackageJson.version = version;
fs.writeFileSync(installerPackageJsonPath, JSON.stringify(installerPackageJson, null, 2) + '\n');
console.log(`Synced version ${version} to installer package.json`);

console.log('\nBuilding small portable Setup EXE (ca. 1–3 Min.)…\n');
run('npm run electron:build', installerDir);

if (!fs.existsSync(setupExe)) {
  throw new Error(`Installer exe not found at ${setupExe}`);
}

publishReleaseAssets();
writeLatestYml();

console.log('\nDone.');
console.log(`Weitergeben: ${setupExe} (${formatSize(fs.statSync(setupExe).size)})`);
console.log(`Auf Server deployen: server/releases/windows/${payloadFileName} und SoftSpace-Setup-${version}.exe`);
