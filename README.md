# MCP Config Manager

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
  - Paths are configurable via:
    - `mcpConfigManager.export.claudeCodePath`
    - `mcpConfigManager.export.codexPath`
- Two-layer config model:
  - Definitions are stored in workspace `settings.json` via `mcpConfigManager.servers` (trackable in git)
  - Runtime enable/disable state is stored in extension local state (not tracked)

## Template Engine

Templates are fully customizable. Export now renders **only from template**.

### How to configure templates

- Configure templates by editing string settings:
  - `mcpConfigManager.export.claudeCodeTemplate`
  - `mcpConfigManager.export.codexTemplate`
- The extension currently reads template **strings directly from settings**.
- External template file path loading (for example, `./templates/codex.toml.hbs`) is **not supported** right now.
- Recommended workflow:
  - Keep your template text in workspace `.vscode/settings.json` for portability.
  - Or maintain a template file in repo and copy/paste its content into the setting when updating.

Example (`.vscode/settings.json`):

```json
{
  "mcpConfigManager.export.codexTemplate": "# Codex MCP config\\n{{#each servers}}[mcp_servers.{{tomlKey name}}]\\n{{#if resolved.command}}command = {{toml resolved.command}}\\n{{/if}}{{/each}}"
}
```

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

### 2) Stream (stdio) example: Time server via uvx

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
    "command": "uvx",
    "args": ["mcp-server-time"],
    "env": {}
  }
}
```

Expected Codex TOML fragment (`stream` maps to stdio command form):

```toml
[mcp_servers.time]
command = "uvx"
args = ["mcp-server-time"]
env = {  }
```

### 3) UVX FastMCP example: AWS Knowledge MCP (remote HTTP proxied to stdio)

Source:
- AWS Knowledge MCP official README (`fastmcp` proxy mode)

Input server in Studio:

```json
{
  "id": "real-uvx-1",
  "name": "awsKnowledge",
  "type": "uvx-fastmcp",
  "enabled": true,
  "meta": { "group": "remote", "description": "AWS Knowledge MCP via fastmcp proxy" },
  "uvxFastmcp": {
    "module": "https://knowledge-mcp.global.api.aws",
    "args": [],
    "env": {}
  }
}
```

Expected Codex TOML fragment:

```toml
[mcp_servers.awsKnowledge]
command = "uvx"
args = ["fastmcp", "run", "https://knowledge-mcp.global.api.aws"]
env = {  }
```

Note:
- The `uvx-fastmcp` mapping in this extension is `uvx fastmcp run <module> ...args`.
- Use `uvx-fastmcp` for FastMCP-style proxy/runtime scenarios.
- Use `stream` for plain stdio MCP servers like `mcp-server-time`.
- For this AWS example, internet access is required.
- If a server fails during initialize handshake, verify command directly in terminal (`uvx mcp-server-time` or `uvx fastmcp run https://knowledge-mcp.global.api.aws`).

## Definition Scope

- `mcpConfigManager.definitionStorageScope` controls where definition data is written:
  - `workspace`: write `mcpConfigManager.servers` to workspace `settings.json`
  - `user`: write `mcpConfigManager.servers` to user settings
- Read behavior is merged from both sources:
  - user definitions are loaded first
  - workspace definitions override user definitions when `id` is the same
- Runtime `enabled/disabled` state is stored in extension local state (`globalState`) and is not tracked in git.
- `Tools` view shows current scope and provides toggle action.

## Build

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension host.
