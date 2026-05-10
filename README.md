# MCP Controller Extension

VS Code extension for MCP server lifecycle management and configurable export.

## UI Structure

- Sidebar container: `MCP`
- Sub-views:
  - `Servers`: server list (edit/toggle/remove)
  - `Tools`: operation shortcuts (open studio/export/preview)
- Main editor area:
  - `MCP Studio` webview form for create/edit/preview

## Core Features

- Create/edit MCP servers in a form (not step-by-step prompt)
- Supported types:
  - `http`
  - `stream`
  - `uvx-fastmcp`
- Metadata support:
  - `description`
  - `tags`
- Toggle enabled/disabled
- Remove server
- Template preview command and in-studio preview
- Export enabled servers:
  - Claude Code default: JSON
  - Codex default: TOML

## Template Settings

- `mcpController.export.claudeCodeTemplate`
- `mcpController.export.codexTemplate`

Placeholders:

- `{{servers_json}}`
- `{{servers_toml}}`
- `{{target}}`

## Build

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension host.
