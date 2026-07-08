# PreviewShip Agent Skills

PreviewShip skills help AI coding agents turn generated work into shareable URLs without leaving the chat.

## Share Codex Chat

`share-codex-chat` lets Codex export the current conversation as a high-fidelity, self-contained HTML page and deploy it with PreviewShip. It preserves the visible Codex chat UI: user bubbles, assistant replies, processing rows, uploaded image thumbnails, plugin mentions, file cards, and edited-file summaries.

### Install

Global install:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

Project-local install, run from the project root:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes
```

### Use In Codex

After installation, reference the skill in Codex:

```text
$share-codex-chat 分享当前 Codex 对话
```

The skill will:

- Build a visible transcript from the current Codex conversation.
- Prefer raw Codex session JSONL when available so uploaded screenshots can be rendered as thumbnails.
- Filter hidden system/developer context, tool logs, API keys, and full skill XML payloads.
- Render a Codex-like HTML page with collapsed processing details and file/change cards.
- Install or use the PreviewShip CLI, check authentication, deploy the HTML, and return the public URL.

### Authentication

PreviewShip deployment requires an API Key:

```bash
npx previewship login --key PREVIEWSHIP_API_KEY_HERE
```

Users can create an API Key at [previewship.com](https://previewship.com).

## Share Claude Code Chat

`share-claude-code-chat` exports a local Claude Code session from `~/.claude/projects` into a polished, self-contained HTML page and deploys it with PreviewShip. It is designed for debugging notes, implementation records, review handoffs, and other conversations where the Claude Code chat itself is the artifact.

### Install

Global install:

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

Project-local install, run from the project root:

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex --yes
```

### Use

```text
$share-claude-code-chat 分享 Claude Code 对话
```

The skill will:

- Read Claude Code main-session JSONL files from `~/.claude/projects`.
- Skip subagent sessions during automatic current-session selection.
- Render user and assistant visible text with polished Markdown, code blocks, tables, context cards, and collapsed tool activity summaries.
- Filter hidden thinking, raw tool outputs, file-history snapshots, attachment bodies, API keys, and secret-looking values.
- Deploy the generated HTML through the PreviewShip CLI and return the public URL.
