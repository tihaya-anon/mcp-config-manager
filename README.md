# MCP Controller Extension

VS Code extension for MCP server lifecycle management and configurable export.

## UI Structure

- Sidebar container: `MCP`
- Sub-views:
  - `Servers`: server list (toggle/edit/remove)
  - `Tools`: operation shortcuts (open studio/export/preview/settings toggle)
- Main editor area:
  - `MCP Studio` webview form for create/edit/preview

## Core Features

- Create/edit MCP servers in a form
- Supported types:
  - `http`
  - `stream`
  - `uvx-fastmcp`
- Metadata support:
  - `description`
  - `group`
- Toggle enabled/disabled
- Remove server
- Template preview command and in-studio preview
- Export enabled servers:
  - Claude Code default path: `.mcp.json`
  - Codex default path: `.codex/config.toml`

## Template Engine

Templates are fully customizable. Export now renders **only from template**.

### Context fields

All enabled servers are injected as full `McpServer` objects plus resolved target config:

- `servers`: `Array<McpServer & { resolved: object }>`
- `servers_by_name`: `{ [name: string]: McpServer & { resolved: object } }`
- `target`: `claude-code | codex`
- `servers_raw_json`: JSON string of `servers`
- `servers_by_name_json`: JSON string of `servers_by_name`

### Template syntax

- Variable: `{{path.to.value}}`
- Loop: `{{#each servers}} ... {{/each}}`
- Condition: `{{#if resolved.env}} ... {{/if}}`
- Helpers:
  - `{{json path}}`
  - `{{toml path}}`
  - `{{tomlKey path}}`

## Default Templates

### Claude Code default template

```text
{
  "mcpServers": {{json servers_by_name}}
}
```

### Codex default template

```text
# Codex MCP config
{{#each servers}}[mcp_servers.{{tomlKey name}}]
{{#if resolved.type}}type = {{toml resolved.type}}
{{/if}}{{#if resolved.url}}url = {{toml resolved.url}}
{{/if}}{{#if resolved.command}}command = {{toml resolved.command}}
{{/if}}{{#if resolved.args}}args = {{toml resolved.args}}
{{/if}}{{#if resolved.headers}}headers = {{toml resolved.headers}}
{{/if}}{{#if resolved.env}}env = {{toml resolved.env}}
{{/if}}
{{/each}}
```

## Settings

- `mcpController.export.claudeCodeTemplate`
- `mcpController.export.codexTemplate`
- `mcpController.export.writeToWorkspace`

## Build

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension host.
