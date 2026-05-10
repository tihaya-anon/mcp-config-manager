const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'mcp');
const outDir = path.join(root, 'out', 'mcp');

const files = ['studio-webview.html', 'studio-webview.css', 'studio-webview.js'];

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
}

console.log('Copied webview assets to out/mcp');
