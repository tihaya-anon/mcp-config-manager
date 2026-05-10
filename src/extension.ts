import * as vscode from 'vscode';

type McpType = 'http' | 'stream' | 'uvx-fastmcp';
type ExportTarget = 'claude-code' | 'codex';

type ServerNode = GroupItem | McpItem;

interface McpServer {
  id: string;
  name: string;
  type: McpType;
  enabled: boolean;
  meta?: {
    description?: string;
    group?: string;
  };
  http?: { url: string; headers?: Record<string, string> };
  stream?: { command: string; args: string[]; env?: Record<string, string> };
  uvxFastmcp?: { module: string; args: string[]; env?: Record<string, string> };
}

const STORAGE_KEY = 'servers';
const EXT_NS = 'mcpController';

class McpStore {
  constructor(private readonly context: vscode.ExtensionContext) {}
  list(): McpServer[] { return this.context.globalState.get<McpServer[]>(STORAGE_KEY, []); }
  async save(list: McpServer[]): Promise<void> { await this.context.globalState.update(STORAGE_KEY, list); }
  async upsert(server: McpServer): Promise<void> {
    const list = this.list();
    const i = list.findIndex((x) => x.id === server.id);
    if (i >= 0) list[i] = server; else list.push(server);
    await this.save(list);
  }
  async remove(id: string): Promise<void> { await this.save(this.list().filter((x) => x.id !== id)); }
}

class GroupItem extends vscode.TreeItem {
  constructor(public readonly groupName: string) {
    super(groupName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'mcpGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

class McpItem extends vscode.TreeItem {
  constructor(public readonly server: McpServer) {
    super(server.name, vscode.TreeItemCollapsibleState.None);
    const dot = server.enabled ? '🟢' : '🔴';
    this.description = `${dot} ${server.type}`;
    this.tooltip = server.meta?.description || `${server.name} (${server.type})`;
    this.iconPath = new vscode.ThemeIcon(server.enabled ? 'triangle-right' : 'primitive-square');
    this.contextValue = 'mcpServer';
    this.command = { command: 'mcpController.editMcp', title: 'Edit MCP', arguments: [server] };
  }
}

class ServerProvider implements vscode.TreeDataProvider<ServerNode> {
  private readonly ev = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.ev.event;
  constructor(private readonly store: McpStore) {}
  refresh(): void { this.ev.fire(); }
  getTreeItem(element: ServerNode): vscode.TreeItem { return element; }
  getChildren(element?: ServerNode): ServerNode[] {
    const all = this.store.list();
    if (!element) {
      const groups = Array.from(new Set(all.map((s) => s.meta?.group?.trim() || 'default'))).sort((a, b) => a.localeCompare(b));
      return groups.map((g) => new GroupItem(g));
    }
    if (element instanceof GroupItem) {
      return all
        .filter((s) => (s.meta?.group?.trim() || 'default') === element.groupName)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => new McpItem(s));
    }
    return [];
  }
}

class ToolItem extends vscode.TreeItem {
  constructor(label: string, command: string, iconId: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command, title: label };
    this.iconPath = new vscode.ThemeIcon(iconId);
  }
}

class ToolProvider implements vscode.TreeDataProvider<ToolItem> {
  getTreeItem(element: ToolItem): vscode.TreeItem { return element; }
  getChildren(): ToolItem[] {
    return [
      new ToolItem('Open Studio', 'mcpController.openStudio', 'layout'),
      new ToolItem('Add Server', 'mcpController.addMcp', 'add'),
      new ToolItem('Export Claude', 'mcpController.exportClaudeCode', 'export'),
      new ToolItem('Export Codex', 'mcpController.exportCodex', 'export'),
      new ToolItem('Preview Template', 'mcpController.previewTemplate', 'eye')
    ];
  }
}

let studioPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const store = new McpStore(context);
  const serverProvider = new ServerProvider(store);

  vscode.window.createTreeView('mcpController.servers', { treeDataProvider: serverProvider });
  vscode.window.createTreeView('mcpController.tools', { treeDataProvider: new ToolProvider() });

  const openStudio = (editingId?: string): void => {
    if (!studioPanel) {
      studioPanel = vscode.window.createWebviewPanel('mcpStudio', 'MCP Studio', vscode.ViewColumn.One, { enableScripts: true });
      studioPanel.onDidDispose(() => { studioPanel = undefined; });
      studioPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'requestData') {
          studioPanel?.webview.postMessage({ type: 'data', servers: store.list(), editingId: msg.editingId ?? null });
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
        }
        if (msg.type === 'preview') {
          const preview = buildPreviewText(store.list(), msg.target === 'codex' ? 'codex' : 'claude-code');
          studioPanel?.webview.postMessage({ type: 'previewResult', text: preview });
        }
      });
    }
    studioPanel.reveal(vscode.ViewColumn.One);
    studioPanel.webview.html = getStudioHtml(editingId);
  };

  context.subscriptions.push(vscode.commands.registerCommand('mcpController.openStudio', () => openStudio()));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.addMcp', () => openStudio()));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.editMcp', (item?: McpServer | McpItem) => {
    const s = item instanceof McpItem ? item.server : item;
    openStudio(s?.id);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.toggleMcp', async (item?: McpServer | McpItem) => {
    const s = (item instanceof McpItem ? item.server : item) ?? await pickServer(store, 'Select a server to toggle');
    if (!s) return;
    s.enabled = !s.enabled;
    await store.upsert(s);
    serverProvider.refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.removeMcp', async (item?: McpServer | McpItem) => {
    const s = (item instanceof McpItem ? item.server : item) ?? await pickServer(store, 'Select a server to remove');
    if (!s) return;
    const ok = await vscode.window.showWarningMessage(`Remove MCP server '${s.name}'?`, { modal: true }, 'Remove');
    if (ok !== 'Remove') return;
    await store.remove(s.id);
    serverProvider.refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.exportClaudeCode', async () => exportToFile(store.list(), 'claude-code')));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.exportCodex', async () => exportToFile(store.list(), 'codex')));
  context.subscriptions.push(vscode.commands.registerCommand('mcpController.previewTemplate', async () => {
    const target = await vscode.window.showQuickPick(['claude-code', 'codex'], { placeHolder: 'Preview target' }) as ExportTarget | undefined;
    if (!target) return;
    const text = buildPreviewText(store.list(), target);
    const doc = await vscode.workspace.openTextDocument({ content: text, language: target === 'codex' ? 'toml' : 'json' });
    await vscode.window.showTextDocument(doc, { preview: false });
  }));
}

export function deactivate(): void {}

function parseServerPayload(payload: unknown): { ok: true; server: McpServer } | { ok: false; error: string } {
  const data = payload as Record<string, unknown>;
  const name = String(data?.name || '').trim();
  const type = data?.type as McpType;
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!['http', 'stream', 'uvx-fastmcp'].includes(type)) return { ok: false, error: 'Type is invalid.' };

  const group = String(data?.group || '').trim() || 'default';
  const server: McpServer = {
    id: data?.id && String(data.id).trim() ? String(data.id) : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    type,
    enabled: Boolean(data?.enabled ?? true),
    meta: {
      description: String(data?.description || '').trim() || undefined,
      group
    }
  };

  const headers = parseJsonMapSafe(data?.httpHeaders as string | undefined);
  const env = parseJsonMapSafe(data?.env as string | undefined);

  if (type === 'http') {
    const url = String(data?.httpUrl || '').trim();
    if (!url) return { ok: false, error: 'HTTP URL is required for http type.' };
    server.http = { url, headers };
  }
  if (type === 'stream') {
    const command = String(data?.command || '').trim();
    if (!command) return { ok: false, error: 'Command is required for stream type.' };
    server.stream = { command, args: splitArgs(String(data?.args || '')), env };
  }
  if (type === 'uvx-fastmcp') {
    const moduleName = String(data?.module || '').trim();
    if (!moduleName) return { ok: false, error: 'Module is required for uvx-fastmcp type.' };
    server.uvxFastmcp = { module: moduleName, args: splitArgs(String(data?.args || '')), env };
  }
  return { ok: true, server };
}

function parseJsonMapSafe(raw: string | undefined): Record<string, string> | undefined {
  if (!raw || !String(raw).trim()) return undefined;
  try {
    const p = JSON.parse(String(raw));
    if (!p || typeof p !== 'object' || Array.isArray(p)) return undefined;
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) r[k] = String(v);
    return r;
  } catch {
    return undefined;
  }
}

function splitArgs(input: string): string[] {
  return input.split(' ').map((x) => x.trim()).filter(Boolean);
}

async function pickServer(store: McpStore, placeHolder: string): Promise<McpServer | undefined> {
  const list = store.list();
  if (!list.length) return undefined;
  const pick = await vscode.window.showQuickPick(list.map((s) => ({ label: s.name, description: `${s.type} ${s.enabled ? 'on' : 'off'}`, server: s })), { placeHolder });
  return pick?.server;
}

async function exportToFile(servers: McpServer[], target: ExportTarget): Promise<void> {
  const enabled = servers.filter((s) => s.enabled);
  if (!enabled.length) {
    void vscode.window.showWarningMessage('No enabled MCP servers to export.');
    return;
  }
  const text = buildPreviewText(enabled, target);
  const isToml = target === 'codex';
  const uri = await vscode.window.showSaveDialog({
    title: `Export MCP for ${target}`,
    saveLabel: 'Export',
    filters: isToml ? { TOML: ['toml'] } : { JSON: ['json'] },
    defaultUri: vscode.Uri.file(isToml ? `${target}-mcp.toml` : `${target}-mcp.json`)
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  void vscode.window.showInformationMessage(`Exported ${enabled.length} servers to ${uri.fsPath}`);
}

function buildPreviewText(servers: McpServer[], target: ExportTarget): string {
  const template = getTemplate(target);
  const serversJson = JSON.stringify(buildServersJson(servers, target), null, 2);
  const serversToml = buildServersToml(servers, target);
  return renderTemplate(template, { target, servers_json: serversJson, servers_toml: serversToml });
}

function getTemplate(target: ExportTarget): string {
  const cfg = vscode.workspace.getConfiguration(EXT_NS);
  if (target === 'claude-code') {
    return cfg.get<string>('export.claudeCodeTemplate') ?? '{{servers_json}}';
  }
  return cfg.get<string>('export.codexTemplate') ?? '# Codex MCP config\n{{servers_toml}}';
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const token = `{{${k}}}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(token, 'g'), v);
  }
  return out;
}

function buildServersJson(servers: McpServer[], target: ExportTarget): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of servers) out[s.name] = toTargetServerConfig(s, target);
  return out;
}

function buildServersToml(servers: McpServer[], target: ExportTarget): string {
  const lines: string[] = [];
  for (const s of servers) {
    const cfg = toTargetServerConfig(s, target);
    lines.push(`[mcp_servers.${quoteTomlKey(s.name)}]`);
    for (const [k, v] of Object.entries(cfg)) {
      if (v === undefined) continue;
      lines.push(`${k} = ${toTomlValue(v)}`);
    }
    if (s.meta?.description) lines.push(`description = ${toTomlValue(s.meta.description)}`);
    if (s.meta?.group) lines.push(`group = ${toTomlValue(s.meta.group)}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function quoteTomlKey(key: string): string { return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${escapeTomlString(key)}"`; }
function toTomlValue(value: unknown): string {
  if (typeof value === 'string') return `"${escapeTomlString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => toTomlValue(v)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const e = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => `${quoteTomlKey(k)} = ${toTomlValue(v)}`);
    return `{ ${e.join(', ')} }`;
  }
  return '""';
}
function escapeTomlString(input: string): string { return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'); }

function toTargetServerConfig(server: McpServer, target: ExportTarget): Record<string, unknown> {
  if (server.type === 'http' && server.http) return { type: 'http', url: server.http.url, headers: server.http.headers };
  if (server.type === 'stream' && server.stream) return { type: target === 'codex' ? 'stdio' : 'stream', command: server.stream.command, args: server.stream.args, env: server.stream.env };
  if (server.type === 'uvx-fastmcp' && server.uvxFastmcp) return { type: target === 'codex' ? 'stdio' : 'stream', command: 'uvx', args: ['fastmcp', 'run', server.uvxFastmcp.module, ...server.uvxFastmcp.args], env: server.uvxFastmcp.env };
  return {};
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
