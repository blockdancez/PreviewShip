# Agent Skill 外部提交文案

本文档保存可直接复制到外部平台的提交内容。

## GitHub Release

Title:

```text
PreviewShip Agent Chat Sharing Skills: Codex + Claude Code
```

Body:

```markdown
PreviewShip now includes two Agent Skills for sharing AI coding conversations:

- `share-codex-chat`: export the current visible Codex conversation as a high-fidelity HTML page and deploy it to PreviewShip.
- `share-claude-code-chat`: read local Claude Code JSONL sessions, render visible messages and safe tool activity timelines, hide reasoning/raw tool output, and deploy the result to PreviewShip.

Install:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

Docs:

- https://previewship.com/docs/share-codex-chat
- https://previewship.com/docs/share-claude-code-chat

Why it matters:

AI coding conversations often contain the implementation context, debugging trail, review decisions, and tool activity that screenshots cannot preserve. These skills turn the conversation itself into a shareable PreviewShip page.
```

## Agent Skills Directory: share-codex-chat

Name:

```text
share-codex-chat
```

Title:

```text
Share Codex Chat
```

Short description:

```text
Export the current visible Codex conversation into a high-fidelity HTML page and deploy it to PreviewShip as a public share link.
```

Long description:

```text
share-codex-chat is an Agent Skill for Codex users who want to share debugging sessions, implementation records, review context, or AI collaboration history. It renders visible Codex messages, image thumbnails, Markdown, processing details, file cards, and change summaries into a self-contained HTML page, filters hidden system/developer context and secrets, then deploys the page through the PreviewShip CLI.
```

Repository:

```text
https://github.com/blockdancez/PreviewShip
```

Skill path:

```text
skills/share-codex-chat
```

Docs:

```text
https://previewship.com/docs/share-codex-chat
```

Install:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

Category:

```text
Developer Tools / Productivity / AI Agent Workflow
```

Tags:

```text
codex, codex-skills, agent-skills, chat-export, transcript-sharing, previewship, developer-tools
```

## Agent Skills Directory: share-claude-code-chat

Name:

```text
share-claude-code-chat
```

Title:

```text
Share Claude Code Chat
```

Short description:

```text
Export Claude Code JSONL conversations into high-fidelity HTML pages with safe tool timelines, then deploy them as public PreviewShip links.
```

Long description:

```text
share-claude-code-chat is an Agent Skill for sharing Claude Code conversations. It reads local Claude Code JSONL history from ~/.claude/projects, reconstructs visible user and assistant messages, preserves safe tool activity as collapsible timelines, hides reasoning text and raw tool outputs, redacts secret-looking values, and deploys the generated HTML page through the PreviewShip CLI.
```

Repository:

```text
https://github.com/blockdancez/PreviewShip
```

Skill path:

```text
skills/share-claude-code-chat
```

Docs:

```text
https://previewship.com/docs/share-claude-code-chat
```

Install:

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

Category:

```text
Developer Tools / Claude Code / AI Agent Workflow
```

Tags:

```text
claude-code, claude-code-skills, agent-skills, chat-export, tool-timeline, transcript-sharing, previewship
```

## Awesome List PR

PR title:

```text
Add PreviewShip chat sharing skills for Codex and Claude Code
```

List item:

```markdown
- [PreviewShip Agent Chat Sharing Skills](https://github.com/blockdancez/PreviewShip/tree/main/skills) - Export Codex and Claude Code conversations into high-fidelity HTML pages and deploy them as public PreviewShip URLs. Includes `share-codex-chat` for Codex transcripts and `share-claude-code-chat` for Claude Code JSONL sessions with safe tool timelines.
```

PR body:

```markdown
This PR adds PreviewShip Agent Chat Sharing Skills.

PreviewShip provides two production-oriented Agent Skills:

- `share-codex-chat`: exports visible Codex conversations as high-fidelity HTML pages and deploys them to PreviewShip.
- `share-claude-code-chat`: reads Claude Code JSONL sessions, renders visible messages and safe tool activity timelines, hides reasoning/raw tool outputs, and deploys the result to PreviewShip.

Why it belongs:

- Published by the PreviewShip project team.
- Real developer workflow: sharing debugging sessions, implementation records, review handoffs, and AI coding traces.
- Includes install commands, docs, and deploy workflow.
- Compatible with Agent Skills style workflows for Codex / Claude Code users.

Docs:

- https://previewship.com/docs/share-codex-chat
- https://previewship.com/docs/share-claude-code-chat

Repository:

https://github.com/blockdancez/PreviewShip
```

## Claude Code Plugin Marketplace

Plugin name:

```text
previewship-claude-code-chat-sharing
```

Display name:

```text
PreviewShip Claude Code Chat Sharing
```

Short description:

```text
Share Claude Code conversations as high-fidelity PreviewShip pages with safe tool timelines.
```

Long description:

```text
PreviewShip Claude Code Chat Sharing exports Claude Code conversations from local JSONL history, renders visible user and assistant messages, preserves safe tool activity as collapsible timelines, hides reasoning text and raw tool outputs, redacts secret-looking values, and deploys the generated HTML through PreviewShip.
```

Repository:

```text
https://github.com/blockdancez/PreviewShip
```

Marketplace manifest:

```text
https://github.com/blockdancez/PreviewShip/blob/main/.claude-plugin/marketplace.json
```

Plugin source:

```text
skills/share-claude-code-chat
```

Homepage:

```text
https://previewship.com/docs/share-claude-code-chat
```

License:

```text
MIT
```

Category:

```text
Productivity / Developer Tools
```

Keywords:

```text
previewship, claude-code, agent-skills, chat-export, transcript-sharing, tool-timeline
```

Why useful:

```text
Claude Code sessions often contain the research trail, implementation record, and tool activity needed for review handoff. This plugin turns that work into a shareable page without screenshots or pasted terminal logs.
```

Security/privacy notes:

```text
The plugin is designed to hide reasoning text, avoid publishing raw tool outputs and attachment bodies, redact secret-looking values, and require the user to review generated HTML before sharing.
```

## OpenAI / Codex Community Post

Title:

```text
I built an Agent Skill to share Codex conversations as public HTML pages
```

Body:

```markdown
I built `share-codex-chat`, an Agent Skill that exports the visible Codex conversation into a high-fidelity HTML page and deploys it to PreviewShip.

It is useful when the conversation itself is the artifact:

- debugging context
- implementation records
- review handoff
- AI collaboration history

Install:

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

Use in Codex:

```text
$share-codex-chat 分享当前 Codex 对话
```

Docs:

https://previewship.com/docs/share-codex-chat

Repo:

https://github.com/blockdancez/PreviewShip

It filters hidden system/developer context, tool logs, API keys, and secrets before publishing.
```

## Claude Code Community Post

Title:

```text
I built a Claude Code plugin/skill to share Claude Code chats with tool timelines
```

Body:

```markdown
I built `share-claude-code-chat`, an Agent Skill and Claude Code plugin source for sharing Claude Code conversations as public PreviewShip pages.

It reads local Claude Code JSONL sessions from `~/.claude/projects`, renders visible messages, keeps safe tool activity as collapsible timelines, hides hidden reasoning and raw tool outputs, and deploys the generated HTML page through PreviewShip.

Install as an Agent Skill:

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

Use:

```text
$share-claude-code-chat 分享 Claude Code 对话
```

Docs:

https://previewship.com/docs/share-claude-code-chat

Repo:

https://github.com/blockdancez/PreviewShip

Why I made it:

Claude Code conversations often include the research trail and tool activity needed for implementation review, but screenshots and pasted terminal logs are hard to read. This turns the conversation into a shareable page.
```

## Hacker News

Title:

```text
Show HN: PreviewShip Agent Skills for sharing Codex and Claude Code chats
```

Text:

```text
I built two Agent Skills for PreviewShip:

- share-codex-chat: exports visible Codex conversations as high-fidelity HTML pages.
- share-claude-code-chat: exports Claude Code JSONL sessions with safe, collapsible tool timelines.

Both deploy the generated page to PreviewShip and return a public URL.

The goal is to make AI coding conversations shareable without screenshots, especially when the conversation contains implementation context, debugging notes, and review decisions.

Repo: https://github.com/blockdancez/PreviewShip
Docs: https://previewship.com/docs/share-claude-code-chat
```

## Reddit / X / LinkedIn 短帖

```text
I added two PreviewShip Agent Skills:

1. share-codex-chat: share visible Codex conversations as high-fidelity HTML pages.
2. share-claude-code-chat: share Claude Code JSONL sessions with safe tool timelines and hidden reasoning removed.

Useful for debugging trails, implementation records, and review handoff.

Docs:
https://previewship.com/docs/share-codex-chat
https://previewship.com/docs/share-claude-code-chat
```
