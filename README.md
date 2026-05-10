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
- Two-layer config model:
  - Definitions are stored in workspace `settings.json` via `mcpController.servers` (trackable in git)
  - Runtime enable/disable state is stored in extension local state (not tracked)

## Template Engine

Templates are fully customizable. Export now renders **only from template**.

### Context fields

All enabled servers are injected as full `McpServer` objects plus resolved target config:

- `servers`: `Array<McpServer & { resolved: object }>`
- `servers_by_name`: `{ [name: string]: McpServer & { resolved: object } }`
- `servers_resolved_by_name`: `{ [name: string]: resolvedConfig }`
- `target`: `claude-code | codex`
- `servers_raw_json`: JSON string of `servers`
- `servers_by_name_json`: JSON string of `servers_by_name`
- `servers_resolved_by_name_json`: JSON string of `servers_resolved_by_name`

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
  "mcpServers": {{json servers_resolved_by_name}}
}
```

### Codex default template

```text
# Codex MCP config
{{#each servers}}[mcp_servers.{{tomlKey name}}]
{{#if resolved.url}}url = {{toml resolved.url}}
{{/if}}{{#if resolved.headers}}http_headers = {{toml resolved.headers}}
{{/if}}{{#if resolved.command}}command = {{toml resolved.command}}
{{/if}}{{#if resolved.args}}args = {{toml resolved.args}}
{{/if}}{{#if resolved.env}}env = {{toml resolved.env}}
{{/if}}
{{/each}}
```

## Validation Examples (Real MCP Servers)

These examples use real MCP servers from official docs/repos, so you can export and then open Codex/Claude Code to verify directly.

### 1) HTTP example: OpenAI Docs MCP

Source:
- OpenAI Docs MCP server URL `https://developers.openai.com/mcp` (OpenAI docs)

Input server in Studio:

```json
{
  "id": "real-http-1",
  "name": "openaiDeveloperDocs",
  "type": "http",
  "enabled": true,
  "meta": { "group": "remote", "description": "OpenAI Docs MCP" },
  "http": {
    "url": "https://developers.openai.com/mcp"
  }
}
```

Expected Codex TOML fragment:

```toml
[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
```

### 2) Stream (stdio) example: Time server via npx

Source:
- `@modelcontextprotocol/server-time` from Model Context Protocol servers ecosystem

Input server in Studio:

```json
{
  "id": "real-stream-1",
  "name": "time",
  "type": "stream",
  "enabled": true,
  "meta": { "group": "local", "description": "MCP time server" },
  "stream": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-time"],
    "env": {}
  }
}
```

Expected Codex TOML fragment (`stream` maps to stdio command form):

```toml
[mcp_servers.time]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-time"]
env = {  }
```

### 3) UVX FastMCP-style local example: Fetch server via uvx

Source:
- `mcp-server-fetch` via `uvx` (no local path required)

Input server in Studio:

```json
{
  "id": "real-uvx-1",
  "name": "fetch",
  "type": "uvx-fastmcp",
  "enabled": true,
  "meta": { "group": "local", "description": "MCP fetch server" },
  "uvxFastmcp": {
    "module": "mcp-server-fetch",
    "args": [],
    "env": {}
  }
}
```

Expected Codex TOML fragment:

```toml
[mcp_servers.fetch]
command = "uvx"
args = ["fastmcp", "run", "mcp-server-fetch"]
env = {  }
```

Note:
- The `uvx-fastmcp` mapping in this extension is `uvx fastmcp run <module> ...args`.
- If your installed server expects plain `uvx mcp-server-fetch ...`, use `type=stream` with `command=uvx` and `args=["mcp-server-fetch"]`.

## Definition Scope

- `mcpController.definitionStorageScope` controls where definition data is written:
  - `workspace`: write `mcpController.servers` to workspace `settings.json`
  - `user`: write `mcpController.servers` to user settings
- Runtime `enabled/disabled` state is stored in extension local state (`globalState`) and is not tracked in git.
- `Tools` view shows current scope and provides toggle action.

## Build

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension host.
