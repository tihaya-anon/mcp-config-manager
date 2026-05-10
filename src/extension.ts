import * as vscode from 'vscode';
import { COMMANDS } from './mcp/constants';
import { exportToFile } from './mcp/exporter';
import { McpStore } from './mcp/store';
import { createStudioController, previewTemplate } from './mcp/studio';
import { McpItem, ServerProvider, ToolProvider } from './mcp/tree';
import { McpServer } from './mcp/types';

interface AppContext {
  store: McpStore;
  serverProvider: ServerProvider;
  toolProvider: ToolProvider;
  openStudioPanel: (editingId?: string) => void;
}

export function activate(context: vscode.ExtensionContext): void {
  const app = createAppContext(context);
  createViews(app);
  registerCommands(context, app);
}

export function deactivate(): void {}

function createAppContext(context: vscode.ExtensionContext): AppContext {
  const store = new McpStore(context);
  const serverProvider = new ServerProvider(store);
  const toolProvider = new ToolProvider(store);
  const studio = createStudioController(store, serverProvider);

  return {
    store,
    serverProvider,
    toolProvider,
    openStudioPanel: studio.openStudioPanel
  };
}

function createViews(app: AppContext): void {
  vscode.window.createTreeView('mcpConfigManager.servers', {
    treeDataProvider: app.serverProvider
  });

  vscode.window.createTreeView('mcpConfigManager.tools', {
    treeDataProvider: app.toolProvider
  });
}

function registerCommands(context: vscode.ExtensionContext, app: AppContext): void {
  const commandHandlers: Array<[string, (...args: unknown[]) => unknown]> = [
    [COMMANDS.openStudio, () => app.openStudioPanel()],
    [COMMANDS.addMcp, () => app.openStudioPanel()],
    [COMMANDS.editMcp, (...args: unknown[]) => {
      const item = args[0] as McpServer | McpItem | undefined;
      const server = item instanceof McpItem ? item.server : item;
      app.openStudioPanel(server?.id);
    }],
    [COMMANDS.toggleMcp, async (...args: unknown[]) => {
      const item = args[0] as McpServer | McpItem | undefined;
      await toggleServer(app, item, 'Select a server to toggle');
    }],
    [COMMANDS.toggleMcpOn, async (...args: unknown[]) => {
      const item = args[0] as McpServer | McpItem | undefined;
      await setServerEnabled(app, item, true);
    }],
    [COMMANDS.toggleMcpOff, async (...args: unknown[]) => {
      const item = args[0] as McpServer | McpItem | undefined;
      await setServerEnabled(app, item, false);
    }],
    [COMMANDS.removeMcp, async (...args: unknown[]) => {
      const item = args[0] as McpServer | McpItem | undefined;
      await removeServer(app, item);
    }],
    [COMMANDS.exportClaude, async () => {
      await exportToFile(app.store.list(), 'claude-code');
    }],
    [COMMANDS.exportCodex, async () => {
      await exportToFile(app.store.list(), 'codex');
    }],
    [COMMANDS.previewTemplate, async () => {
      await previewTemplate(app.store.list());
    }],
    [COMMANDS.toggleExportPathMode, async () => {
      await toggleExportPathMode();
    }],
    [COMMANDS.toggleDefinitionStorageScope, async () => {
      await toggleDefinitionScope(app);
    }],
    [COMMANDS.refreshServers, async () => {
      refreshAllViews(app);
    }]
  ];

  for (const [command, handler] of commandHandlers) {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('mcpConfigManager.servers') ||
        event.affectsConfiguration('mcpConfigManager.definitionStorageScope')
      ) {
        refreshAllViews(app);
      }
    })
  );
}

async function removeServer(app: AppContext, item?: McpServer | McpItem): Promise<void> {
  const server = await resolveServerSelection(app.store, item, 'Select a server to remove');
  if (!server) {
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Remove MCP server '${server.name}'?`,
    { modal: true },
    'Remove'
  );

  if (confirmation !== 'Remove') {
    return;
  }

  await runStoreAction(async () => {
    await app.store.remove(server.id);
    app.serverProvider.refresh();
  });
}

async function toggleServer(
  app: AppContext,
  item: McpServer | McpItem | undefined,
  placeHolder: string
): Promise<void> {
  const server = await resolveServerSelection(app.store, item, placeHolder);
  if (!server) {
    return;
  }

  server.enabled = !server.enabled;

  await runStoreAction(async () => {
    await app.store.upsert(server);
    app.serverProvider.refresh();
  });
}

async function setServerEnabled(
  app: AppContext,
  item: McpServer | McpItem | undefined,
  enabled: boolean
): Promise<void> {
  const server = await resolveServerSelection(app.store, item, 'Select a server');

  if (!server || server.enabled === enabled) {
    return;
  }

  server.enabled = enabled;

  await runStoreAction(async () => {
    await app.store.upsert(server);
    app.serverProvider.refresh();
  });
}

async function resolveServerSelection(
  store: McpStore,
  item: McpServer | McpItem | undefined,
  placeHolder: string
): Promise<McpServer | undefined> {
  if (item instanceof McpItem) {
    return item.server;
  }

  if (item) {
    return item;
  }

  const servers = store.list();
  if (!servers.length) {
    return undefined;
  }

  const pick = await vscode.window.showQuickPick(
    servers.map((server) => ({
      label: server.name,
      description: `${server.type} ${server.enabled ? 'on' : 'off'}`,
      server
    })),
    { placeHolder }
  );

  return pick?.server;
}

async function toggleExportPathMode(): Promise<void> {
  const config = vscode.workspace.getConfiguration('mcpConfigManager');
  const current = config.get<boolean>('export.writeToWorkspace', true);
  const target = !current;

  await config.update('export.writeToWorkspace', target, vscode.ConfigurationTarget.Workspace);

  void vscode.window.showInformationMessage(
    `Export path mode is now ${target ? 'Workspace Files (.mcp.json/.codex/config.toml)' : 'Manual Save Dialog'}.`
  );
}

async function toggleDefinitionScope(app: AppContext): Promise<void> {
  const scope = await app.store.toggleDefinitionStorageScope();
  refreshAllViews(app);

  void vscode.window.showInformationMessage(
    `MCP definition storage scope is now ${scope.toUpperCase()}.`
  );
}

function refreshAllViews(app: AppContext): void {
  app.serverProvider.refresh();
  app.toolProvider.refresh();
}

async function runStoreAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    void vscode.window.showErrorMessage(String((error as Error)?.message || error));
  }
}
