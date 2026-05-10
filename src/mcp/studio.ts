import * as vscode from 'vscode';
import { buildPreviewText } from './exporter';
import { parseServerPayload } from './serialization';
import { McpStore } from './store';
import { ExportTarget } from './types';
import { ServerProvider } from './tree';

export function createStudioController(
  store: McpStore,
  serverProvider: ServerProvider
): { openStudioPanel: (editingId?: string) => void } {
  let studioPanel: vscode.WebviewPanel | undefined;

  const openStudioPanel = (editingId?: string): void => {
    if (!studioPanel) {
      studioPanel = vscode.window.createWebviewPanel(
        'mcpStudio',
        'MCP Studio',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      studioPanel.onDidDispose(() => {
        studioPanel = undefined;
      });

      studioPanel.webview.onDidReceiveMessage(async (msg: { type: string; [key: string]: unknown }) => {
        if (msg.type === 'requestData') {
          studioPanel?.webview.postMessage({
            type: 'data',
            servers: store.list(),
            editingId: msg.editingId ?? null
          });
          return;
        }

        if (msg.type === 'save') {
          const parsed = parseServerPayload(msg.payload);

          if (!parsed.ok) {
            void vscode.window.showErrorMessage(parsed.error);
            return;
          }

          await store.upsert(parsed.server);
          serverProvider.refresh();
          studioPanel?.webview.postMessage({ type: 'saved', id: parsed.server.id });
          return;
        }

        if (msg.type === 'preview') {
          const target = msg.target === 'codex' ? 'codex' : 'claude-code';
          const preview = buildPreviewText(store.list(), target);
          studioPanel?.webview.postMessage({ type: 'previewResult', text: preview });
        }
      });
    }

    studioPanel.reveal(vscode.ViewColumn.One);
    studioPanel.webview.html = getStudioHtml(editingId);
  };

  return { openStudioPanel };
}

function getStudioHtml(editingId?: string): string {
  const nonce = String(Date.now());

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MCP Studio</title>
<style>
body{font-family:var(--vscode-font-family);padding:16px;max-width:960px;margin:0 auto}
.grid{display:grid;grid-template-columns:1fr;gap:12px}
label{display:block;font-size:12px;margin-bottom:6px}
input,select,textarea,button{width:100%;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;transition:border-color .15s ease, box-shadow .15s ease, background-color .15s ease}
input,select,textarea{padding:8px;appearance:none;-webkit-appearance:none}
input:hover,select:hover,textarea:hover{border-color:var(--vscode-focusBorder)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--vscode-focusBorder);box-shadow:0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent)}
button{cursor:pointer;padding:10px 16px}
button:hover{border-color:var(--vscode-focusBorder)}
button:active{transform:translateY(1px)}
textarea{min-height:92px}
.row{margin-bottom:12px}
.actions{display:flex;gap:10px}
.actions button{width:auto}
#preview{white-space:pre-wrap;background:var(--vscode-editor-background);padding:12px;border:1px solid var(--vscode-panel-border);min-height:180px;border-radius:8px}
.card{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:14px}
.hidden{display:none}
.topbar{display:grid;grid-template-columns:2fr 1fr auto;gap:12px;margin-bottom:12px;align-items:end}
.toggle-btn{min-width:140px}
.toggle-on{border-color:#2e7d32;color:#2e7d32}
.toggle-off{border-color:#b71c1c;color:#b71c1c}
</style>
</head>
<body>
<h2>MCP Studio</h2>
<div class="row"><label>Existing Servers</label><select id="existing"></select></div>
<div class="topbar">
<div class="row"><label>Name</label><input id="name" /></div>
<div class="row"><label>Type</label><select id="type"><option value="http">http</option><option value="stream">stream</option><option value="uvx-fastmcp">uvx fastmcp</option></select></div>
<div class="row"><label>Enabled</label><button id="enabledToggle" class="toggle-btn" type="button">Enabled: On</button></div>
</div>
<div class="row"><label>Group</label><input id="group" placeholder="default" /></div>
<div class="grid">
<div id="httpCard" class="card">
<h4>HTTP</h4>
<div class="row"><label>ID (editing)</label><input id="id" /></div>
<div class="row"><label>Description</label><input id="description" /></div>
<div class="row"><label>HTTP URL</label><input id="httpUrl" placeholder="https://example.com/mcp" /></div>
<div class="row"><label>HTTP Headers JSON</label><textarea id="httpHeaders"></textarea></div>
</div>
<div id="runtimeCard" class="card">
<h4>Runtime</h4>
<div class="row"><label>ID (editing)</label><input id="idRuntime" /></div>
<div class="row"><label>Description</label><input id="descriptionRuntime" /></div>
<div class="row"><label>Command (stream)</label><input id="command" placeholder="node" /></div>
<div class="row"><label>Module (uvx fastmcp)</label><input id="module" placeholder="my_server.main:app" /></div>
<div class="row"><label>Args (space separated)</label><input id="args" /></div>
<div class="row"><label>Env JSON</label><textarea id="env"></textarea></div>
</div>
</div>
<div class="actions row">
<button id="save" type="button">Save Server</button>
<button id="new" type="button">New Server</button>
</div>
<h3>Template Preview</h3>
<div class="actions row">
<select id="target"><option value="claude-code">claude-code</option><option value="codex">codex</option></select>
<button id="previewBtn" type="button">Preview Enabled Servers</button>
</div>
<pre id="preview"></pre>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const editingId = ${JSON.stringify(editingId || null)};
const $ = (id) => document.getElementById(id);
let servers = [];
let enabledState = true;

function setEnabledVisual(){
  const btn = $('enabledToggle');
  if (enabledState) {
    btn.textContent = 'Enabled: On';
    btn.classList.remove('toggle-off');
    btn.classList.add('toggle-on');
  } else {
    btn.textContent = 'Enabled: Off';
    btn.classList.remove('toggle-on');
    btn.classList.add('toggle-off');
  }
}

function fill(server){
  $('id').value = server?.id || '';
  $('idRuntime').value = server?.id || '';
  $('name').value = server?.name || '';
  $('type').value = server?.type || 'http';
  enabledState = Boolean(server?.enabled ?? true);
  setEnabledVisual();
  $('group').value = server?.meta?.group || 'default';
  $('description').value = server?.meta?.description || '';
  $('descriptionRuntime').value = server?.meta?.description || '';
  $('httpUrl').value = server?.http?.url || '';
  $('httpHeaders').value = server?.http?.headers ? JSON.stringify(server.http.headers, null, 2) : '';
  $('command').value = server?.stream?.command || '';
  $('module').value = server?.uvxFastmcp?.module || '';
  $('args').value = (server?.stream?.args || server?.uvxFastmcp?.args || []).join(' ');
  $('env').value = server?.stream?.env ? JSON.stringify(server.stream.env, null, 2) : (server?.uvxFastmcp?.env ? JSON.stringify(server.uvxFastmcp.env, null, 2) : '');
  syncTypeUi();
}

function loadSelect(){
  const sel = $('existing');
  sel.innerHTML = '<option value="">(new server)</option>' + servers.map(s => '<option value="' + s.id + '">' + s.name + ' (' + (s.meta?.group || 'default') + ')</option>').join('');
  if (editingId) sel.value = editingId;
}

$('enabledToggle').addEventListener('click', ()=> {
  enabledState = !enabledState;
  setEnabledVisual();
});
$('existing').addEventListener('change', (e)=>{
  const id = e.target.value;
  fill(servers.find(s => s.id === id));
});
$('new').addEventListener('click', ()=> fill(undefined));
$('type').addEventListener('change', ()=> syncTypeUi());
$('save').addEventListener('click', ()=> {
  const isHttp = $('type').value === 'http';
  const idValue = isHttp ? $('id').value : $('idRuntime').value;
  const descValue = isHttp ? $('description').value : $('descriptionRuntime').value;
  vscode.postMessage({ type:'save', payload:{
    id:idValue,name:$('name').value,type:$('type').value,enabled:enabledState,group:$('group').value,description:descValue,
    httpUrl:$('httpUrl').value,httpHeaders:$('httpHeaders').value,command:$('command').value,module:$('module').value,args:$('args').value,env:$('env').value
  }});
});
$('previewBtn').addEventListener('click', ()=> vscode.postMessage({ type:'preview', target:$('target').value }));

window.addEventListener('message', (ev)=>{
  const msg = ev.data;
  if (msg.type === 'data') {
    servers = msg.servers || [];
    loadSelect();
    const initial = servers.find(s => s.id === (msg.editingId || editingId));
    fill(initial);
  }
  if (msg.type === 'saved') {
    vscode.postMessage({ type:'requestData', editingId: msg.id });
  }
  if (msg.type === 'previewResult') {
    $('preview').textContent = msg.text || '';
  }
});

vscode.postMessage({ type:'requestData', editingId });

function setVisible(id, visible){
  const el = $(id);
  if (!el) return;
  if (visible) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function setDisabled(id, disabled){
  const el = $(id);
  if (!el) return;
  el.disabled = !!disabled;
}

function syncTypeUi(){
  const type = $('type').value;
  const isHttp = type === 'http';
  const isStream = type === 'stream';
  const isUvx = type === 'uvx-fastmcp';

  setVisible('httpCard', isHttp);
  setVisible('runtimeCard', isStream || isUvx);

  setDisabled('httpUrl', !isHttp);
  setDisabled('httpHeaders', !isHttp);
  setDisabled('command', !isStream);
  setDisabled('module', !isUvx);
  setDisabled('args', !(isStream || isUvx));
  setDisabled('env', !(isStream || isUvx));

  if (isHttp) {
    $('id').value = $('idRuntime').value || $('id').value;
    $('description').value = $('descriptionRuntime').value || $('description').value;
  } else {
    $('idRuntime').value = $('id').value || $('idRuntime').value;
    $('descriptionRuntime').value = $('description').value || $('descriptionRuntime').value;
  }
}
</script>
</body>
</html>`;
}

export async function previewTemplate(servers: import('./types').McpServer[]): Promise<void> {
  const target = await vscode.window.showQuickPick(['claude-code', 'codex'], {
    placeHolder: 'Preview target'
  });

  if (!target) {
    return;
  }

  const previewTarget: ExportTarget = target === 'codex' ? 'codex' : 'claude-code';
  const text = buildPreviewText(servers, previewTarget);
  const document = await vscode.workspace.openTextDocument({
    content: text,
    language: previewTarget === 'codex' ? 'toml' : 'json'
  });

  await vscode.window.showTextDocument(document, { preview: false });
}
