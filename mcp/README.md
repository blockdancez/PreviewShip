# PreviewShip MCP Server

> Let AI coding agents publish HTML online, host Claude/ChatGPT HTML artifacts, deploy React/Vue/Vite/Next build output, and return fixed PreviewShip preview URLs through MCP.

PreviewShip MCP gives Claude Code, Cursor, Windsurf, Codex-compatible workflows, and any MCP-compatible client a native way to publish browser-ready frontend artifacts. Agents can deploy a React/Vue/Vite/Next static build, upload HTML, publish Markdown or PDF, share AI-generated HTML, or return a QA/client review link without asking the user to open a hosting dashboard.

For a no-signup browser trial, use <https://previewship.com/try> to publish a 24-hour temporary frontend build, HTML, Markdown, or PDF preview first. MCP is the authenticated agent workflow once you have a PreviewShip API key.

## What This MCP Server Does

| Job | PreviewShip MCP behavior |
|-----|--------------------------|
| Deploy frontend build output | Uploads `dist`, `build`, `out`, `public`, or another static folder with `index.html` |
| Publish one HTML file | Packages `.html` as the preview entry page |
| Publish Markdown | Renders `.md` / `.markdown` through a generated viewer page |
| Publish PDF | Opens a single `.pdf` full screen through the browser's native viewer |
| Support AI agent workflows | Returns deployment status and PreviewShip URL through structured tool output |
| Keep review links stable | Uses fixed project preview URLs that point to the latest deployment |

PreviewShip hosts static output. It does not run `npm install`, install dependencies, or build raw source folders after upload. For React, Vue, Vite, Next, Astro, Svelte, Angular, or Nuxt projects, ask the agent to run the build first and deploy the generated static output.

## Useful Deep Links

Use these links when listing PreviewShip MCP in MCP directories, agent tool directories, README files, articles, or community answers:

- [Share Claude HTML artifacts as live URLs](https://previewship.com/guides/share-claude-html-artifacts)
- [Netlify Drop alternative for one HTML file or ZIP](https://previewship.com/guides/netlify-drop-alternative-for-html-file)
- [Upload an HTML file to a website](https://previewship.com/guides/upload-html-file-to-website)
- [Host an HTML file online](https://previewship.com/guides/host-html-file-online)
- [Compare PreviewShip with Netlify Drop](https://previewship.com/compare/previewship-vs-netlify-drop)

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

Deploy a static website build output, single HTML, Markdown, or PDF document to a PreviewShip preview environment.

**Parameters:**
- `path` (optional) — Directory, single `.html` file, Markdown file, or PDF document to deploy. Defaults to current working directory.
- `projectName` (optional) — Display project name. Defaults to directory name. PreviewShip automatically creates a deployment-safe hosting slug.
- `excludePatterns` (optional) — Additional glob patterns to exclude.
- `visibility` (optional) — `PUBLIC` or `PASSWORD`, applied before the deployment becomes available. New projects default to public; existing projects keep their current access when omitted.
- `password` (optional) — Required with `visibility: "PASSWORD"`; 6–100 characters. Do not repeat the password in follow-up output.

**Important:** when `path` is a directory, it should be a static build artifact such as `dist`, `build`, `out`, `public`, or another folder containing `index.html` and browser assets. Ask the agent to run the framework build first. Do not deploy a raw source-code zip/folder with `package.json`, `src/`, and `node_modules` unless it is already static output.

**Example usage in conversation:**
> "Deploy this project to a preview"
> "Deploy the dist folder"
> "Build the React app, then deploy the generated dist folder"
> "Build the Vue/Vite app and deploy the browser-ready output"
> "Deploy report.html and share the preview link"
> "Deploy README.md and share the preview link"
> "Publish report.pdf and return the preview URL"
> "Publish this ChatGPT HTML as a website URL"
> "Host page.html online and return the URL"
> "Deploy the dist folder with password access, and do not repeat the password"
> "Help me deploy and share a preview link"

## Supported Inputs

| Input | Supported | Agent instruction |
|------|-----------|-------------------|
| React/Vue/Vite/Svelte/Astro build output | Yes | Run build, then call `deploy_preview` on `dist`/`build`/`out`/`public` |
| Next.js static export | Yes | Deploy the exported static folder |
| Single `.html` file | Yes | Call `deploy_preview` with the file path |
| Markdown `.md` / `.markdown` file | Yes | Call `deploy_preview` with the file path |
| PDF `.pdf` file | Yes | Call `deploy_preview`; the returned URL opens the native full-screen viewer |
| Raw source folder with `package.json` and `src/` | No | Build first and deploy the output |
| `node_modules` | No | Do not upload dependency folders |

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
- [ChatGPT HTML to website](https://previewship.com/guides/chatgpt-html-to-website)
- [Claude HTML artifact to URL](https://previewship.com/guides/claude-html-artifact-to-url)
- [Netlify Drop alternative for one HTML file or ZIP](https://previewship.com/guides/netlify-drop-alternative-for-html-file)
- [Compare PreviewShip with Netlify Drop](https://previewship.com/compare/previewship-vs-netlify-drop)

### `check_deployment`

Check deployment status.

**Parameters:**
- `deploymentId` (required) — Deployment ID from `deploy_preview`.

### `show_usage`

Show remaining deployment quota.

### `list_projects`

List PreviewShip projects owned by the API key user, including fixed preview URLs, access mode, current status, and redeploy availability.

### `get_project`

Get one project by `projectId`.

### `delete_project`

Delete a project, its fixed preview URL, hosted project, and Showcase entry. This tool requires `confirmProjectName` to exactly match the project name before deletion.

### `redeploy_project_latest`

Redeploy a project from its latest retained artifact without uploading files again. Useful for restoring an expired fixed preview link.

### `get_project_access`

Show whether a project is public or password protected.

### `set_project_access`

Set project access to `PUBLIC` or `PASSWORD`. `PUBLIC` clears an existing project password and makes the fixed preview URL publicly accessible again. `PASSWORD` requires a password and is a Pro capability.

### `list_project_versions`

List retained project versions that can be used for rollback, with `page` and `size` pagination. Free accounts show fewer retained versions; Pro accounts keep more history.

### `rollback_project_version`

Queue a new deployment from a retained historical version. The source record remains unchanged. This tool requires `confirmProjectName` to exactly match the project name; poll the returned deployment ID until it becomes ready.

### `list_deployments`

List deployment history with status, preview URL, source, current marker, and rollback availability.

## Directory Listings

Use this metadata when submitting to Glama, Smithery, mcp.so, or other MCP directories:

- **Name:** PreviewShip MCP
- **Command:** `npx -y previewship-mcp`
- **Category:** Deployment / static preview hosting / developer tools
- **Short description:** MCP server for deploying React/Vue/Vite/Next build output, HTML, Markdown, and AI-generated static pages from coding agents to fixed PreviewShip preview URLs.
- **Tools:** `deploy_preview`, `check_deployment`, `show_usage`, `list_projects`, `get_project`, `delete_project`, `redeploy_project_latest`, `get_project_access`, `set_project_access`, `list_project_versions`, `rollback_project_version`, `list_deployments`
- **Best keywords:** MCP static hosting, publish HTML online, host HTML file online, HTML file hosting, upload HTML file to website, HTML to page, Netlify Drop alternative, Netlify Drop alternative for HTML file, React build deploy, Vue build deploy, Vite deploy, Next static export deploy, HTML to link, Markdown to website, AI-generated HTML preview, Claude HTML preview, Claude artifact URL, ChatGPT HTML website, Codex website preview, Cursor MCP deploy, hostmyclaudehtml, password protected preview, rollback static preview, fixed preview URL.
- **Required env:** `PREVIEWSHIP_API_KEY`

## FAQ

### Can the MCP server deploy a React, Vue, Vite, or Next.js app?

Yes, after the app is built. The agent should run the framework build command first, then call `deploy_preview` on the generated `dist`, `build`, `out`, `public`, or static export folder.

### Can the MCP server publish Claude or ChatGPT HTML artifacts?

Yes. Save the generated HTML as a `.html` file or write it into a project folder with `index.html`, then call `deploy_preview`.

### Does PreviewShip MCP build source code?

No. It deploys browser-ready static output. It does not run `npm install` or build source-code zips after upload.

### Does it return a stable URL?

Yes. PreviewShip projects use fixed preview URLs. New deployments update the latest pointer behind the same project link.

### Can an agent switch a password-protected project back to public?

Yes. Use `set_project_access` with `visibility: "PUBLIC"`. PreviewShip clears the stored password and makes the fixed preview URL publicly accessible again.

### Can an agent delete old projects when the Free project limit is full?

Yes. Use `list_projects` to inspect projects, then `delete_project` with the exact `confirmProjectName`. Deleting removes the fixed preview URL, hosted project, deployment association, and Showcase entry.

## Plans

| | Free | Pro Monthly | Pro Yearly |
|------|------|------------|------------|
| Default price | $0 | $8.10/mo | $75.60/yr |
| Eligible BR/PT regional price | $0 | $5.40/mo | $50.40/yr |
| Daily Deploys | 5 | 50 | 80 |
| Monthly Deploys | 20 | 300 | 500 |
| Preview Expiry | 3 days | 30 days | 365 days |
| Version History | 3 retained versions | 10 retained versions | 40 retained versions |
| Project Password Access | Not included | Included | Included |
| Public/Password Access Toggle | Public only | Included | Included |
| PreviewShip Watermark | Included | Removed | Removed |

[View verified pricing and eligibility](https://previewship.com/pricing.md) · [Read pricing and limits docs](https://previewship.com/docs/pricing-limits)

[View plans](https://previewship.com/billing)

## License

MIT
