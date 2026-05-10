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
      const server = await resolveServerSelection(store, item, 'Select a server to toggle');

      if (!server) {
        return;
      }

      server.enabled = !server.enabled;
      await store.upsert(server);
      serverProvider.refresh();
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
