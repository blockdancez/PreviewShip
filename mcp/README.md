# PreviewShip MCP Server

> Let AI coding agents publish HTML online, upload HTML files, and deploy static previews through MCP.

PreviewShip MCP gives Claude Code, Cursor, Windsurf, and any MCP-compatible client a native way to upload an HTML file to a website, host HTML online, deploy AI-generated pages, or publish a static build output folder as a shareable URL.

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
- `projectName` (optional) — Display project name. Defaults to directory name. PreviewShip automatically creates a deployment-safe hosting name.
- `excludePatterns` (optional) — Additional glob patterns to exclude.

**Important:** when `path` is a directory, it should be a static build artifact such as `dist`, `build`, `out`, or another folder containing `index.html` and browser assets. Ask the agent to run the framework build first. Do not deploy a raw source-code zip/folder with `package.json`, `src/`, and `node_modules` unless it is already static output.

**Example usage in conversation:**
> "Deploy this project to a preview"
> "Deploy the dist folder"
> "Deploy report.html and share the preview link"
> "Publish this ChatGPT HTML as a website URL"
> "Host page.html online and return the URL"
> "Build the app, then deploy the generated dist folder"
> "Help me deploy and share a preview link"

## HTML Publishing Guides

- [Upload HTML file to website](https://previewship.com/guides/upload-html-file-to-website)
- [HTML file hosting](https://previewship.com/guides/html-file-hosting)
- [Host HTML file online](https://previewship.com/guides/host-html-file-online)
- [Publish HTML file to web](https://previewship.com/guides/publish-html-file-to-web)
- [ChatGPT HTML to website](https://previewship.com/guides/chatgpt-html-to-website)
- [Claude HTML artifact to URL](https://previewship.com/guides/claude-html-artifact-to-url)

### `check_deployment`

Check deployment status.

**Parameters:**
- `deploymentId` (required) — Deployment ID from `deploy_preview`.

### `show_usage`

Show remaining deployment quota.

## Plans

| | Free | Pro Monthly | Pro Yearly |
|------|------|------------|------------|
| Price | $0 | $5.40/mo launch price | $50.40/yr launch price |
| Daily Deploys | 5 | 30 | 40 |
| Monthly Deploys | 20 | 200 | 350 |
| Preview Expiry | 3 days | 30 days | 365 days |
| PreviewShip Watermark | Included | Removed | Removed |

[View plans](https://previewship.com/billing)

## License

MIT
