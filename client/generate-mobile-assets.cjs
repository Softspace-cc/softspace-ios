const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ANDROID_ASSETS_DIR = path.join(__dirname, '..', 'android app', 'assets');
const IOS_ASSETS_DIR = path.join(__dirname, '..', 'ios app', 'assets');

[ANDROID_ASSETS_DIR, IOS_ASSETS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 1. Icon Foreground SVG: White heart in the center
const iconForegroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="#ffffff" transform="translate(12, 12) scale(0.65) translate(-12,-12)" />
</svg>
`;

// 2. Icon Background SVG: A solid color matching bg-softspace-950 (#0b1516)
const iconBackgroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0b1516" />
</svg>
`;

// 3. Splash Screen SVG: Deep dark background with a larger white heart in the center
const splashSvg = `
<svg width="2732" height="2732" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#0b1516" />
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="#ffffff" transform="translate(50, 50) scale(1.5) translate(-12,-12)" />
</svg>
`;

async function main() {
  console.log('Generating high-res assets...');
  
  const targets = [ANDROID_ASSETS_DIR, IOS_ASSETS_DIR];

  for (const dir of targets) {
    // Icon Foreground
    await sharp(Buffer.from(iconForegroundSvg))
      .resize(1024, 1024)
      .png()
      .toFile(path.join(dir, 'icon-foreground.png'));
    console.log(`Generated icon-foreground.png in ${path.basename(path.dirname(dir))}`);

    // Icon Background
    await sharp(Buffer.from(iconBackgroundSvg))
      .resize(1024, 1024)
      .png()
      .toFile(path.join(dir, 'icon-background.png'));
    console.log(`Generated icon-background.png in ${path.basename(path.dirname(dir))}`);

    // Icon Only (Standard non-adaptive icon with dark background)
    const iconOnlySvg = `
    <svg width="1024" height="1024" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.3" fill="#0b1516" />
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="#ffffff" transform="translate(12, 12) scale(0.65) translate(-12,-12)" />
    </svg>
    `;
    await sharp(Buffer.from(iconOnlySvg))
      .resize(1024, 1024)
      .png()
      .toFile(path.join(dir, 'icon.png'));
    console.log(`Generated icon.png in ${path.basename(path.dirname(dir))}`);

    // Splash Screens
    await sharp(Buffer.from(splashSvg))
      .resize(2732, 2732)
      .png()
      .toFile(path.join(dir, 'splash.png'));
    console.log(`Generated splash.png in ${path.basename(path.dirname(dir))}`);

    await sharp(Buffer.from(splashSvg))
      .resize(2732, 2732)
      .png()
      .toFile(path.join(dir, 'splash-dark.png'));
    console.log(`Generated splash-dark.png in ${path.basename(path.dirname(dir))}`);
  }
  
  console.log('All assets generated successfully!');
}

main().catch(console.error);
