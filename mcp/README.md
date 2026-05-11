# PreviewShip MCP Server

> Deploy previews from AI coding agents — Claude Code, Cursor, Windsurf, and any MCP-compatible client.

## Setup

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_your_key_here"
      }
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_your_key_here"
      }
    }
  }
}
```

## Get an API Key

1. Visit [PreviewShip Console](https://previewship.com)
2. Create an account and go to **API Keys**
3. Generate a new key (`ps_live_...`)

## Available Tools

### `deploy_preview`

Deploy a static website or single HTML file to a preview environment.

**Parameters:**
- `path` (optional) — Directory or single `.html` file to deploy. Defaults to current working directory.
- `projectName` (optional) — Project name. Defaults to directory name.
- `excludePatterns` (optional) — Additional glob patterns to exclude.

**Important:** when `path` is a directory, it should be a static build artifact such as `dist`, `build`, `out`, or another folder containing `index.html` and browser assets. Ask the agent to run the framework build first. Do not deploy a raw source-code zip/folder with `package.json`, `src/`, and `node_modules` unless it is already static output.

**Example usage in conversation:**
> "Deploy this project to a preview"
> "Deploy the dist folder"
> "Deploy report.html and share the preview link"
> "Build the app, then deploy the generated dist folder"
> "Help me deploy and share a preview link"

### `check_deployment`

Check deployment status.

**Parameters:**
- `deploymentId` (required) — Deployment ID from `deploy_preview`.

### `show_usage`

Show remaining deployment quota.

## Plans

| | Free | Pro Monthly | Pro Yearly |
|------|------|------------|------------|
| Price | $0 | $9/mo | $84/yr |
| Daily Deploys | 5 | 30 | 40 |
| Monthly Deploys | 20 | 200 | 350 |

[View plans](https://previewship.com/billing)

## License

MIT
