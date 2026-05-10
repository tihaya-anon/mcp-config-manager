import * as vscode from 'vscode';
import { buildPreviewText } from './exporter';
import { parseServerPayload } from './serialization';
import { McpStore } from './store';
import { ExportTarget, McpServer } from './types';
import { ServerProvider } from './tree';
import { buildStudioHtml } from './studio-template';

export function createStudioController(
  store: McpStore,
  serverProvider: ServerProvider
): { openStudioPanel: (editingId?: string) => void } {
  let studioPanel: vscode.WebviewPanel | undefined;

  const openStudioPanel = (editingId?: string): void => {
    if (!studioPanel) {
      studioPanel = vscode.window.createWebviewPanel(
        'mcpStudio',
        'MCP Studio',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      studioPanel.onDidDispose(() => {
        studioPanel = undefined;
      });

      studioPanel.webview.onDidReceiveMessage(async (msg: { type: string; [key: string]: unknown }) => {
        if (msg.type === 'requestData') {
          studioPanel?.webview.postMessage({
            type: 'data',
            servers: store.list(),
            editingId: msg.editingId ?? null
          });
          return;
        }

        if (msg.type === 'save') {
          const parsed = parseServerPayload(msg.payload);

          if (!parsed.ok) {
            void vscode.window.showErrorMessage(parsed.error);
            return;
          }

          try {
            await store.upsert(parsed.server);
            serverProvider.refresh();
            studioPanel?.webview.postMessage({ type: 'saved', id: parsed.server.id });
          } catch (error) {
            void vscode.window.showErrorMessage(String((error as Error)?.message || error));
          }
          return;
        }

        if (msg.type === 'preview') {
          const target: ExportTarget = msg.target === 'codex' ? 'codex' : 'claude-code';
          const preview = buildPreviewText(store.list(), target);
          studioPanel?.webview.postMessage({ type: 'previewResult', text: preview });
        }
      });
    }

    studioPanel.reveal(vscode.ViewColumn.One);
    const editingJson = JSON.stringify(editingId || null);
    studioPanel.webview.html = buildStudioHtml(String(Date.now()), editingJson);
  };

  return { openStudioPanel };
}

export async function previewTemplate(servers: McpServer[]): Promise<void> {
  const target = await vscode.window.showQuickPick(['claude-code', 'codex'], {
    placeHolder: 'Preview target'
  });

  if (!target) {
    return;
  }

  const previewTarget: ExportTarget = target === 'codex' ? 'codex' : 'claude-code';
  const text = buildPreviewText(servers, previewTarget);
  const document = await vscode.workspace.openTextDocument({
    content: text,
    language: previewTarget === 'codex' ? 'toml' : 'json'
  });

  await vscode.window.showTextDocument(document, { preview: false });
}
