import * as vscode from 'vscode';
import { COMMANDS } from './mcp/constants';
import { exportToFile } from './mcp/exporter';
import { McpStore } from './mcp/store';
import { createStudioController, previewTemplate } from './mcp/studio';
import { McpItem, ServerProvider, ToolProvider } from './mcp/tree';
import { McpServer } from './mcp/types';

export function activate(context: vscode.ExtensionContext): void {
  const store = new McpStore(context);
  const serverProvider = new ServerProvider(store);
  const studio = createStudioController(store, serverProvider);

  vscode.window.createTreeView('mcpController.servers', {
    treeDataProvider: serverProvider
  });

  vscode.window.createTreeView('mcpController.tools', {
    treeDataProvider: new ToolProvider()
  });

  registerCommands(context, store, serverProvider, studio.openStudioPanel);
}

export function deactivate(): void {}

function registerCommands(
  context: vscode.ExtensionContext,
  store: McpStore,
  serverProvider: ServerProvider,
  openStudioPanel: (editingId?: string) => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openStudio, () => openStudioPanel())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.addMcp, () => openStudioPanel())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.editMcp, (item?: McpServer | McpItem) => {
      const server = item instanceof McpItem ? item.server : item;
      openStudioPanel(server?.id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.toggleMcp, async (item?: McpServer | McpItem) => {
      await toggleServer(store, serverProvider, item, 'Select a server to toggle');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.toggleMcpOn, async (item?: McpServer | McpItem) => {
      await setServerEnabled(store, serverProvider, item, true);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.toggleMcpOff, async (item?: McpServer | McpItem) => {
      await setServerEnabled(store, serverProvider, item, false);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.removeMcp, async (item?: McpServer | McpItem) => {
      const server = await resolveServerSelection(store, item, 'Select a server to remove');

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

      await store.remove(server.id);
      serverProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.exportClaude, async () => {
      await exportToFile(store.list(), 'claude-code');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.exportCodex, async () => {
      await exportToFile(store.list(), 'codex');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.previewTemplate, async () => {
      await previewTemplate(store.list());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.toggleWriteToWorkspace, async () => {
      const config = vscode.workspace.getConfiguration('mcpController');
      const current = config.get<boolean>('export.writeToWorkspace', true);
      const target = !current;

      await config.update(
        'export.writeToWorkspace',
        target,
        vscode.ConfigurationTarget.Workspace
      );

      void vscode.window.showInformationMessage(
        `writeToWorkspace is now ${target ? 'ON' : 'OFF'} (workspace setting).`
      );
    })
  );
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

async function toggleServer(
  store: McpStore,
  serverProvider: ServerProvider,
  item: McpServer | McpItem | undefined,
  placeHolder: string
): Promise<void> {
  const server = await resolveServerSelection(store, item, placeHolder);

  if (!server) {
    return;
  }

  server.enabled = !server.enabled;
  await store.upsert(server);
  serverProvider.refresh();
}

async function setServerEnabled(
  store: McpStore,
  serverProvider: ServerProvider,
  item: McpServer | McpItem | undefined,
  enabled: boolean
): Promise<void> {
  const server = await resolveServerSelection(store, item, 'Select a server');

  if (!server || server.enabled === enabled) {
    return;
  }

  server.enabled = enabled;
  await store.upsert(server);
  serverProvider.refresh();
}
