export function buildStudioHtml(nonce: string, editingId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MCP Studio</title>
<style>${buildStyles()}</style>
</head>
<body>
${buildBody()}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const editingId = ${editingId};
${buildScript()}
</script>
</body>
</html>`;
}

function buildStyles(): string {
  return `body{font-family:var(--vscode-font-family);padding:16px;max-width:960px;margin:0 auto}
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
.actions{display:flex;gap:10px;flex-wrap:wrap}
.actions button{width:auto}
#preview{white-space:pre-wrap;background:var(--vscode-editor-background);padding:12px;border:1px solid var(--vscode-panel-border);min-height:180px;border-radius:8px}
.card{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:14px}
.hidden{display:none}
.topbar{display:grid;grid-template-columns:2fr 1fr auto;gap:12px;margin-bottom:12px;align-items:end}
.toggle-btn{min-width:140px}
.toggle-on{border-color:#2e7d32;color:#2e7d32}
.toggle-off{border-color:#b71c1c;color:#b71c1c}
#jsonEditor{min-height:220px;font-family:var(--vscode-editor-font-family, monospace)}
#jsonStatus{font-size:12px;opacity:.8}`;
}

function buildBody(): string {
  return `<h2>MCP Studio</h2>
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
<h3>Paste JSON</h3>
<div class="actions row">
<button id="pasteJson" type="button">Paste JSON</button>
<button id="copyJson" type="button">Copy JSON</button>
<button id="applyJson" type="button">Apply JSON to Form</button>
<button id="formatJson" type="button">Format JSON</button>
<span id="jsonStatus"></span>
</div>
<textarea id="jsonEditor" placeholder='Paste a McpServer JSON object here'></textarea>
<h3>Template Preview</h3>
<div class="actions row">
<select id="target"><option value="claude-code">claude-code</option><option value="codex">codex</option></select>
<button id="previewBtn" type="button">Preview Enabled Servers</button>
</div>
<pre id="preview"></pre>`;
}

function buildScript(): string {
  return `const $ = (id) => document.getElementById(id);
let servers = [];
let enabledState = true;
let isSyncing = false;

function setStatus(text, isError) {
  const el = $('jsonStatus');
  el.textContent = text || '';
  el.style.color = isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)';
}

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

function formToServer() {
  const type = $('type').value;
  const isHttp = type === 'http';
  const idValue = isHttp ? $('id').value : $('idRuntime').value;
  const descValue = isHttp ? $('description').value : $('descriptionRuntime').value;
  const server = {
    id: idValue || '',
    name: $('name').value || '',
    type,
    enabled: enabledState,
    meta: {
      group: $('group').value || 'default',
      description: descValue || undefined
    }
  };

  if (type === 'http') {
    server.http = {
      url: $('httpUrl').value || '',
      headers: parseJsonSafe($('httpHeaders').value)
    };
  }

  if (type === 'stream') {
    server.stream = {
      command: $('command').value || '',
      args: splitArgs($('args').value || ''),
      env: parseJsonSafe($('env').value)
    };
  }

  if (type === 'uvx-fastmcp') {
    server.uvxFastmcp = {
      module: $('module').value || '',
      args: splitArgs($('args').value || ''),
      env: parseJsonSafe($('env').value)
    };
  }

  return server;
}

function refreshJsonFromForm() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    $('jsonEditor').value = JSON.stringify(formToServer(), null, 2);
    setStatus('JSON synced from form', false);
  } finally {
    isSyncing = false;
  }
}

function fill(server){
  const value = server || {};
  $('id').value = value.id || '';
  $('idRuntime').value = value.id || '';
  $('name').value = value.name || '';
  $('type').value = value.type || 'http';
  enabledState = Boolean(value.enabled ?? true);
  setEnabledVisual();
  $('group').value = value.meta?.group || 'default';
  $('description').value = value.meta?.description || '';
  $('descriptionRuntime').value = value.meta?.description || '';
  $('httpUrl').value = value.http?.url || '';
  $('httpHeaders').value = value.http?.headers ? JSON.stringify(value.http.headers, null, 2) : '';
  $('command').value = value.stream?.command || '';
  $('module').value = value.uvxFastmcp?.module || '';
  $('args').value = (value.stream?.args || value.uvxFastmcp?.args || []).join(' ');
  $('env').value = value.stream?.env ? JSON.stringify(value.stream.env, null, 2) : (value.uvxFastmcp?.env ? JSON.stringify(value.uvxFastmcp.env, null, 2) : '');
  syncTypeUi();
  refreshJsonFromForm();
}

function loadSelect(){
  const sel = $('existing');
  sel.innerHTML = '<option value="">(new server)</option>' + servers.map(s => '<option value="' + s.id + '">' + s.name + ' (' + (s.meta?.group || 'default') + ')</option>').join('');
  if (editingId) sel.value = editingId;
}

function applyJsonToForm() {
  const raw = $('jsonEditor').value || '';
  try {
    const parsed = JSON.parse(raw);
    fill(parsed);
    setStatus('JSON applied to form', false);
  } catch (err) {
    setStatus('Invalid JSON: ' + (err?.message || String(err)), true);
  }
}

function splitArgs(input) {
  return input.split(' ').map((x) => x.trim()).filter(Boolean);
}

function parseJsonSafe(raw) {
  if (!raw || !raw.trim()) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

$('enabledToggle').addEventListener('click', ()=> {
  enabledState = !enabledState;
  setEnabledVisual();
  refreshJsonFromForm();
});
$('existing').addEventListener('change', (e)=>{
  const id = e.target.value;
  fill(servers.find(s => s.id === id));
});
$('new').addEventListener('click', ()=> fill(undefined));
$('type').addEventListener('change', ()=> { syncTypeUi(); refreshJsonFromForm(); });
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
$('applyJson').addEventListener('click', applyJsonToForm);
$('formatJson').addEventListener('click', ()=> {
  try {
    $('jsonEditor').value = JSON.stringify(JSON.parse($('jsonEditor').value || '{}'), null, 2);
    setStatus('JSON formatted', false);
  } catch (err) {
    setStatus('Invalid JSON: ' + (err?.message || String(err)), true);
  }
});
$('pasteJson').addEventListener('click', async ()=> {
  try {
    const text = await navigator.clipboard.readText();
    $('jsonEditor').value = text || '';
    applyJsonToForm();
  } catch (err) {
    setStatus('Paste failed. Browser clipboard permission denied.', true);
  }
});
$('copyJson').addEventListener('click', async ()=> {
  try {
    await navigator.clipboard.writeText($('jsonEditor').value || '');
    setStatus('JSON copied', false);
  } catch (err) {
    setStatus('Copy failed. Browser clipboard permission denied.', true);
  }
});

['name','group','id','idRuntime','description','descriptionRuntime','httpUrl','httpHeaders','command','module','args','env'].forEach((id)=>{
  const el=$(id);
  if(el){ el.addEventListener('input', refreshJsonFromForm); }
});

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
}`;
}
