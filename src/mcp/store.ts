import * as vscode from 'vscode';
import { DEFAULT_GROUP, EXT_NS, STORAGE_KEY } from './constants';
import { McpServer, McpServerDefinition } from './types';

type ServerStates = Record<string, { enabled: boolean }>;

export class McpStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): McpServer[] {
    const definitions = this.getDefinitions();
    const states = this.getStates();

    return definitions.map((definition) => ({
      ...definition,
      enabled: states[definition.id]?.enabled ?? true
    }));
  }

  async upsert(server: McpServer): Promise<void> {
    const definitions = this.getDefinitions();
    const definition: McpServerDefinition = toDefinition(server);
    const index = definitions.findIndex((item) => item.id === definition.id);

    if (index >= 0) {
      definitions[index] = definition;
    } else {
      definitions.push(definition);
    }

    await this.saveDefinitions(definitions);
    await this.setEnabled(server.id, server.enabled);
  }

  async remove(id: string): Promise<void> {
    const definitions = this.getDefinitions().filter((server) => server.id !== id);
    await this.saveDefinitions(definitions);

    const states = this.getStates();
    delete states[id];
    await this.saveStates(states);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const states = this.getStates();
    states[id] = { enabled };
    await this.saveStates(states);
  }

  private getDefinitions(): McpServerDefinition[] {
    const config = vscode.workspace.getConfiguration(EXT_NS);
    const value = config.get<unknown[]>('servers', []);

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => normalizeDefinition(item as Record<string, unknown>))
      .filter((item): item is McpServerDefinition => item !== undefined);
  }

  private async saveDefinitions(list: McpServerDefinition[]): Promise<void> {
    const target = this.getDefinitionConfigTarget();
    const config = vscode.workspace.getConfiguration(EXT_NS);
    await config.update('servers', list, target);
  }

  private getStates(): ServerStates {
    return this.context.globalState.get<ServerStates>(STORAGE_KEY, {});
  }

  private async saveStates(states: ServerStates): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, states);
  }

  getDefinitionStorageScope(): 'workspace' | 'user' {
    const config = vscode.workspace.getConfiguration(EXT_NS);
    const scope = config.get<string>('definitionStorageScope', 'workspace');
    return scope === 'user' ? 'user' : 'workspace';
  }

  async toggleDefinitionStorageScope(): Promise<'workspace' | 'user'> {
    const current = this.getDefinitionStorageScope();
    const next = current === 'workspace' ? 'user' : 'workspace';
    const config = vscode.workspace.getConfiguration(EXT_NS);
    await config.update('definitionStorageScope', next, vscode.ConfigurationTarget.Global);
    return next;
  }

  private getDefinitionConfigTarget(): vscode.ConfigurationTarget {
    return this.getDefinitionStorageScope() === 'user'
      ? vscode.ConfigurationTarget.Global
      : vscode.ConfigurationTarget.Workspace;
  }
}

function toDefinition(server: McpServer): McpServerDefinition {
  return {
    id: server.id,
    name: server.name,
    type: server.type,
    meta: server.meta,
    http: server.http,
    stream: server.stream,
    uvxFastmcp: server.uvxFastmcp
  };
}

function normalizeDefinition(raw: Record<string, unknown>): McpServerDefinition | undefined {
  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();
  const type = String(raw.type || '').trim();

  if (!id || !name || !['http', 'stream', 'uvx-fastmcp'].includes(type)) {
    return undefined;
  }

  const metaRaw = raw.meta as Record<string, unknown> | undefined;
  const meta = {
    description: String(metaRaw?.description || '').trim() || undefined,
    group: String(metaRaw?.group || '').trim() || DEFAULT_GROUP
  };

  return {
    id,
    name,
    type: type as McpServerDefinition['type'],
    meta,
    http: raw.http as McpServerDefinition['http'],
    stream: raw.stream as McpServerDefinition['stream'],
    uvxFastmcp: raw.uvxFastmcp as McpServerDefinition['uvxFastmcp']
  };
}
