/**
 * Generate Astellr app icon — two vertical bars on white background.
 * Matches the ElevenLabs-style symbol from elevenlabs-symbol.svg.
 *
 * Usage: node tools/generate-app-icon.js
 */
const sharp = require('sharp');
const path = require('path');

const SIZE = 1024;

// The SVG: two black vertical bars centered on a white square
// Based on the elevenlabs-symbol.svg viewBox 0 0 876 876
// Scaled proportionally to 1024x1024
const svgIcon = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" fill="white"/>
  <rect x="408" y="342" width="70" height="340" rx="6" fill="black"/>
  <rect x="546" y="342" width="70" height="340" rx="6" fill="black"/>
</svg>
`;

// Dark variant — white bars on dark background
const svgIconDark = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e"/>
  <rect x="408" y="342" width="70" height="340" rx="6" fill="white"/>
  <rect x="546" y="342" width="70" height="340" rx="6" fill="white"/>
</svg>
`;

const outputDir = path.join(
  __dirname,
  '../ios/SuperWallet/Images.xcassets/AppIcon.appiconset',
);

async function main() {
  // Light icon (1024.png)
  await sharp(Buffer.from(svgIcon))
    .resize(SIZE, SIZE)
    .png()
    .toFile(path.join(outputDir, '1024.png'));
  console.log('✅ Generated 1024.png (light)');

  // Dark icon (1024-dark.png)
  await sharp(Buffer.from(svgIconDark))
    .resize(SIZE, SIZE)
    .png()
    .toFile(path.join(outputDir, '1024-dark.png'));
  console.log('✅ Generated 1024-dark.png (dark)');

  // Tinted icon (same as dark for now)
  await sharp(Buffer.from(svgIconDark))
    .resize(SIZE, SIZE)
    .png()
    .toFile(path.join(outputDir, '1024-tint.png'));
  console.log('✅ Generated 1024-tint.png (tinted)');

  console.log('\n🎉 App icons generated! Rebuild with: npx react-native run-ios');
}

main().catch(console.error);
