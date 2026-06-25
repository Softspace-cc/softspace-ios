const fs = require('fs');
const path = require('path');
const sharp = require('../client/node_modules/sharp');

const ASSETS_DIR = path.join(__dirname, 'assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR);
}

// 1. Icon Foreground SVG: A rounded teal card with a white heart, centered
const iconForegroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Safe zone for adaptive icon foreground is the center 66% (approx 16x16 units in 24x24 viewbox) -->
  <rect x="4" y="4" width="16" height="16" rx="4" fill="#2c847f" />
  <path d="M16.5 11c.75-.73 1.5-1.6 1.5-2.75A2.75 2.75 0 0 0 15.25 5.5c-.88 0-1.5.25-2.25 1-.75-.75-1.37-1-2.25-1A2.75 2.75 0 0 0 8 8.25c0 1.15.75 2.02 1.5 2.75l2.5 2.5Z" fill="none" stroke="#ffffff" stroke-width="1.0" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

// 2. Icon Background SVG: A solid color matching bg-softspace-950 (#0b1516)
const iconBackgroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0b1516" />
</svg>
`;

// 3. Splash Screen SVG: Deep dark background with a larger version of the app logo in the center
const splashSvg = `
<svg width="2732" height="2732" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#0b1516" />
  <!-- Centered Logo Card -->
  <rect x="35" y="35" width="30" height="30" rx="7" fill="#2c847f" />
  <!-- Heart Icon inside card -->
  <path d="M58.5 48c1.1-.98 2.2-2.15 2.2-3.7A3.7 3.7 0 0 0 57 40.5c-1.2 0-2 .35-3 1.35-1-1-1.8-1.35-3-1.35A3.7 3.7 0 0 0 47.3 44.2c0 1.55 1.1 2.72 2.2 3.7l4.5 4.5Z" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

async function main() {
  console.log('Generating high-res assets...');
  
  // Icon Foreground
  await sharp(Buffer.from(iconForegroundSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon-foreground.png'));
  console.log('Generated icon-foreground.png');

  // Icon Background
  await sharp(Buffer.from(iconBackgroundSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon-background.png'));
  console.log('Generated icon-background.png');

  // Icon Only (Standard non-adaptive icon)
  // Let's make it a rounded teal card with white heart on transparent bg, or flat icon
  const iconOnlySvg = `
  <svg width="1024" height="1024" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="#2c847f" />
    <path d="M17.5 13c1.0-.98 2.0-2.15 2.0-3.7A3.7 3.7 0 0 0 15.8 5.5c-1.2 0-2 .35-3 1.35-1-1-1.8-1.35-3-1.35A3.7 3.7 0 0 0 6.1 9.2c0 1.55 1.0 2.72 2.0 3.7l3.9 3.9Z" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  `;
  await sharp(Buffer.from(iconOnlySvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('Generated icon.png');

  // Splash Screens
  await sharp(Buffer.from(splashSvg))
    .resize(2732, 2732)
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash.png'));
  console.log('Generated splash.png');

  await sharp(Buffer.from(splashSvg))
    .resize(2732, 2732)
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash-dark.png'));
  console.log('Generated splash-dark.png');
  
  console.log('All assets generated successfully!');
}

main().catch(console.error);
