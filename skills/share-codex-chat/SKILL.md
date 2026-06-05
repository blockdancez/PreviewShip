---
name: share-codex-chat
description: Export the current Codex chat transcript into a self-contained HTML page that aims to 100% reproduce the visible chat content and Codex chat UI, then deploy it with the PreviewShip CLI. Use when the user wants to share a Codex conversation, publish chat history, generate a chat HTML page, or deploy the transcript to PreviewShip.
license: MIT
compatibility: Requires Node.js/npm for PreviewShip CLI deployment; optional Python 3 for the bundled renderer.
metadata:
  author: PreviewShip
  version: "1.0"
  repository: https://github.com/blockdancez/PreviewShip
  install: npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
---

# Share Codex Chat

## When to use this skill

Use this skill when the user asks to:
- Share the current Codex conversation with other people.
- Turn the current chat record into an HTML page.
- Recreate the Codex chat UI for a transcript.
- Deploy the generated chat page to PreviewShip.
- Mentions `$share-codex-chat`, `share-codex-chat`, "分享当前聊天", "导出 Codex 对话", "生成聊天 HTML", or "部署聊天记录".

## What this skill does

This skill helps Codex create a self-contained `index.html` that aims to 100% reproduce the current visible Codex chat page, preserves the visible conversation content, deploys it through the PreviewShip CLI, and returns the public URL.

The skill must protect private context: never include hidden system/developer messages, chain-of-thought, internal tool traces, API keys, environment variables, or secrets unless the user explicitly supplied that content as visible chat text and asked to include it.

Install from the PreviewShip repository:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

## Required output

At the end, return:
- The PreviewShip URL.
- The local HTML file path.
- Any limitation that prevents a perfect transcript, such as missing earlier messages because the context was compacted.

## Workflow

### 1. Collect the transcript

Build a visible transcript from the current conversation:
1. Include user and assistant messages that are visible in the conversation.
2. Exclude injected context that is not shown in the chat UI: `AGENTS.md instructions`, `<environment_context>...</environment_context>`, full `<skill>...</skill>` payloads, hidden system/developer instructions, raw tool output, and API key configuration output.
3. Convert skill mentions such as `[$skills-creator](/path/SKILL.md)` into the visible blue skill chip text in the user bubble. Do not include the subsequent full skill XML payload.
4. Preserve Markdown structure for visible assistant answers: headings, lists, code blocks, tables, links, file links, and image references.
5. Keep the original visible language and wording. Do not include internal progress notes unless they are visibly rendered in the chat UI.
6. If the real chat DOM or earlier messages are unavailable because of product limitations or context compaction, tell the user this before claiming full fidelity. Never present a reconstructed transcript as a guaranteed 100% export when source content is missing.

When a local Codex session JSONL is available, prefer it over a hand-written transcript because it preserves real image data and event boundaries:
- Use `event_msg.user_message` as the source of visible user turns. `payload.message` is bubble text; `payload.images` may contain `data:image/...` URLs; `payload.local_images` may contain local image paths.
- Use `event_msg.agent_message` with `phase=commentary` as processing detail text, not normal assistant body text.
- Use `event_msg.agent_message` with `phase=final_answer` as the visible assistant answer.
- Use `event_msg.task_complete.duration_ms` to render `已处理 <duration> ›` for the preceding assistant turn.
- Use `event_msg.patch_apply_end.changes` as visible Codex attachment UI for the current assistant turn: render Markdown/document files as file cards when appropriate, and always render the edited-files summary card with per-file `+added -deleted` counts. Attach these cards after the final assistant answer, not inside processing details.
- Ignore `response_item.reasoning`, `function_call`, `function_call_output`, `custom_tool_call`, `tool_search_*`, `turn_context`, `session_meta`, and `compacted` as visible transcript text.
- Use `response_item.message.content[]` only as a fallback when `event_msg` lines are absent. Its `input_text` / `output_text` map to text, and `input_image.image_url` maps to an attachment thumbnail.
- Never render `AGENTS.md instructions`, `<environment_context>`, full `<skill>...</skill>`, raw tool stdout/stderr, or compressed summaries as normal chat messages.

### 1.1 Assemble UI records, not raw text

Before rendering, translate each visible turn into Codex UI components:
- User turn: right-aligned gray rounded bubble. If the user uploaded images, put small right-aligned thumbnails above the bubble via `attachments`.
- Assistant turn: optional `已处理 <duration> ›` row, divider, plain left-aligned answer body, optional file artifact cards, optional changed-file card, optional bottom action row with timestamp.
- Processing/work logs: put long intermediate reasoning-like progress, edit notes, and "I am updating..." status text into `details` or `workLog`; render it inside the `已处理 <duration> ›` collapsible area, closed by default. Do not place this text in `content`.
- File artifact: use `artifacts` for visible cards such as `SKILL.md 文档 · MD`.
- Changed files: use `changes` for visible edited-file summaries and per-file `+added -deleted` counts.
- Assistant actions: use `timestamp` only when the timestamp is visible, for example `星期四19:27`.
- If one logical assistant turn contains hidden tool work plus a final answer, export the final visible answer and represent the processing state with `duration`; do not paste tool logs or private progress chatter into the answer body.
- If the available context contains multiple consecutive assistant messages for one turn, treat earlier short progress/status messages as non-rendered work logs unless they are visibly present in the chat UI. Render the final visible assistant answer for that turn.
- If a progress/status message cannot be confidently attached to a final visible assistant answer, render a compact assistant turn with only `已处理 ›` and put the progress text in collapsed `details`; do not drop the turn and do not show the progress text as normal body content.

### 1.2 Codex record type mapping

Treat the source conversation as structured records, not one Markdown string. Common record types and rendering:
- `text` / `markdown` / `input_text` / `output_text`: render as Markdown inside the user bubble or assistant body.
- `skill`: render as a blue skill chip, for example `Skills Creator` or `Share Codex Chat`.
- `mention` / `plugin` / `app`: render as a blue mention chip with a small icon, for example `Chrome` for `plugin://chrome@openai-bundled`.
- `image` / `local_image` / `image_url` / `input_image`: render as right-aligned thumbnails above the user bubble. Use local path, public URL, or data URL when available; render a small missing-image placeholder only when the image was visible but the binary/path is unavailable.
- `file` / `artifact`: render as Codex-style artifact cards only when visible in the chat.
- `changes` / `diff_summary`: render as the edited-files card with totals and per-file deltas.
- `status` / `duration`: render as `已处理 <duration> ›`.
- `tool_call` / `tool_result` / hidden context: do not render as transcript text. Summarize only if the user explicitly asked to publish tool output.
- `details` / `workLog`: render inside the collapsed processing detail associated with the assistant turn.

Use this JSON shape for the bundled renderer:

```json
{
  "title": "Codex Chat Share",
  "titleEn": "Codex Chat Share",
  "projectName": "codex-chat-share",
  "messages": [
    {
      "role": "user",
      "content": "用户消息 Markdown 原文",
      "attachments": [
        {
          "src": "/absolute/path/or/public-url.png",
          "alt": "截图说明"
        }
      ]
    },
    {
      "role": "assistant",
      "content": "助手消息 Markdown 原文",
      "duration": "2m 22s",
      "timestamp": "星期四19:27",
      "details": [
        "默认折叠的处理过程、编辑过程或进展日志"
      ],
      "artifacts": [
        {
          "title": "SKILL.md",
          "subtitle": "文档 · MD",
          "icon": "◇"
        }
      ],
      "changes": [
        {
          "path": "/Users/example/project/file.md",
          "added": 184,
          "deleted": 0
        }
      ]
    }
  ]
}
```

Only include `duration`, `timestamp`, `attachments`, `details`, `artifacts`, and `changes` when they are visible in the chat UI or can be derived from the assistant's own visible summary. Do not invent exact timings.

Image handling:
- If the uploaded image is available as a local path, put that absolute path in `attachments[].src`; the renderer inlines local image files as data URLs so PreviewShip can serve them.
- If the image is already public, put the URL in `attachments[].src`.
- If the image is a local path or `data:image/...` from Codex JSONL, the renderer should emit a small thumbnail data URL instead of the original full-resolution screenshot, so the page keeps the visible Codex thumbnail while staying deployable.
- If the image binary/path is not available, mention the limitation in the final response instead of fabricating an image.

If a message must be kept in the transcript JSON for debugging but should not render, add `"visible": false`.

### 2. Generate the HTML

Prefer the bundled renderer:

```bash
SKILL_DIR="/path/to/share-codex-chat"
python3 "$SKILL_DIR/scripts/render_chat_html.py" \
  --input /tmp/codex-chat-share/transcript.json \
  --output /tmp/codex-chat-share/index.html
```

When using the skill, resolve `SKILL_DIR` to the directory containing this `SKILL.md`; do not hard-code a user-specific path.

The renderer also accepts raw Codex `.jsonl` session files:

```bash
SKILL_DIR="/path/to/share-codex-chat"
python3 "$SKILL_DIR/scripts/render_chat_html.py" \
  --input /Users/me/.codex/sessions/2026/06/04/rollout-....jsonl \
  --output /tmp/codex-chat-share/index.html
```

If Python is unavailable, create a self-contained `index.html` manually with the same structure:
- A Codex-like app shell with a white sticky top bar, left title, and right toolbar glyphs.
- Right-aligned user messages as light-gray rounded bubbles.
- Assistant messages as plain document-style content on white background, not bordered message cards.
- Optional `已处理 <duration> ›` row and divider above assistant replies when the duration is known.
- Collapsible processing detail under the `已处理 <duration> ›` row when `details` or `workLog` exists; it must be closed by default to avoid making the UI noisy.
- Codex-style file artifact cards and changed-file summary cards when those elements are visible.
- Markdown rendering preserved as HTML.
- Responsive layout for desktop and mobile.
- Inline CSS and minimal inline JavaScript only when needed.

For a high-fidelity page:
- Use a white page background, 70px desktop top bar, desktop body text around 18px CSS pixels, and a main content width close to the Codex desktop chat frame.
- Avoid avatar circles, message-number labels, blue full-width cards, colored assistant panels, or centered report-style headers; those do not match the Codex chat UI shown in the app.
- Keep stable spacing and typography: large vertical gaps between turns, compact gray user bubbles, and unframed assistant Markdown.
- The first visible turn must be the first user/assistant exchange shown in the Codex chat UI, not hidden context such as AGENTS instructions or skill XML.
- Long edit/progress text must not be directly spread across the assistant reply; keep it in collapsed processing details so the visible page stays like the Codex chat.
- Prefer exact copied UI text, visible message order, role labels, code formatting, and scroll behavior over decorative changes.
- Escape all untrusted transcript content before rendering HTML.
- Do not reference external CSS, fonts, scripts, or images unless the transcript itself contains public image URLs.

### 3. Verify locally

Open or inspect the generated HTML before deploying:

```bash
python3 -m http.server 4173 --directory /tmp/codex-chat-share
```

Then visit `http://localhost:4173` if a browser tool is available. Check:
- The page is not blank.
- Message order is correct.
- Code blocks and long lines wrap or scroll cleanly.
- The first viewport looks like Codex, not a generic chat app: title top-left, user bubble right, assistant reply as plain left-aligned content.
- No private hidden instructions or secrets are present.

If a browser is not available, inspect the file and at least confirm it contains the expected message count and title.

### 4. Ensure PreviewShip CLI is available

Check installed tools:

```bash
command -v previewship || true
command -v npx || true
node --version || true
```

If `previewship` is installed, use it. If not installed but `npx` is available, use `npx -y previewship ...`; this satisfies automatic install/use without mutating global packages.

If the user specifically wants a global install and `npm` is available:

```bash
npm install -g previewship
```

Do not proceed if Node.js/npm/npx are unavailable. Tell the user Node.js 20+ is required for the CLI.

### 5. Check authentication

Run one of:

```bash
previewship whoami
npx -y previewship whoami
```

If authentication is missing, do not guess credentials. Tell the user:

```text
请前往 https://previewship.com 登录，进入 API Keys 页面创建 API Key，然后运行：
npx previewship login --key ps_live_YOUR_KEY
或设置环境变量：
export PREVIEWSHIP_API_KEY=ps_live_YOUR_KEY
```

After the user confirms configuration is complete, run `whoami` again.

### 6. Choose the PreviewShip deployment name

By default, set `-n` to the current Codex conversation title translated to concise English and joined with hyphens.

Examples:
- `创建聊天记录分享技能` -> `create-chat-record-sharing-skill`
- `分享当前 Codex 对话` -> `share-current-codex-chat`

Set this in the transcript JSON as `projectName`. If `projectName` is absent, set `titleEn` to the English title and let the renderer print the slug:

```bash
PROJECT_NAME="$(python3 "$SKILL_DIR/scripts/render_chat_html.py" \
  --input /tmp/codex-chat-share/transcript.json \
  --print-project-name)"
```

Do not use the fixed name `codex-chat-share` unless the conversation title is unavailable.

### 7. Deploy

Deploy the HTML file with JSON output:

```bash
previewship deploy /tmp/codex-chat-share/index.html -n "$PROJECT_NAME" --json
```

or, without a global binary:

```bash
npx -y previewship deploy /tmp/codex-chat-share/index.html -n "$PROJECT_NAME" --json
```

Parse the JSON response and return the public URL. If JSON parsing fails, read the CLI output and extract the URL only when it is unambiguous.

## Error handling

- If the transcript cannot be fully recovered, generate a page from available visible messages and clearly label the limitation in the final response.
- If PreviewShip reports quota or permission errors, show the exact error summary and stop.
- If deployment succeeds but URL extraction fails, return the full relevant CLI output and the local file path.
- If a message contains sensitive-looking values such as API keys, tokens, or passwords, redact them unless the user explicitly asks to publish them.

## Example

User:

```text
用 share-codex-chat 把这段对话部署出去
```

Agent:

1. Builds `/tmp/codex-chat-share/transcript.json`.
2. Runs the renderer to create `/tmp/codex-chat-share/index.html`.
3. Verifies the HTML locally.
4. Runs `previewship whoami`.
5. Derives `PROJECT_NAME` from the current conversation title, for example `create-chat-record-sharing-skill`.
6. If authenticated, deploys with `previewship deploy ... -n "$PROJECT_NAME" --json`.
7. Returns the PreviewShip URL.
