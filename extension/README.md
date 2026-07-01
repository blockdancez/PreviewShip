# PreviewShip - VS Code / Cursor Extension

> Publish HTML online, host HTML files, deploy React/Vue/Vite/Next build output, and publish Markdown from VS Code or Cursor to fixed PreviewShip preview URLs.

PreviewShip lets you publish browser-ready frontend artifacts from your editor: deploy a workspace build folder, upload the active `.html` file, publish Markdown as a web page, or share AI-generated HTML from Cursor, VS Code, Claude, Codex, and other coding workflows.

Use it when you need a quick review link for a React/Vue/Vite build, Next static export, HTML report, Markdown spec, dashboard, prototype, or AI-generated page without setting up Git, CI/CD, staging, or production hosting.

Compatible with Cursor, VS Code, and all VS Code-based editors.

![PreviewShip Demo](https://file.lumi.new/p425605428614770688/SPF2035964570609311744.gif)

## Features

- **One-click Deployment**: Execute a command to package and upload the current workspace, build-output folder, or active `.html`/Markdown file, automatically deploying to PreviewShip.
- **Framework Build Output**: Deploy React `build/`, Vue/Vite `dist/`, Next static export `out/`, Astro/Svelte output, or any static folder with `index.html`.
- **Single HTML/Markdown Publishing**: Deploy AI-generated HTML reports, Markdown notes, dashboards, prototypes, or artifacts directly from the active editor tab.
- **Markdown Publishing**: Deploy README files, notes, reports, and documentation as readable web pages.
- **Instant Sharing**: The preview link is automatically copied to the clipboard after a successful deployment.
- **Status Bar Progress**: Real-time display of packaging, uploading, and deployment status.
- **Usage Query**: Check your remaining deployment quota at any time.
- **Secure Storage**: API Keys are stored using editor encryption and are not leaked to configuration files.

## Installation

### Method 1: Install from .vsix file (Recommended)

1. Download the latest `previewship-x.x.x.vsix` file.
2. Installation:
   - **Cursor**: Drag the .vsix file into the extensions panel, or `Cmd+Shift+P` → `Extensions: Install from VSIX…`
   - **VS Code**: `Cmd+Shift+P` → `Extensions: Install from VSIX…`
   - **Command Line**: `cursor --install-extension previewship-x.x.x.vsix`

### Method 2: Install from Open VSX

Search for `PreviewShip` in the editor extension panel to install.

## Quick Start

### 1. Get API Key

1. Visit the [PreviewShip Console](https://previewship.com) to register an account.
2. Go to the **API Keys** page and create a new API Key.
3. Copy the generated Key (`ps_live_...`); it will only be displayed once.

### 2. Set API Key

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type `PreviewShip: Set API Key`.
3. Paste your API Key.

### 3. Deploy

1. Open the project folder or build-output folder you want to deploy.
2. Execute `PreviewShip: Deploy Workspace, HTML, or Markdown File` in the command palette.
3. If the active editor is an `.html` or Markdown file, choose whether to deploy that file or the workspace.
4. Enter the project name (defaults to the folder name, HTML filename, or Markdown filename). PreviewShip automatically creates a deployment-safe hosting slug.
5. Wait for packaging, uploading, and deployment processing to complete.
6. The preview link is automatically copied to the clipboard!

To publish a single HTML or Markdown file directly, open the file and run `PreviewShip: Deploy Active HTML or Markdown File`.

For framework projects, deploy the static build output rather than a raw source-code workspace. Run `npm run build` first and deploy `dist`, `build`, `out`, `public`, or another folder that contains `index.html` and assets. PreviewShip does not run `npm install` or build source zips after upload.

## Supported Inputs

| Input | Works? | How to deploy |
|------|--------|---------------|
| React, Vue, Vite, Svelte, Astro build output | Yes | Open the build folder or workspace and run the deploy command |
| Next.js static export | Yes | Deploy the exported `out/` or static output folder |
| Single `.html` file | Yes | Open the file and run `PreviewShip: Deploy Active HTML or Markdown File` |
| Markdown `.md` / `.markdown` file | Yes | Open the file and deploy it directly |
| Raw source folder with `package.json`, `src/`, and `node_modules` | No | Run the build first and deploy the generated output |

## HTML Publishing Guides

- [Publish HTML online](https://previewship.com/guides/publish-html-online)
- [Share Claude HTML artifacts](https://previewship.com/guides/share-claude-html-artifacts)
- [Publish AI-generated HTML online](https://previewship.com/guides/publish-ai-generated-html)
- [Upload HTML file to website](https://previewship.com/guides/upload-html-file-to-website)
- [HTML file hosting](https://previewship.com/guides/html-file-hosting)
- [Host HTML file online](https://previewship.com/guides/host-html-file-online)
- [Upload HTML file online](https://previewship.com/guides/upload-html-file)
- [Deploy a React/Vue build output](https://previewship.com/guides/deploy-a-dist-folder)
- [HTML to page](https://previewship.com/guides/html-to-page)
- [HTML to link](https://previewship.com/guides/html-to-link)
- [Markdown to website](https://previewship.com/guides/markdown-to-website)
- [AI-generated HTML preview](https://previewship.com/guides/ai-generated-html-preview)
- [Publish HTML file to web](https://previewship.com/guides/publish-html-file-to-web)
- [Claude HTML artifact to URL](https://previewship.com/guides/claude-html-artifact-to-url)
- [Netlify Drop alternative](https://previewship.com/compare/previewship-vs-netlify-drop)

## Commands

| Command | Description |
|------|------|
| `PreviewShip: Set API Key` | Set or update the API Key |
| `PreviewShip: Deploy Workspace, HTML, or Markdown File` | Deploy the current workspace; if the active editor is an HTML or Markdown file, you can deploy that file instead |
| `PreviewShip: Deploy Active HTML or Markdown File` | Package the active `.html` or Markdown file and deploy it directly |
| `PreviewShip: Show Usage` | View remaining deployment quota |

## Configuration

| Setting | Default Value | Description |
|------|--------|------|
| `previewship.serverUrl` | `https://api.previewship.com` | API server address |
| `previewship.excludePatterns` | See below | File patterns to exclude when packaging |
| `previewship.pollIntervalMs` | `3000` | Interval for polling deployment status (ms) |
| `previewship.pollTimeoutMs` | `300000` | Polling timeout (ms) |

### Default Exclusion Patterns

```json
[
  "node_modules/**",
  ".git/**",
  ".DS_Store",
  "Thumbs.db",
  ".env",
  ".env.*",
  "*.log",
  ".vscode/**",
  ".idea/**",
  "__pycache__/**",
  "*.pyc",
  ".next/**",
  ".nuxt/**",
  "coverage/**",
  ".cache/**"
]
```

You can customize exclusion rules in the editor settings, e.g., to exclude source code other than `dist/`.

## Supported Project Types

PreviewShip is a **static file hosting** service and supports:

- Pure HTML/CSS/JS websites
- React, Vue, Vite, Next static export, Astro, Svelte, Angular, and Nuxt static build output
- Single `.html` files generated by AI tools, design tools, or custom scripts
- Markdown files such as README documents, notes, reports, and docs pages
- SPA framework build artifacts such as React `build/`, Vue/Vite `dist/`, Next export `out/`, or static `public/`
- Static site generator output (Hugo `public/`, Jekyll `_site/`)
- HTML5 games/demos
- Design exports (Figma HTML)
- API documentation (Swagger UI, Redoc)

**Note**: For framework projects, upload pre-built static files instead of source code. It is recommended to run `npm run build` first, then deploy the generated `dist`, `build`, `out`, or static export folder. For a single `.html` file, the extension automatically packages it as the deployed `index.html`.

## Plans

| Item | Free | Pro Monthly | Pro Yearly |
|------|------|---------|---------|
| Price | $0 | $5.40/mo launch price | $50.40/yr launch price |
| Daily Deploys | 5 | 50 | 80 |
| Monthly Deploys | 20 | 300 | 500 |
| Per-Upload Limit | 15MB | 50MB | 80MB |
| Preview Expiry | 3 days | 30 days | 365 days |
| PreviewShip Watermark | Included | Removed | Removed |

[View full plan comparison](https://previewship.com/billing)

## FAQ

### Deployment Failed: Invalid API Key
Please ensure the API Key starts with `ps_live_` and has not been revoked. Create a new Key in the console.

### Deployment Failed: File too large
Check the `previewship.excludePatterns` setting to ensure large directories like `node_modules` and `.git` are excluded.

### Deployment Failed: Insufficient quota
The Free plan is limited to 5 deployments per day and 20 per month. Upgrade to Pro for more quota.

### How do I deploy a React/Vue project?
First, execute `npm run build` in the terminal, then use PreviewShip to deploy the generated `build/`, `dist/`, `out/`, `public/`, or static export directory.

### Can I deploy a Vite or Next.js static export?
Yes. Build first, then deploy Vite `dist/` or the static folder generated by Next.js export. The deployed folder should contain `index.html` and browser assets.

### Does PreviewShip build my source code?
No. PreviewShip hosts browser-ready static output. It does not run `npm install`, install dependencies, or build raw source folders after upload.

### Does every deployment get a new link?
No. PreviewShip keeps a fixed project preview URL and points it to the latest deployment, so repeated reviews can use the same link.

### Can AI coding agents use this with Cursor or VS Code?
Yes. Cursor and VS Code users can combine the extension with PreviewShip CLI or MCP. Use the extension for editor-first deploys and MCP/CLI when an agent should run the deployment step directly.

### Can both Cursor and VS Code be used?
Yes. PreviewShip is compatible with all VS Code-based editors, including Cursor, VS Code, Windsurf, etc.

## Feedback

Encountered an issue? Please submit feedback via [GitHub Issues](https://github.com/blockdancez/PrevewiShip/issues).
