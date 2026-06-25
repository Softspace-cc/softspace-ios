const fs = require('fs');
const sharp = require('sharp');

async function convert() {
  const svg = fs.readFileSync('public/heart.svg');
  await sharp(svg)
    .resize(256, 256)
    .png()
    .toFile('public/icon.png');
    
  // electron-builder uses build/icon.png by default
  if (!fs.existsSync('build')) {
    fs.mkdirSync('build');
  }
  await sharp(svg)
    .resize(256, 256)
    .png()
    .toFile('build/icon.png');
    
  console.log('Icons generated successfully.');
}

convert().catch(console.error);
