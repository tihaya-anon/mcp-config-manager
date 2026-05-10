import { DEFAULT_GROUP } from './constants';
import { McpServer, McpType, ParseServerPayloadResult, ExportTarget } from './types';

export function parseServerPayload(payload: unknown): ParseServerPayloadResult {
  const data = payload as Record<string, unknown>;
  const name = String(data?.name || '').trim();
  const type = data?.type as McpType;

  if (!name) {
    return { ok: false, error: 'Name is required.' };
  }

  if (!['http', 'stream', 'uvx-fastmcp'].includes(type)) {
    return { ok: false, error: 'Type is invalid.' };
  }

  const group = String(data?.group || '').trim() || DEFAULT_GROUP;

  const server: McpServer = {
    id: createServerId(data?.id),
    name,
    type,
    enabled: Boolean(data?.enabled ?? true),
    meta: {
      description: String(data?.description || '').trim() || undefined,
      group
    }
  };

  return attachTypeConfig(server, data);
}

function createServerId(rawId: unknown): string {
  if (rawId && String(rawId).trim()) {
    return String(rawId);
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function attachTypeConfig(server: McpServer, data: Record<string, unknown>): ParseServerPayloadResult {
  const headers = parseJsonMapSafe(data?.httpHeaders as string | undefined);
  const env = parseJsonMapSafe(data?.env as string | undefined);

  if (server.type === 'http') {
    const url = String(data?.httpUrl || '').trim();

    if (!url) {
      return { ok: false, error: 'HTTP URL is required for http type.' };
    }

    server.http = { url, headers };
    return { ok: true, server };
  }

  if (server.type === 'stream') {
    const command = String(data?.command || '').trim();

    if (!command) {
      return { ok: false, error: 'Command is required for stream type.' };
    }

    server.stream = { command, args: splitArgs(String(data?.args || '')), env };
    return { ok: true, server };
  }

  const moduleName = String(data?.module || '').trim();

  if (!moduleName) {
    return { ok: false, error: 'Module is required for uvx-fastmcp type.' };
  }

  server.uvxFastmcp = {
    module: moduleName,
    args: splitArgs(String(data?.args || '')),
    env
  };

  return { ok: true, server };
}

function splitArgs(input: string): string[] {
  return input
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseJsonMapSafe(raw: string | undefined): Record<string, string> | undefined {
  if (!raw || !String(raw).trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(String(raw));

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      result[key] = String(value);
    }

    return result;
  } catch {
    return undefined;
  }
}

export function toTargetServerConfig(
  server: McpServer,
  target: ExportTarget
): Record<string, unknown> {
  if (server.type === 'http' && server.http) {
    if (target === 'claude-code') {
      return {
        type: 'http',
        url: server.http.url,
        headers: server.http.headers
      };
    }
    return {
      url: server.http.url,
      headers: server.http.headers
    };
  }

  if (server.type === 'stream' && server.stream) {
    return {
      command: server.stream.command,
      args: server.stream.args,
      env: server.stream.env
    };
  }

  if (server.type === 'uvx-fastmcp' && server.uvxFastmcp) {
    return {
      command: 'uvx',
      args: ['fastmcp', 'run', server.uvxFastmcp.module, ...server.uvxFastmcp.args],
      env: server.uvxFastmcp.env
    };
  }

  return {};
}
