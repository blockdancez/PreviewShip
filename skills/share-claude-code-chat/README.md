# PreviewShip Claude Code Chat Sharing

`previewship-claude-code-chat-sharing` packages the `share-claude-code-chat` skill as a Claude Code plugin source.

The plugin exports local Claude Code JSONL conversations from `~/.claude/projects` into a polished, self-contained HTML page, keeps safe tool activity as collapsible timelines, hides hidden thinking and raw tool output, and deploys the result with the PreviewShip CLI.

## Install As An Agent Skill

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

## Install From The Claude Code Plugin Marketplace

After this repository is published as a Claude Code marketplace, install it from Claude Code:

```text
/plugin marketplace add blockdancez/PreviewShip
/plugin install previewship-claude-code-chat-sharing@previewship
/reload-plugins
```

Then invoke the skill:

```text
/share-claude-code-chat 分享 Claude Code 对话
```

Docs: https://previewship.com/docs/share-claude-code-chat
