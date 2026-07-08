# PreviewShip CLI

> Publish HTML online, host HTML files, deploy React/Vue/Vite/Next build output, and publish Markdown from the terminal to fixed PreviewShip preview URLs.

PreviewShip CLI publishes browser-ready frontend artifacts to shareable preview links. Use it to deploy a `dist`, `build`, `out`, or `public` folder, upload a single `.html` file, publish Markdown as a readable web page, or let an AI coding agent return a live URL from a scriptable command.

It is built for frontend review workflows, AI-generated HTML previews, Claude/Cursor/Codex agent handoffs, client approval links, QA links, and static build sharing without Git or CI/CD setup.

Need to try before configuring an API key? Use the browser flow at <https://previewship.com/try> to create a one-hour temporary frontend build, HTML, or Markdown preview link, then sign up to claim the same fixed project URL. The CLI remains the repeatable path once you have an API key.

For Codex and Claude Code users, PreviewShip also ships installable skills that turn coding conversations into high-fidelity share pages and deploy them with this CLI:

```bash
# Share Codex Chat: global install
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes

# Share Codex Chat: project-local install, run from the project root
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes

# Share Claude Code Chat: global install
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes

# Share Claude Code Chat: project-local install
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex --yes
```

## Quick Start

```bash
# 1. Get an API Key at https://previewship.com
# 2. Set your API Key
npx previewship login

# 3. Deploy browser-ready output, a single HTML file, or Markdown
npx previewship deploy ./dist
npx previewship deploy ./build
npx previewship deploy ./out
npx previewship deploy ./report.html
npx previewship deploy ./README.md
```

Important: deploy static build output, not a raw source-code folder. For React, Vue, Vite, Next static export, Astro, Svelte, or similar framework projects, run the build command first and deploy `dist`, `build`, `out`, `public`, or the generated static folder that contains `index.html` and assets.

## Useful Deep Links

- [Share Claude HTML artifacts as live URLs](https://previewship.com/guides/share-claude-html-artifacts)
- [Netlify Drop alternative for one HTML file or ZIP](https://previewship.com/guides/netlify-drop-alternative-for-html-file)
- [Upload an HTML file to a website](https://previewship.com/guides/upload-html-file-to-website)
- [Host an HTML file online](https://previewship.com/guides/host-html-file-online)
- [Share a Codex chat conversation](https://previewship.com/docs/share-codex-chat)
- [Share a Claude Code chat conversation](https://previewship.com/docs/share-claude-code-chat)
- [Compare PreviewShip with Netlify Drop](https://previewship.com/compare/previewship-vs-netlify-drop)

## Supported Inputs

| Input | Works? | Notes |
|-------|--------|-------|
| React/Vue/Vite/Svelte/Astro build output | Yes | Deploy `dist`, `build`, `out`, `public`, or a zip with `index.html` |
| Next.js static export | Yes | Deploy the exported static folder after build/export |
| Single `.html` file | Yes | Packaged as `index.html` automatically |
| Markdown `.md` / `.markdown` file | Yes | Rendered through a generated viewer page |
| Raw source folder with `package.json` and `src/` | No | Build first, then deploy the generated output |
| `node_modules` or dependency folders | No | Excluded by default and should not be uploaded |

## HTML Publishing Guides

- [Publish HTML online](https://previewship.com/guides/publish-html-online)
- [Share Claude HTML artifacts](https://previewship.com/guides/share-claude-html-artifacts)
- [Publish AI-generated HTML online](https://previewship.com/guides/publish-ai-generated-html)
- [Upload HTML file to website](https://previewship.com/guides/upload-html-file-to-website)
- [HTML file hosting](https://previewship.com/guides/html-file-hosting)
- [Host HTML file online](https://previewship.com/guides/host-html-file-online)
- [Upload HTML file online](https://previewship.com/guides/upload-html-file)
- [HTML to page](https://previewship.com/guides/html-to-page)
- [HTML to link](https://previewship.com/guides/html-to-link)
- [Markdown to website](https://previewship.com/guides/markdown-to-website)
- [AI-generated HTML preview](https://previewship.com/guides/ai-generated-html-preview)
- [Codex website preview](https://previewship.com/guides/codex-website-preview)
- [Publish HTML file to web](https://previewship.com/guides/publish-html-file-to-web)
- [HTML deployer](https://previewship.com/guides/html-deployer)
- [Netlify Drop alternative for one HTML file or ZIP](https://previewship.com/guides/netlify-drop-alternative-for-html-file)
- [Compare PreviewShip with Netlify Drop](https://previewship.com/compare/previewship-vs-netlify-drop)

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

### `previewship deployments list`

List deployment history with status, preview URL, source, current marker, and rollback availability.

```bash
previewship deployments list
previewship deployments --status READY --days 30
previewship deployments list --query landing --json
```

### `previewship projects list`

List projects owned by your API key user.

```bash
previewship projects list
previewship projects list --json
```

### `previewship projects get <project-id>`

Show project details, including fixed preview URL, latest deployment pointer, access mode, and redeploy state.

```bash
previewship projects get 42
```

### `previewship projects access <project-id>`

Show or update project access. PreviewShip currently supports public access and password access. Setting a project back to public clears its existing project password.

```bash
previewship projects access 42
previewship projects access 42 --password "review-pass"
previewship projects access 42 --public
```

Password access is a Pro capability. Public projects can be indexed and shared to Showcase; password-protected projects are excluded from Showcase and sitemap.

### `previewship projects versions <project-id>`

List retained project versions that can be used for rollback.

```bash
previewship projects versions 42
```

### `previewship projects rollback <project-id> <deployment-id>`

Roll the fixed project URL back to a retained deployment. Rollback switches the project `latest` pointer; it does not create a new deployment record.

```bash
previewship projects rollback 42 105 --confirm my-project
```

### `previewship projects redeploy <project-id>`

Redeploy from the latest retained artifact. This is useful when a fixed preview link has expired but the artifact is still retained.

```bash
previewship projects redeploy 42
```

### `previewship projects delete <project-id>`

Delete a project, its fixed preview URL, hosted project, and Showcase entry. This cannot be undone, so the CLI requires project-name confirmation.

```bash
previewship projects delete 42 --confirm my-project
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

AI coding agents can use PreviewShip CLI to deploy previews. Tell the agent to build first, then deploy the browser-ready artifact:

```bash
# Agents should use --json for structured output
previewship deploy ./dist --json
previewship deploy ./report.html --json
previewship deploy ./README.md --json
previewship projects list --json
previewship projects access 42 --public --json
```

Example prompts:

- "Build the React app, deploy the generated dist folder with PreviewShip, and return the preview URL."
- "Deploy report.html with PreviewShip and paste the fixed preview link."
- "Publish this Markdown spec as a website preview and return JSON."
- "Do not deploy source code; run the framework build first and deploy the static output."
- "List my PreviewShip projects and tell me which ones are password protected."
- "Set project 42 back to public access."
- "Show rollbackable versions for project 42."

Codex users can install the repository skills and invoke them in chat:

```text
$share-codex-chat 分享当前 Codex 对话
$share-claude-code-chat 分享 Claude Code 对话
```

The skills render visible Codex or Claude Code conversation records into self-contained HTML pages, preserve safe tool activity summaries where supported, hide reasoning/raw tool outputs, and deploy the generated page through PreviewShip.

## Directory Listings

For MCP and agent directories such as Glama, Smithery, and mcp.so, describe PreviewShip as:

- **Name:** PreviewShip
- **Category:** Developer tools / deployment / static preview hosting
- **Short description:** Deploy browser-ready React/Vue/Vite/Next build output, HTML, Markdown, and static artifacts from CLI, MCP, VS Code, Cursor, or browser upload and get a fixed PreviewShip preview URL.
- **Install:** `npx previewship deploy ./dist` for CLI; `npx -y previewship-mcp` for MCP clients.
- **Management commands:** list projects, delete projects, set public/password access, list versions, roll back a fixed URL, redeploy expired links, list deployment history.
- **Best keywords:** publish HTML online, host HTML file online, HTML file hosting, upload HTML file to website, HTML to page, Netlify Drop alternative, Netlify Drop alternative for HTML file, React build deploy, Vue build deploy, Vite deploy, Next static export deploy, HTML to link, Markdown to website, AI-generated HTML preview, Claude HTML preview, Claude artifact URL, ChatGPT HTML website, Codex website preview, Claude Code chat sharing, Codex chat sharing, hostmyclaudehtml, project password preview, rollback static preview, static preview hosting.

## FAQ

### Can I deploy a React, Vue, Vite, or Next.js project?

Yes, after building it. Run the framework build command first, then deploy the generated `dist`, `build`, `out`, `public`, or static export folder. PreviewShip does not run `npm install` or `npm run build` after upload.

### Does each deploy create a new URL?

PreviewShip uses a fixed project preview URL and updates the latest deployment pointer for that project. This keeps review links stable across iterations.

### Can I switch a password-protected project back to public?

Yes. Run `previewship projects access <project-id> --public`. PreviewShip clears the stored project password and makes the fixed preview URL publicly accessible again.

### Can I delete old projects when the Free project limit is full?

Yes. Run `previewship projects list`, then `previewship projects delete <project-id> --confirm <project-name>`. Deleting removes the preview URL, hosted project, deployment association, and Showcase entry.

### Can Claude Code, Cursor, Codex, or another agent use the CLI?

Yes. Agents should call `previewship deploy <path> --json` so they can parse the deployment ID, status, and preview URL.

### Can I publish one HTML or Markdown file without a zip?

Yes. A single `.html`, `.md`, or `.markdown` file can be deployed directly.

## Plans

| | Free | Pro Monthly | Pro Yearly |
|------|------|------------|------------|
| Price | $0 | $5.40/mo launch price | $50.40/yr launch price |
| Daily Deploys | 5 | 50 | 80 |
| Monthly Deploys | 20 | 300 | 500 |
| Upload Limit | 15MB | 50MB | 80MB |
| Preview Expiry | 3 days | 30 days | 365 days |
| Version History | 3 retained versions | 10 retained versions | 40 retained versions |
| Project Password Access | Not included | Included | Included |
| Public/Password Access Toggle | Public only | Included | Included |
| PreviewShip Watermark | Included | Removed | Removed |

[View full plan comparison](https://previewship.com/billing)

## License

MIT
