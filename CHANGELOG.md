# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2026-05-10

### Added
- Marketplace-ready screenshots referenced in README.
- Quick-bootstrap MCP server examples for settings (`http`, `stream`, `uvx-fastmcp`).
- MIT LICENSE and release metadata for marketplace compliance.

### Changed
- Publisher set to `chihayaanon` for release publishing.
- Extension icon now uses generated PNG (`resources/icon.png`) to satisfy marketplace icon requirements.
- Build pipeline now generates icon from `resources/brand.svg` before compile.
- README improved with screenshot meanings and clearer template/export guidance.
- `activationEvents` simplified to empty array (`[]`) to use contribution-based auto activation.

## [0.2.1] - 2026-05-10

### Added
- Group-level batch actions in Servers tree: start all, stop all, remove all, rename group.
- Configurable export paths:
  - `mcpConfigManager.export.claudeCodePath`
  - `mcpConfigManager.export.codexPath`
- Marketplace release assets:
  - `LICENSE` (MIT)
  - screenshots under `resources/screenshots/`
- Build-time icon generation from `resources/brand.svg` to `resources/icon.png` (128x128).

### Changed
- Studio webview split into standalone files for maintainability:
  - `src/mcp/studio-webview.html`
  - `src/mcp/studio-webview.css`
  - `src/mcp/studio-webview.js`
- Webview template placeholders switched to token form (`__NONCE__`, etc.) to avoid editor/template lint noise.
- README restructured for Marketplace readability and screenshot guidance.
- Preview naming unified to **Preview Template**.
- Tree item UX adjusted: server row no longer toggles directly on row click.

### Fixed
- Custom select alignment and preview/paste toolbar layout consistency in Studio.
- Disabled input visual feedback (`not-allowed` cursor + reduced opacity).
- Group context operations no longer mixed with server-only actions.
