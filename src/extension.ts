import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'mcpController.helloWorld',
    () => {
      void vscode.window.showInformationMessage('Hello World from MCP Controller Extension!');
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
