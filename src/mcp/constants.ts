export const STORAGE_KEY = 'servers';
export const EXT_NS = 'mcpController';
export const DEFAULT_GROUP = 'default';

export const COMMANDS = {
  openStudio: 'mcpController.openStudio',
  addMcp: 'mcpController.addMcp',
  editMcp: 'mcpController.editMcp',
  toggleMcp: 'mcpController.toggleMcp',
  removeMcp: 'mcpController.removeMcp',
  exportClaude: 'mcpController.exportClaudeCode',
  exportCodex: 'mcpController.exportCodex',
  previewTemplate: 'mcpController.previewTemplate'
} as const;
