import * as vscode from 'vscode';
import { DEFAULT_GROUP, EXT_NS, STORAGE_KEY } from './constants';
import { McpServer, McpServerDefinition } from './types';

type ServerStates = Record<string, { enabled: boolean }>;
type DefinitionScope = 'workspace' | 'user';

export class McpStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): McpServer[] {
    const definitions = this.getMergedDefinitions();
    const states = this.getStates();

    return definitions.map((definition) => ({
      ...definition,
      enabled: states[definition.id]?.enabled ?? true
    }));
  }

  async upsert(server: McpServer): Promise<void> {
    const targetScope = this.getDefinitionStorageScope();
    const scopedDefinitions = this.getDefinitionsFromScope(targetScope);
    const definition: McpServerDefinition = toDefinition(server);
    const index = scopedDefinitions.findIndex((item) => item.id === definition.id);

    if (index >= 0) {
      scopedDefinitions[index] = definition;
    } else {
      scopedDefinitions.push(definition);
    }

    await this.saveDefinitions(scopedDefinitions, targetScope);
    await this.setEnabled(server.id, server.enabled);
  }

  async remove(id: string): Promise<void> {
    const targetScope = this.getDefinitionStorageScope();
    const scopedDefinitions = this
      .getDefinitionsFromScope(targetScope)
      .filter((server) => server.id !== id);

    await this.saveDefinitions(scopedDefinitions, targetScope);

    const states = this.getStates();
    delete states[id];
    await this.saveStates(states);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const states = this.getStates();
    states[id] = { enabled };
    await this.saveStates(states);
  }

  async setGroupEnabled(groupName: string, enabled: boolean): Promise<number> {
    const list = this.list().filter(
      (server) => (server.meta?.group?.trim() || DEFAULT_GROUP) === groupName
    );
    if (!list.length) {
      return 0;
    }

    const states = this.getStates();
    for (const server of list) {
      states[server.id] = { enabled };
    }
    await this.saveStates(states);
    return list.length;
  }

  async removeGroup(groupName: string): Promise<number> {
    const targetScope = this.getDefinitionStorageScope();
    const scopedDefinitions = this.getDefinitionsFromScope(targetScope);
    const toRemoveIds = scopedDefinitions
      .filter((server) => (server.meta?.group?.trim() || DEFAULT_GROUP) === groupName)
      .map((server) => server.id);

    if (!toRemoveIds.length) {
      return 0;
    }

    await this.saveDefinitions(
      scopedDefinitions.filter((server) => !toRemoveIds.includes(server.id)),
      targetScope
    );

    const states = this.getStates();
    for (const id of toRemoveIds) {
      delete states[id];
    }
    await this.saveStates(states);
    return toRemoveIds.length;
  }

  async renameGroup(oldName: string, newName: string): Promise<number> {
    const targetScope = this.getDefinitionStorageScope();
    const scopedDefinitions = this.getDefinitionsFromScope(targetScope);
    let changed = 0;

    const updated = scopedDefinitions.map((server) => {
      const group = server.meta?.group?.trim() || DEFAULT_GROUP;
      if (group !== oldName) {
        return server;
      }
      changed += 1;
      return {
        ...server,
        meta: {
          ...(server.meta || {}),
          group: newName
        }
      };
    });

    if (!changed) {
      return 0;
    }

    await this.saveDefinitions(updated, targetScope);
    return changed;
  }

  getDefinitionStorageScope(): DefinitionScope {
    const config = vscode.workspace.getConfiguration(EXT_NS);
    const scope = config.get<string>('definitionStorageScope', 'workspace');
    return scope === 'user' ? 'user' : 'workspace';
  }

  async toggleDefinitionStorageScope(): Promise<DefinitionScope> {
    const current = this.getDefinitionStorageScope();
    const next: DefinitionScope = current === 'workspace' ? 'user' : 'workspace';
    const config = vscode.workspace.getConfiguration(EXT_NS);
    await config.update('definitionStorageScope', next, vscode.ConfigurationTarget.Global);
    return next;
  }

  private getMergedDefinitions(): McpServer[] {
    const userDefinitions = this.getDefinitionsFromScope('user').map((item) => ({
      ...item,
      sourceScope: 'user' as const
    }));

    const workspaceDefinitions = this.getDefinitionsFromScope('workspace').map((item) => ({
      ...item,
      sourceScope: 'workspace' as const
    }));

    const byId = new Map<string, McpServer>();

    for (const definition of userDefinitions) {
      byId.set(definition.id, definition as McpServer);
    }

    for (const definition of workspaceDefinitions) {
      byId.set(definition.id, definition as McpServer);
    }

    return Array.from(byId.values());
  }

  private getDefinitionsFromScope(scope: DefinitionScope): McpServerDefinition[] {
    const config = vscode.workspace.getConfiguration(EXT_NS);
    const inspect = config.inspect<unknown[]>('servers');

    const value = scope === 'workspace'
      ? inspect?.workspaceValue ?? []
      : inspect?.globalValue ?? [];

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => normalizeDefinition(item as Record<string, unknown>))
      .filter((item): item is McpServerDefinition => item !== undefined);
  }

  private async saveDefinitions(list: McpServerDefinition[], scope: DefinitionScope): Promise<void> {
    const config = vscode.workspace.getConfiguration(EXT_NS);
    const target = scope === 'user'
      ? vscode.ConfigurationTarget.Global
      : vscode.ConfigurationTarget.Workspace;
    await config.update('servers', list, target);
  }

  private getStates(): ServerStates {
    return this.context.globalState.get<ServerStates>(STORAGE_KEY, {});
  }

  private async saveStates(states: ServerStates): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, states);
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
