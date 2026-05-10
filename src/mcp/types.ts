import * as vscode from 'vscode';

export type McpType = 'http' | 'stream' | 'uvx-fastmcp';
export type ExportTarget = 'claude-code' | 'codex';

export interface McpServerDefinition {
  id: string;
  name: string;
  type: McpType;
  meta?: {
    description?: string;
    group?: string;
  };
  http?: { url: string; headers?: Record<string, string> };
  stream?: { command: string; args: string[]; env?: Record<string, string> };
  uvxFastmcp?: { module: string; args: string[]; env?: Record<string, string> };
}

export interface McpServer extends McpServerDefinition {
  enabled: boolean;
}

export interface ParseServerPayloadSuccess {
  ok: true;
  server: McpServer;
}

export interface ParseServerPayloadError {
  ok: false;
  error: string;
}

export type ParseServerPayloadResult = ParseServerPayloadSuccess | ParseServerPayloadError;

export interface StudioMessage {
  type: string;
  [key: string]: unknown;
}

export type ServerTreeNode = vscode.TreeItem;
