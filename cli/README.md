# PreviewShip CLI

> One-click deploy previews, instant shareable links.

Deploy static websites and single HTML files to a preview environment from the terminal. Get a shareable link instantly.

Works with any AI coding agent (Codex, OpenClaw, etc.) — they can call the CLI directly.

## Quick Start

```bash
# 1. Get an API Key at https://previewship.com
# 2. Set your API Key
npx previewship login

# 3. Deploy a build folder or a single HTML file
npx previewship deploy ./dist
npx previewship deploy ./report.html
```

Important: deploy static build output, not a raw source-code folder. For framework projects, run `npm run build` first and deploy `dist`, `build`, `out`, or the generated static folder that contains `index.html` and assets.

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

Deploy a directory or single HTML file to preview.

```bash
previewship deploy                   # Deploy current directory
previewship deploy ./dist            # Deploy specific directory
previewship deploy ./report.html     # Deploy a single HTML file as index.html
previewship deploy -n my-project     # Set project name
previewship deploy --json            # JSON output (for scripting/agents)
previewship deploy --exclude "*.map" # Extra exclude patterns
```

If you pass a directory, it should already be deployable static output. Do not point the CLI at an unbuilt React/Vue/Next source folder unless that folder itself contains the final `index.html` and browser assets.

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
```

## Plans

| | Free | Pro Monthly | Pro Yearly |
|------|------|------------|------------|
| Price | $0 | $9/mo | $84/yr |
| Daily Deploys | 5 | 30 | 40 |
| Monthly Deploys | 20 | 200 | 350 |
| Upload Limit | 15MB | 50MB | 80MB |

[View full plan comparison](https://previewship.com/billing)

## License

MIT
