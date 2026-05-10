import * as vscode from 'vscode';
import { STORAGE_KEY } from './constants';
import { McpServer } from './types';

export class McpStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): McpServer[] {
    return this.context.globalState.get<McpServer[]>(STORAGE_KEY, []);
  }

  async save(list: McpServer[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, list);
  }

  async upsert(server: McpServer): Promise<void> {
    const list = this.list();
    const index = list.findIndex((item) => item.id === server.id);

    if (index >= 0) {
      list[index] = server;
    } else {
      list.push(server);
    }

    await this.save(list);
  }

  async remove(id: string): Promise<void> {
    await this.save(this.list().filter((server) => server.id !== id));
  }
}
