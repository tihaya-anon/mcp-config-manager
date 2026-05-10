export const STORAGE_KEY = 'serverStates';
export const EXT_NS = 'mcpController';
export const DEFAULT_GROUP = 'default';

export const COMMANDS = {
  openStudio: 'mcpController.openStudio',
  addMcp: 'mcpController.addMcp',
  editMcp: 'mcpController.editMcp',
  toggleMcp: 'mcpController.toggleMcp',
  toggleMcpOn: 'mcpController.toggleMcpOn',
  toggleMcpOff: 'mcpController.toggleMcpOff',
  removeMcp: 'mcpController.removeMcp',
  exportClaude: 'mcpController.exportClaudeCode',
  exportCodex: 'mcpController.exportCodex',
  previewTemplate: 'mcpController.previewTemplate',
  toggleExportPathMode: 'mcpController.toggleExportPathMode',
  toggleDefinitionStorageScope: 'mcpController.toggleDefinitionStorageScope',
  refreshServers: 'mcpController.refreshServers'
} as const;
