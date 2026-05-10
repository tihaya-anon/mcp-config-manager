const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const src = path.join(root, 'resources', 'brand.svg');
  const out = path.join(root, 'resources', 'icon.png');

  if (!fs.existsSync(src)) {
    throw new Error(`Missing source SVG: ${src}`);
  }

  await sharp(src)
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);

  console.log('Generated icon:', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
