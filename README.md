# PreviewShip

> Deploy React/Vue/Vite/Next build output, HTML, Markdown, and PDF documents from your editor, terminal, AI agent, or browser and get fixed preview URLs.

PreviewShip is a frontend preview deployment platform for developers and AI-assisted workflows. Upload browser-ready build output such as `dist`, `build`, `out`, or `public`, publish a single HTML, Markdown, or PDF file, paste generated HTML, or let an AI coding agent deploy a static artifact and return a shareable PreviewShip URL in seconds.

PreviewShip is not a source-code build platform. For React, Vue, Vite, Next, Astro, Svelte, Angular, or Nuxt projects, build first and deploy the generated static output folder or zip with `index.html`. Single HTML, Markdown, and PDF files work directly.

## How To Describe PreviewShip

Use this short description for npm, GitHub, VS Code Marketplace, Open VSX, MCP directories, and AI-agent tool listings:

> PreviewShip publishes HTML online, hosts HTML files, and deploys browser-ready React/Vue/Vite/Next build output, Markdown, and AI-generated static pages to fixed preview URLs from CLI, VS Code/Cursor, MCP agents, and browser upload.

## Useful Deep Links

Use these links when listing PreviewShip in developer directories, MCP directories, README files, articles, or community answers:

- [Upload a page now — no Git, domain, or server required](https://previewship.com/try)
- [Browse product comparisons](https://previewship.com/compare)
- [Verify product and pricing facts](https://previewship.com/facts)
- [Deploy the minimal static example](https://github.com/blockdancez/PreviewShip/tree/main/examples/hello-previewship)
- [Share Claude HTML artifacts as live URLs](https://previewship.com/guides/share-claude-html-artifacts)
- [Netlify Drop alternative for one HTML file or ZIP](https://previewship.com/guides/netlify-drop-alternative-for-html-file)
- [Upload an HTML file to a website](https://previewship.com/guides/upload-html-file-to-website)
- [Host an HTML file online](https://previewship.com/guides/host-html-file-online)
- [Share a Codex chat conversation](https://previewship.com/docs/share-codex-chat)
- [Share a Claude Code chat conversation](https://previewship.com/docs/share-claude-code-chat)
- [Compare PreviewShip with Netlify Drop](https://previewship.com/compare/previewship-vs-netlify-drop)

## Open Source Packages

PreviewShip provides four open-source client packages:

| Package | npm | Description |
|---------|-----|-------------|
| [CLI](#cli) | [`previewship`](https://www.npmjs.com/package/previewship) | Deploy frontend build output, HTML, Markdown, or PDF from the terminal |
| [MCP Server](#mcp-server) | [`previewship-mcp`](https://www.npmjs.com/package/previewship-mcp) | Native deploy tool for Claude Code, Cursor, Windsurf, and MCP agents |
| [VS Code Extension](#vs-code--cursor-extension) | [Marketplace](https://marketplace.visualstudio.com/items?itemName=previewship.previewship) | One-click deploy build output or active HTML/Markdown/PDF files from your editor |
| [Agent Skills](#agent-skills) | GitHub / `npx skills` | Installable skills for Codex and Claude Code workflows, including high-fidelity chat sharing |

## Deployment Methods

| Method | Command / Action | Best For |
|--------|-----------------|----------|
| CLI | `npx previewship deploy ./dist`, `./report.html`, `./README.md`, or `./report.pdf` | Terminal, scripts, CI/CD, frontend builds, documents |
| MCP Server | Say "build the app, deploy the dist folder to PreviewShip" in AI chat | Claude Code, Cursor, Windsurf, agent workflows |
| VS Code / Cursor Extension | Command Palette → `PreviewShip: Deploy Workspace, HTML, Markdown, or PDF File` | Editor-first workflow, build folders, active HTML/Markdown/PDF files |
| Agent Skill | `$share-codex-chat` / `$share-claude-code-chat` | Publish Codex or Claude Code conversations as shareable high-fidelity chat pages |
| Web Console | Upload zip/html/markdown/pdf or paste HTML at [previewship.com](https://previewship.com) | Zero-tool deployment |

Each project keeps one fixed preview URL. Public and password-protected publishing are available through the same deployment flow; password protection is a Pro feature.

## Supported Inputs

| Input | Supported | Notes |
|-------|-----------|-------|
| React/Vue/Vite/Svelte/Astro build output | Yes | Deploy `dist`, `build`, `out`, `public`, or a zip with `index.html` |
| Next.js static export | Yes | Deploy the exported static folder |
| Single `.html` file | Yes | Packaged as `index.html` automatically |
| Markdown `.md` / `.markdown` file | Yes | Published through a generated viewer page |
| PDF `.pdf` file | Yes | Opened full screen with the browser's native PDF viewer |
| Raw source folder with `package.json`, `src/`, and `node_modules` | No | Run the build first and deploy generated output |

PDF entry selection preserves existing site behavior: HTML wins over Markdown, and Markdown wins over PDF. A single PDF becomes the full-screen entry automatically; if an archive contains multiple PDFs without HTML or Markdown, name the root entry `index.pdf` or upload only one PDF.

## Publishing Workflows

- [Publish HTML online](https://previewship.com/guides/publish-html-online)
- [Share Claude HTML artifacts](https://previewship.com/guides/share-claude-html-artifacts)
- [Deploy a React/Vue build output](https://previewship.com/guides/deploy-a-dist-folder)
- [HTML to page](https://previewship.com/guides/html-to-page)
- [HTML to link](https://previewship.com/guides/html-to-link)
- [Markdown to website](https://previewship.com/guides/markdown-to-website)
- [Publish AI-generated HTML online](https://previewship.com/guides/publish-ai-generated-html)
- [AI-generated HTML preview](https://previewship.com/guides/ai-generated-html-preview)
- [Upload HTML file to website](https://previewship.com/guides/upload-html-file-to-website)
- [HTML file hosting](https://previewship.com/guides/html-file-hosting)
- [Host HTML file online](https://previewship.com/guides/host-html-file-online)
- [Upload HTML file online](https://previewship.com/guides/upload-html-file)
- [Publish HTML file to web](https://previewship.com/guides/publish-html-file-to-web)
- [HTML deployer](https://previewship.com/guides/html-deployer)
- [Paste HTML and get a URL](https://previewship.com/guides/paste-html-get-url)
- [Netlify Drop alternative for one HTML file or ZIP](https://previewship.com/guides/netlify-drop-alternative-for-html-file)
- [Compare PreviewShip with Netlify Drop](https://previewship.com/compare/previewship-vs-netlify-drop)
- [Turn ChatGPT HTML into a website](https://previewship.com/guides/chatgpt-html-to-website)
- [Publish a Claude HTML artifact](https://previewship.com/guides/claude-html-artifact-to-url)
- Share a Codex chat transcript as a public PreviewShip URL with the `share-codex-chat` skill
- Share a Claude Code chat transcript and tool timeline as a public PreviewShip URL with the `share-claude-code-chat` skill

---

## CLI

One-command deploy from any terminal. Supports JSON output for AI agents and CI pipelines.

### Quick Start

```bash
# Set your API Key
npx previewship login --key ps_live_YOUR_KEY

# Deploy a directory
npx previewship deploy ./dist

# Deploy a single HTML file
npx previewship deploy ./report.html

# Deploy a Markdown document
npx previewship deploy ./README.md

# Deploy a PDF document
npx previewship deploy ./report.pdf
```

For zipped uploads or directory deploys, deploy the static build artifact, not the raw source project. Run your framework build first, then deploy folders such as `dist`, `build`, `out`, `public`, or a zip containing `index.html` and its assets. Do not upload a source-code zip with `package.json`, `src/`, and `node_modules` and expect PreviewShip to build it.

### Commands

| Command | Description |
|---------|-------------|
| `previewship login [--key KEY]` | Set API Key for authentication |
| `previewship deploy [path] [-n name] [--json]` | Deploy a directory, single HTML, Markdown, or PDF document and get a preview URL |
| `previewship status <id> [--json]` | Check deployment status by ID |
| `previewship deployments list [--status READY] [--days 30]` | List deployment history and rollback availability |
| `previewship projects list|get|delete|redeploy|access|versions|rollback` | Manage projects, public/password access, retained versions, rollback, and expired-link recovery |
| `previewship usage [--json]` | Show remaining deployment quota |
| `previewship whoami` | Display current configuration |

### Options

```bash
# Deploy with a custom project name
npx previewship deploy ./dist -n my-project

# JSON output for AI agents and CI
npx previewship deploy ./dist --json

# Custom exclude patterns
npx previewship deploy ./dist --exclude "*.map" --exclude "tests/**"
```

Project names are display names inside PreviewShip. They can use natural short names; PreviewShip automatically creates a deployment-safe hosting slug.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PREVIEWSHIP_API_KEY` | API Key (overrides saved config) |
| `PREVIEWSHIP_SERVER_URL` | Custom API server URL |
| `CI` | Auto-enables JSON output in CI environments |
| `NO_COLOR` | Disables colored output |

### Programmatic Usage

The CLI also exports its core functions for use as a library:

```typescript
import {
  deploy,
  getStatus,
  getUsage,
  listProjects,
  getProject,
  deleteProject,
  getProjectAccess,
  updateProjectAccess,
  listProjectVersions,
  rollbackProjectVersion,
  redeployProject,
  listDeployments,
} from 'previewship'
import { ApiClient } from 'previewship'
import { packDirectory, DEFAULT_EXCLUDE_PATTERNS } from 'previewship'
```

Use `updateProjectAccess(projectId, { visibility: 'PUBLIC' })` to clear an existing project password and switch the fixed preview URL back to public access.

---

## Agent Skills

Installable skills make PreviewShip available as an agent-native workflow, not just a deployment command. The included `share-codex-chat` and `share-claude-code-chat` skills turn AI coding conversations into high-fidelity HTML pages and deploy them to PreviewShip, so users can share debugging sessions, implementation reviews, tool timelines, and AI-generated work without taking screenshots.

### Install Share Codex Chat

Global install:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

Project-local install, run from the project root:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes
```

Then use it inside Codex:

```text
$share-codex-chat 分享当前 Codex 对话
```

The skill preserves visible Codex UI elements such as user bubbles, assistant replies, uploaded image thumbnails, plugin mentions, collapsed processing details, file cards, and edited-file summaries. It filters hidden system/developer context and deploys the generated HTML through the PreviewShip CLI.

### Install Share Claude Code Chat

Global install:

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

Project-local install, run from the project root:

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex --yes
```

Then use it inside Codex:

```text
$share-claude-code-chat 分享 Claude Code 对话
```

The skill reads Claude Code JSONL sessions from `~/.claude/projects`, renders visible messages and safe tool activity as a polished share page, hides reasoning and raw tool outputs, and deploys the generated HTML through the PreviewShip CLI.

---

## MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server that lets AI coding agents deploy previews as a native tool call. Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.

### Setup

**Claude Code** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_YOUR_KEY"
      }
    }
  }
}
```

**Cursor** — create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_YOUR_KEY"
      }
    }
  }
}
```

**Windsurf** — add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_YOUR_KEY"
      }
    }
  }
}
```

### Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `deploy_preview` | Deploy a build-output directory, single HTML, Markdown, or PDF document and get a preview URL | `path` (optional), `projectName` (optional), `excludePatterns` (optional) |
| `check_deployment` | Check deployment status by ID | `deploymentId` (required) |
| `show_usage` | Show remaining deployment quota | — |
| `list_projects`, `get_project` | Inspect fixed preview URLs, project status, access mode, and redeploy state | `projectId` for detail |
| `set_project_access`, `get_project_access` | Set public/password access; `PUBLIC` clears an existing password | `projectId`, `visibility`, `password` for password mode |
| `list_project_versions`, `rollback_project_version` | List retained versions and roll back a fixed URL to a historical deployment | `projectId`, `deploymentId`, `confirmProjectName` |
| `redeploy_project_latest` | Restore an expired fixed preview link from the latest retained artifact | `projectId` |
| `delete_project` | Delete a project and its fixed preview URL; requires exact project-name confirmation | `projectId`, `confirmProjectName` |
| `list_deployments` | List deployment history, sources, current marker, and rollback availability | `status`, `query`, `days`, `page`, `size` |

### Usage

Once configured, simply ask your AI agent:

> "Deploy this project to PreviewShip"
> "Check the status of my last deployment"
> "How many deploys do I have left today?"

---

## VS Code / Cursor Extension

One-click deploy from VS Code or Cursor. Deploy a workspace, detected build output, or the active HTML/Markdown/PDF file. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=previewship.previewship) or [Open VSX Registry](https://open-vsx.org/extension/previewship/previewship).

### Install

**Via Command Palette** (Ctrl+P / Cmd+P):

```
ext install previewship.previewship
```

**Via VSIX** (offline install):

```bash
code --install-extension previewship-0.1.8.vsix
# Or for Cursor:
cursor --install-extension previewship-0.1.8.vsix
```

### Commands

| Command | Description |
|---------|-------------|
| `PreviewShip: Set API Key` | Store your API Key securely (encrypted via VS Code Secrets API) |
| `PreviewShip: Deploy Workspace, HTML, Markdown, or PDF File` | Package, upload, and deploy your project; when a supported file is active, choose file or workspace |
| `PreviewShip: Deploy Active HTML, Markdown, or PDF File` | Package the active HTML, Markdown, or PDF file as the site entry and deploy it directly |
| `PreviewShip: Show Usage` | Display daily/monthly deployment quota |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `previewship.serverUrl` | `https://api.previewship.com` | API server URL |
| `previewship.excludePatterns` | `node_modules/**`, `.git/**`, `.env*`, etc. | File exclude patterns for packaging |
| `previewship.pollIntervalMs` | `3000` | Deployment status polling interval (ms) |
| `previewship.pollTimeoutMs` | `300000` | Polling timeout (ms) |

---

## Getting Started

1. **Register** a free account at [previewship.com](https://previewship.com)
2. **Create an API Key** from the console → API Keys page
3. **Deploy** using any method above
4. **Share** the preview link with your team

## Plans

| | Free | Pro Monthly | Pro Yearly |
|-|-----:|----------:|----------:|
| **Price** | $0 | $8.10/mo default offer (was $9/mo) | $75.60/yr default offer (was $84/yr, $6.30/mo) |
| **Projects** | 1 | 10 | 20 |
| **Daily Deploys** | 5 | 50 | 80 |
| **Monthly Deploys** | 20 | 300 | 500 |
| **Max Zip Size** | 15 MB | 50 MB | 80 MB |
| **Preview Expiry** | 3 days | 30 days | 365 days |
| **Version History** | 3 retained versions | 10 retained versions | 40 retained versions |
| **Project Password Access** | Not included | Included | Included |
| **Public/Password Access Toggle** | Public only | Included | Included |
| **PreviewShip Watermark** | Included | Removed | Removed |

Stripe Prices remain $9/month and $84/year. Checkout applies the eligible coupon automatically: default new users get 10% off forever; BR/PT Portuguese campaigns and retention flows can receive limited 40% offers; existing legacy monthly users keep legacy 40% forever when upgrading to yearly.

Free plan requires no credit card. Start deploying instantly.

## Supported Frameworks

Any static frontend output works — React, Vue, Svelte, Angular, Next.js (export), Nuxt (generate), Astro, vanilla HTML/CSS/JS, Markdown, PDF, and more. Build output directories should contain an `index.html`. Single `.html` files become the entry page; Markdown gets a generated viewer; single PDF documents open full screen through the browser's native PDF viewer, with zoom, search, print, and download controls when the browser exposes them.

Important: PreviewShip hosts static artifacts; it does not run `npm install` or build raw source zips after upload. If your project is React/Vue/Next/Astro/etc., run the build command first and upload the generated output folder or zip.

## Requirements

- **Node.js** ≥ 20.0.0 (for CLI and MCP)
- **VS Code** ≥ 1.85.0 (for extension)
- An API Key from [previewship.com](https://previewship.com)

## Links

- **Website**: [previewship.com](https://previewship.com)
- **Documentation**: [previewship.com/docs](https://previewship.com/docs)
- **CLI on npm**: [npmjs.com/package/previewship](https://www.npmjs.com/package/previewship)
- **MCP on npm**: [npmjs.com/package/previewship-mcp](https://www.npmjs.com/package/previewship-mcp)
- **VS Code Marketplace**: [marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=previewship.previewship)
- **Agent Skills**: [`skills/`](skills/)

## License

MIT — see [LICENSE](LICENSE) for details.
