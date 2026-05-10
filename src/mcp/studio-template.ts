import * as fs from 'fs';
import * as path from 'path';

const templateCache: Record<string, string> = {};

function readTemplateFile(fileName: string): string {
  if (templateCache[fileName]) {
    return templateCache[fileName];
  }

  const distPath = path.resolve(__dirname, fileName);
  const srcPath = path.resolve(__dirname, '../../src/mcp', fileName);
  const filePath = fs.existsSync(distPath) ? distPath : srcPath;
  const content = fs.readFileSync(filePath, 'utf8');
  templateCache[fileName] = content;
  return content;
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => vars[key] ?? '');
}

export function buildStudioHtml(nonce: string, editingId: string): string {
  const html = readTemplateFile('studio-webview.html');
  const css = readTemplateFile('studio-webview.css');
  const js = readTemplateFile('studio-webview.js');

  return render(html, {
    nonce,
    editingId,
    styles: css,
    script: js
  });
}
