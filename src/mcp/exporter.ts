import * as vscode from 'vscode';
import { EXT_NS } from './constants';
import { ExportTarget, McpServer } from './types';
import { toTargetServerConfig } from './serialization';

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

export function buildPreviewText(
  servers: McpServer[],
  target: ExportTarget
): string {
  const template = getTemplate(target);
  const serversJson = JSON.stringify(buildServersJson(servers, target), null, 2);
  const serversToml = buildServersToml(servers, target);

  return renderTemplate(template, {
    target,
    servers_json: serversJson,
    servers_toml: serversToml
  });
}

function getTemplate(target: ExportTarget): string {
  const config = vscode.workspace.getConfiguration(EXT_NS);

  if (target === 'claude-code') {
    return config.get<string>('export.claudeCodeTemplate') ?? '{{servers_json}}';
  }

  return config.get<string>('export.codexTemplate') ?? '# Codex MCP config\n{{servers_toml}}';
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let output = template;

  for (const [key, value] of Object.entries(vars)) {
    const token = `{{${key}}}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(token, 'g'), value);
  }

  return output;
}

function buildServersJson(
  servers: McpServer[],
  target: ExportTarget
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const server of servers) {
    output[server.name] = toTargetServerConfig(server, target);
  }

  return output;
}

function buildServersToml(servers: McpServer[], target: ExportTarget): string {
  const lines: string[] = [];

  for (const server of servers) {
    const config = toTargetServerConfig(server, target);

    lines.push(`[mcp_servers.${quoteTomlKey(server.name)}]`);

    for (const [key, value] of Object.entries(config)) {
      if (value === undefined) {
        continue;
      }

      lines.push(`${key} = ${toTomlValue(value)}`);
    }

    if (target !== 'codex' && server.meta?.description) {
      lines.push(`description = ${toTomlValue(server.meta.description)}`);
    }

    if (target !== 'codex' && server.meta?.group) {
      lines.push(`group = ${toTomlValue(server.meta.group)}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
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
