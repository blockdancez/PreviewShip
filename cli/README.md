# PreviewShip CLI

> Publish HTML and Markdown online from the terminal. Upload HTML/Markdown files, deploy static build output, and get instant shareable links.

Deploy static websites, single HTML files, and Markdown documents to a preview environment from the terminal. Use PreviewShip CLI to upload an HTML file to a website, publish Markdown as a readable page, host HTML online, publish generated HTML, or share build output with a public URL instantly.

Works with any AI coding agent (Codex, OpenClaw, etc.) — they can call the CLI directly.

For Codex users, PreviewShip also ships an installable skill that turns the current Codex conversation into a high-fidelity share page and deploys it with this CLI:

```bash
# Global install
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes

# Project-local install, run from the project root
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes
```

## Quick Start

```bash
# 1. Get an API Key at https://previewship.com
# 2. Set your API Key
npx previewship login

# 3. Deploy a build folder, single HTML file, or Markdown document
npx previewship deploy ./dist
npx previewship deploy ./report.html
npx previewship deploy ./README.md
```

Important: deploy static build output, not a raw source-code folder. For framework projects, run `npm run build` first and deploy `dist`, `build`, `out`, or the generated static folder that contains `index.html` and assets.

## HTML Publishing Guides

- [Upload HTML file to website](https://previewship.com/guides/upload-html-file-to-website)
- [HTML file hosting](https://previewship.com/guides/html-file-hosting)
- [Host HTML file online](https://previewship.com/guides/host-html-file-online)
- [Publish HTML file to web](https://previewship.com/guides/publish-html-file-to-web)
- [HTML deployer](https://previewship.com/guides/html-deployer)

## Installation

```bash
# Use with npx (no install needed)
npx previewship deploy

# Or install globally
npm install -g previewship
```

## Commands

### `previewship login`

Set your API Key.

```bash
previewship login                    # Interactive input
previewship login --key ps_live_xxx  # Non-interactive (CI/Agent)
```

### `previewship deploy [path]`

Deploy a directory, single HTML file, or Markdown file to preview.

```bash
previewship deploy                   # Deploy current directory
previewship deploy ./dist            # Deploy specific directory
previewship deploy ./report.html     # Deploy a single HTML file as index.html
previewship deploy ./README.md       # Render Markdown and deploy it as index.html
previewship deploy -n my-project     # Set project name
previewship deploy --json            # JSON output (for scripting/agents)
previewship deploy --exclude "*.map" # Extra exclude patterns
```

If you pass a directory, it should already be deployable static output. Do not point the CLI at an unbuilt React/Vue/Next source folder unless that folder itself contains the final `index.html` and browser assets.

Project names are display names inside PreviewShip. Use a short name you recognize; PreviewShip automatically creates a deployment-safe hosting slug.

### `previewship status <id>`

Check deployment status.

```bash
previewship status 42
previewship status 42 --json
```

### `previewship usage`

Show quota usage.

```bash
previewship usage
previewship usage --json
```

### `previewship whoami`

Show current configuration.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PREVIEWSHIP_API_KEY` | API Key (overrides config file) |
| `PREVIEWSHIP_SERVER_URL` | Server URL (overrides config file) |
| `CI` | Auto-enables JSON output |
| `NO_COLOR` | Disables colored output |

## Use with AI Agents

AI coding agents can use PreviewShip CLI to deploy previews:

```bash
# Agents should use --json for structured output
previewship deploy ./dist --json
previewship deploy ./report.html --json
previewship deploy ./README.md --json
```

Codex users can install the repository skill and invoke it in chat:

```text
$share-codex-chat 分享当前 Codex 对话
```

The skill renders visible Codex conversation records, uploaded image thumbnails, plugin mentions, file cards, and edited-file summaries into a self-contained HTML page, then deploys that page through PreviewShip.

## Plans

| | Free | Pro Monthly | Pro Yearly |
|------|------|------------|------------|
| Price | $0 | $5.40/mo launch price | $50.40/yr launch price |
| Daily Deploys | 5 | 30 | 40 |
| Monthly Deploys | 20 | 200 | 350 |
| Upload Limit | 15MB | 50MB | 80MB |
| Preview Expiry | 3 days | 30 days | 365 days |
| PreviewShip Watermark | Included | Removed | Removed |

[View full plan comparison](https://previewship.com/billing)

## License

MIT
