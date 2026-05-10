export const STORAGE_KEY = 'serverStates';
export const EXT_NS = 'mcpConfigManager';
export const DEFAULT_GROUP = 'default';

export const COMMANDS = {
  openStudio: 'mcpConfigManager.openStudio',
  addMcp: 'mcpConfigManager.addMcp',
  editMcp: 'mcpConfigManager.editMcp',
  toggleMcp: 'mcpConfigManager.toggleMcp',
  toggleMcpOn: 'mcpConfigManager.toggleMcpOn',
  toggleMcpOff: 'mcpConfigManager.toggleMcpOff',
  removeMcp: 'mcpConfigManager.removeMcp',
  exportClaude: 'mcpConfigManager.exportClaudeCode',
  exportCodex: 'mcpConfigManager.exportCodex',
  previewTemplate: 'mcpConfigManager.previewTemplate',
  toggleExportPathMode: 'mcpConfigManager.toggleExportPathMode',
  toggleDefinitionStorageScope: 'mcpConfigManager.toggleDefinitionStorageScope',
  refreshServers: 'mcpConfigManager.refreshServers'
} as const;
