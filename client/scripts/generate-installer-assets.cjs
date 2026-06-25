/**
 * Generates branded BMP assets for the SoftSpace NSIS installer / uninstaller.
 * NSIS MUI requires uncompressed 24-bit BMP files.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BUILD_DIR = path.join(__dirname, '..', 'build');

const COLORS = {
  bgDeep: '#0b1516',
  bgPanel: '#121f20',
  accent: '#2c847f',
  accentLight: '#3f9b96',
  danger: '#b85c5c',
  text: '#e2eded',
  textMuted: '#9bbfbe',
};

const HEART_PATH =
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';

function encodeBmp24(rgbaBuffer, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);

  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelDataSize, 34);

  let offset = 54;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      buffer[offset++] = rgbaBuffer[i + 2];
      buffer[offset++] = rgbaBuffer[i + 1];
      buffer[offset++] = rgbaBuffer[i];
    }
    offset += rowSize - width * 3;
  }

  return buffer;
}

async function svgToBmp(svg, width, height, outPath) {
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  fs.writeFileSync(outPath, encodeBmp24(data, info.width, info.height));
}

function sidebarSvg({ subtitle, accent, accentLight }) {
  return `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLORS.bgDeep}"/>
      <stop offset="55%" stop-color="${COLORS.bgPanel}"/>
      <stop offset="100%" stop-color="${COLORS.bgDeep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="45%">
      <stop offset="0%" stop-color="${accentLight}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${accentLight}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <rect width="164" height="314" fill="url(#glow)"/>
  <rect width="5" height="314" fill="${accent}"/>
  <circle cx="82" cy="98" r="34" fill="${COLORS.bgPanel}" stroke="${accent}" stroke-width="1.5" opacity="0.95"/>
  <path d="${HEART_PATH}" transform="translate(58, 74) scale(2.05)"
    fill="none" stroke="${accentLight}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="82" y="162" text-anchor="middle" fill="${COLORS.text}"
    font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">SoftSpace</text>
  <text x="82" y="182" text-anchor="middle" fill="${COLORS.textMuted}"
    font-family="Segoe UI, Arial, sans-serif" font-size="10.5">${subtitle}</text>
  <rect x="36" y="198" width="92" height="2" rx="1" fill="${accent}" opacity="0.75"/>
  <text x="82" y="286" text-anchor="middle" fill="${COLORS.textMuted}"
    font-family="Segoe UI, Arial, sans-serif" font-size="8.5" opacity="0.85">softspace.cc</text>
</svg>`;
}

function headerSvg({ title, accent }) {
  return `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COLORS.bgPanel}"/>
      <stop offset="100%" stop-color="${COLORS.bgDeep}"/>
    </linearGradient>
  </defs>
  <rect width="150" height="57" fill="url(#hdr)"/>
  <rect width="150" height="2" y="55" fill="${accent}"/>
  <path d="${HEART_PATH}" transform="translate(10, 15) scale(1.15)"
    fill="none" stroke="${COLORS.accentLight}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="46" y="24" fill="${COLORS.text}"
    font-family="Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700">${title}</text>
  <text x="46" y="40" fill="${COLORS.textMuted}"
    font-family="Segoe UI, Arial, sans-serif" font-size="9">Open source · No ads · No tracking</text>
</svg>`;
}

async function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  await svgToBmp(
    sidebarSvg({
      subtitle: 'Chat für Communities',
      accent: COLORS.accent,
      accentLight: COLORS.accentLight,
    }),
    164,
    314,
    path.join(BUILD_DIR, 'installerSidebar.bmp')
  );

  await svgToBmp(
    sidebarSvg({
      subtitle: 'Deinstallation',
      accent: COLORS.danger,
      accentLight: '#d48484',
    }),
    164,
    314,
    path.join(BUILD_DIR, 'uninstallerSidebar.bmp')
  );

  await svgToBmp(
    headerSvg({ title: 'SoftSpace Setup', accent: COLORS.accent }),
    150,
    57,
    path.join(BUILD_DIR, 'installerHeader.bmp')
  );

  await svgToBmp(
    headerSvg({ title: 'SoftSpace entfernen', accent: COLORS.danger }),
    150,
    57,
    path.join(BUILD_DIR, 'uninstallerHeader.bmp')
  );

  console.log('Installer BMP assets generated in build/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
