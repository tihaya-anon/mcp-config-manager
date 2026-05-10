import * as vscode from "vscode";
import { COMMANDS, DEFAULT_GROUP } from "./constants";
import { McpServer } from "./types";
import { McpStore } from "./store";

export class GroupItem extends vscode.TreeItem {
  constructor(public readonly groupName: string) {
    super(groupName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "mcpGroup";
  }
}

export class McpItem extends vscode.TreeItem {
  constructor(public readonly server: McpServer) {
    super(server.name, vscode.TreeItemCollapsibleState.None);

    this.description = `${server.type}`;
    const source = server.sourceScope ? ` [${server.sourceScope}]` : '';
    this.tooltip =
      (server.meta?.description || `${server.name} (${server.type})`) + source;
    this.iconPath = new vscode.ThemeIcon(
      server.enabled ? "circle-filled" : "circle-outline",
    );
    this.contextValue = server.enabled ? "mcpServerEnabled" : "mcpServerDisabled";
    this.command = {
      command: COMMANDS.toggleMcp,
      title: "Toggle MCP",
      arguments: [server],
    };
  }
}

export type ServerTreeNode = GroupItem | McpItem;

export class ServerProvider implements vscode.TreeDataProvider<ServerTreeNode> {
  private readonly treeChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.treeChangeEmitter.event;

  constructor(private readonly store: McpStore) {}

  refresh(): void {
    this.treeChangeEmitter.fire();
  }

  getTreeItem(element: ServerTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ServerTreeNode): ServerTreeNode[] {
    const servers = this.store.list();

    if (!element) {
      const groups = Array.from(
        new Set(
          servers.map((server) => server.meta?.group?.trim() || DEFAULT_GROUP),
        ),
      ).sort((a, b) => a.localeCompare(b));

      return groups.map((groupName) => new GroupItem(groupName));
    }

    if (element instanceof GroupItem) {
      return servers
        .filter(
          (server) =>
            (server.meta?.group?.trim() || DEFAULT_GROUP) === element.groupName,
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((server) => new McpItem(server));
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

export class ToolProvider implements vscode.TreeDataProvider<ToolItem> {
  private readonly treeChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.treeChangeEmitter.event;

  constructor(private readonly store: McpStore) {}

  refresh(): void {
    this.treeChangeEmitter.fire();
  }

  getTreeItem(element: ToolItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ToolItem[] {
    const scope = this.store.getDefinitionStorageScope();
    const scopeLabel = scope === 'workspace' ? 'Workspace' : 'User';
    return [
      new ToolItem("Open Studio", COMMANDS.openStudio, "layout"),
      new ToolItem("Add Server", COMMANDS.addMcp, "add"),
      new ToolItem("Refresh Servers", COMMANDS.refreshServers, "refresh"),
      new ToolItem(`Definition Scope: ${scopeLabel}`, COMMANDS.toggleDefinitionStorageScope, "database"),
      new ToolItem("Toggle Export Path Mode", COMMANDS.toggleExportPathMode, "settings-gear"),
      new ToolItem("Export Claude", COMMANDS.exportClaude, "export"),
      new ToolItem("Export Codex", COMMANDS.exportCodex, "export"),
      new ToolItem("Preview Template", COMMANDS.previewTemplate, "eye"),
    ];
  }
}
