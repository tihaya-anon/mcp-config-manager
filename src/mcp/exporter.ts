import * as vscode from 'vscode';
import { EXT_NS } from './constants';
import { ExportTarget, McpServer } from './types';
import { toTargetServerConfig } from './serialization';

interface TemplateContext {
  target: ExportTarget;
  servers: Array<McpServer & { resolved: Record<string, unknown> }>;
  servers_by_name: Record<string, McpServer & { resolved: Record<string, unknown> }>;
  servers_resolved_by_name: Record<string, Record<string, unknown>>;
  servers_raw_json: string;
  servers_by_name_json: string;
  servers_resolved_by_name_json: string;
}

export async function exportToFile(
  servers: McpServer[],
  target: ExportTarget
): Promise<void> {
  const enabledServers = servers.filter((server) => server.enabled);

  if (!enabledServers.length) {
    void vscode.window.showWarningMessage('No enabled MCP servers to export.');
    return;
  }

  const exportText = buildPreviewText(enabledServers, target);
  const targetUri = await resolveExportUri(target);

  if (!targetUri) {
    return;
  }

  await ensureParentDir(targetUri);
  await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(exportText));
  void vscode.window.showInformationMessage(
    `Exported ${enabledServers.length} servers to ${targetUri.fsPath}`
  );
}

export function buildPreviewText(servers: McpServer[], target: ExportTarget): string {
  const context = createTemplateContext(servers, target);
  const template = getTemplate(target);
  return renderTemplate(template, context);
}

function createTemplateContext(servers: McpServer[], target: ExportTarget): TemplateContext {
  const enrichedServers = servers.map((server) => ({
    ...server,
    resolved: toTargetServerConfig(server, target)
  }));

  const byName: Record<string, McpServer & { resolved: Record<string, unknown> }> = {};
  const resolvedByName: Record<string, Record<string, unknown>> = {};
  for (const server of enrichedServers) {
    byName[server.name] = server;
    resolvedByName[server.name] = server.resolved;
  }

  return {
    target,
    servers: enrichedServers,
    servers_by_name: byName,
    servers_resolved_by_name: resolvedByName,
    servers_raw_json: JSON.stringify(enrichedServers, null, 2),
    servers_by_name_json: JSON.stringify(byName, null, 2),
    servers_resolved_by_name_json: JSON.stringify(resolvedByName, null, 2)
  };
}

function getTemplate(target: ExportTarget): string {
  const config = vscode.workspace.getConfiguration(EXT_NS);

  if (target === 'claude-code') {
    return (
      config.get<string>('export.claudeCodeTemplate') ??
      '{\n  "mcpServers": {{json servers_resolved_by_name}}\n}'
    );
  }

  return (
    config.get<string>('export.codexTemplate') ??
    '# Codex MCP config\n{{#each servers}}[mcp_servers.{{tomlKey name}}]\n{{#if resolved.url}}url = {{toml resolved.url}}\n{{/if}}{{#if resolved.headers}}http_headers = {{toml resolved.headers}}\n{{/if}}{{#if resolved.command}}command = {{toml resolved.command}}\n{{/if}}{{#if resolved.args}}args = {{toml resolved.args}}\n{{/if}}{{#if resolved.env}}env = {{toml resolved.env}}\n{{/if}}\n{{/each}}'
  );
}

function renderTemplate(template: string, context: TemplateContext): string {
  return renderSection(template, context, context);
}

function renderSection(template: string, scope: unknown, root: TemplateContext): string {
  const eachRendered = template.replace(
    /{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g,
    (_, path: string, block: string) => {
      const resolved = resolvePath(scope, root, path.trim());
      if (!Array.isArray(resolved)) {
        return '';
      }
      return resolved.map((item) => renderSection(block, item, root)).join('');
    }
  );

  const ifRendered = eachRendered.replace(
    /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g,
    (_, expr: string, block: string) => {
      const value = evalExpr(scope, root, expr.trim());
      return isTruthy(value) ? renderSection(block, scope, root) : '';
    }
  );

  return ifRendered.replace(/{{\s*([^}]+)\s*}}/g, (_, expr: string) => {
    const value = evalExpr(scope, root, expr.trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

function evalExpr(scope: unknown, root: TemplateContext, expr: string): unknown {
  if (expr.startsWith('json ')) {
    return JSON.stringify(resolvePath(scope, root, expr.slice(5).trim()), null, 2);
  }

  if (expr.startsWith('tomlKey ')) {
    const value = resolvePath(scope, root, expr.slice(8).trim());
    return quoteTomlKey(String(value ?? ''));
  }

  if (expr.startsWith('toml ')) {
    return toTomlValue(resolvePath(scope, root, expr.slice(5).trim()));
  }

  return resolvePath(scope, root, expr);
}

function resolvePath(scope: unknown, root: TemplateContext, path: string): unknown {
  if (!path || path === 'this') {
    return scope;
  }

  if (path.startsWith('this.')) {
    return readPath(scope, path.slice(5));
  }

  const fromScope = readPath(scope, path);
  if (fromScope !== undefined) {
    return fromScope;
  }

  return readPath(root, path);
}

function readPath(source: unknown, path: string): unknown {
  if (!path) {
    return source;
  }

  const parts = path.split('.');
  let current: unknown = source;

  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}

function quoteTomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${escapeTomlString(key)}"`;
}

function toTomlValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${escapeTomlString(value)}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toTomlValue(item)).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${quoteTomlKey(key)} = ${toTomlValue(item)}`);

    return `{ ${entries.join(', ')} }`;
  }

  return '""';
}

function escapeTomlString(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

async function resolveExportUri(target: ExportTarget): Promise<vscode.Uri | undefined> {
  const config = vscode.workspace.getConfiguration(EXT_NS);
  const writeToWorkspace = config.get<boolean>('export.writeToWorkspace', true);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (writeToWorkspace && workspaceFolder) {
    const configuredPath = target === 'claude-code'
      ? config.get<string>('export.claudeCodePath', '.mcp.json')
      : config.get<string>('export.codexPath', '.codex/config.toml');
    const normalized = (configuredPath || '').trim();
    if (normalized) {
      if (normalized.startsWith('/') || /^[A-Za-z]:[\\/]/.test(normalized)) {
        return vscode.Uri.file(normalized);
      }
      return vscode.Uri.joinPath(workspaceFolder.uri, ...normalized.split(/[\\/]+/).filter(Boolean));
    }

    if (target === 'claude-code') {
      return vscode.Uri.joinPath(workspaceFolder.uri, '.mcp.json');
    }
    return vscode.Uri.joinPath(workspaceFolder.uri, '.codex', 'config.toml');
  }

  const isToml = target === 'codex';
  return vscode.window.showSaveDialog({
    title: `Export MCP for ${target}`,
    saveLabel: 'Export',
    filters: isToml ? { TOML: ['toml'] } : { JSON: ['json'] },
    defaultUri: vscode.Uri.file(isToml ? `${target}-mcp.toml` : `${target}-mcp.json`)
  });
}

async function ensureParentDir(targetUri: vscode.Uri): Promise<void> {
  const path = targetUri.path;
  const separatorIndex = path.lastIndexOf('/');

  if (separatorIndex <= 0) {
    return;
  }

  const parentUri = targetUri.with({ path: path.slice(0, separatorIndex) });

  try {
    await vscode.workspace.fs.stat(parentUri);
  } catch {
    await vscode.workspace.fs.createDirectory(parentUri);
  }
}
