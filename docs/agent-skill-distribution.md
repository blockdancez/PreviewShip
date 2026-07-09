# Agent Skill 分发执行清单

本文档用于推广 PreviewShip 的两个会话分享 skills：

- `share-codex-chat`
- `share-claude-code-chat`

目标是让用户、搜索引擎、AI 搜索和 Agent Skills / Claude Code / Codex 生态都能发现 PreviewShip。

## 统一定位

One-liner:

```text
Export Codex and Claude Code conversations into high-fidelity HTML pages and deploy them as public PreviewShip URLs.
```

中文：

```text
把 Codex / Claude Code 对话导出成高保真 HTML 页面，并通过 PreviewShip 发布成可分享链接。
```

核心链接：

```text
Repo: https://github.com/blockdancez/PreviewShip
Product: https://previewship.com
Codex skill docs: https://previewship.com/docs/share-codex-chat
Claude Code skill docs: https://previewship.com/docs/share-claude-code-chat
Agent Skills directory: https://github.com/blockdancez/PreviewShip/tree/main/skills
Claude Code marketplace manifest: https://github.com/blockdancez/PreviewShip/blob/main/.claude-plugin/marketplace.json
```

安装命令：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

## 我可以直接做的事

这些已经可以在仓库内完成，或在你授权后由 Codex 执行：

1. 补齐 `SKILL.md` metadata
   - 位置：`skills/share-codex-chat/SKILL.md`
   - 位置：`skills/share-claude-code-chat/SKILL.md`
   - 目的：让 Agent Skills 目录可以读取 `name`、`description`、`repository`、`docs`、`install`。

2. 维护 Claude Code plugin 包装
   - 位置：`.claude-plugin/marketplace.json`
   - 位置：`skills/share-claude-code-chat/.claude-plugin/plugin.json`
   - 目的：让 `share-claude-code-chat` 可作为 Claude Code plugin marketplace source 提交。

3. 维护可复制的提交文案
   - 位置：`docs/agent-skill-submissions.md`
   - 目的：提交 AgenticSkills、mcpservers、awesome list、Claude community marketplace、Product Hunt / HN / Reddit 时直接复制。

4. 本地验证
   - JSON 语法验证。
   - 如果本机已安装 Claude Code CLI，可以执行 `claude plugin validate skills/share-claude-code-chat`。
   - 如果 GitHub CLI 登录了，可以执行 repo topic/release/PR 操作。

5. 生成 PR / issue 草稿
   - 可以为 awesome list 生成 PR body。
   - 可以为外部目录生成 issue body。
   - 不能绕过平台登录、验证码、组织权限和表单提交确认。

## 必须你亲自做的事

这些需要账号、权限、验证码或平台 UI：

1. GitHub 授权
   - 需要你运行 `gh auth login`，或在浏览器登录 GitHub。
   - 当前本机 `gh` 未登录，所以我不能改 GitHub About/topics、创建 release、fork 外部仓库或提交 PR。

2. GitHub repo About / topics
   - 需要 repo admin 权限。
   - 可由你在 GitHub UI 操作，或登录 `gh` 后让我执行命令。

3. 外部目录表单
   - AgenticSkills、mcpservers、Claude community marketplace 等通常需要登录或人工表单。
   - 我可以提供完整字段内容，但最后点击 submit 需要你做。

4. 外部仓库 PR
   - awesome list 需要 fork、branch、PR。
   - 如果你登录 `gh` 并允许我操作，我可以做；否则你手工复制 PR 内容。

5. 社区发帖
   - HN、Reddit、Product Hunt、X、LinkedIn 都强依赖个人账号声誉。
   - 我可以写帖子，建议你亲自发布。

## GitHub 仓库操作

### 1. Repo About

GitHub 页面：

```text
https://github.com/blockdancez/PreviewShip
```

点击右侧 About 的齿轮，填写：

Description:

```text
Deploy frontend builds, HTML, Markdown, and AI coding agent chat transcripts to public PreviewShip URLs.
```

Website:

```text
https://previewship.com
```

Topics:

```text
previewship
agent-skills
codex-skills
claude-code
claude-code-skills
ai-agent
mcp-server
developer-tools
html-hosting
static-preview
chat-export
transcript-sharing
```

如果 `gh` 已登录，可以执行：

```bash
gh repo edit blockdancez/PreviewShip \
  --description "Deploy frontend builds, HTML, Markdown, and AI coding agent chat transcripts to public PreviewShip URLs." \
  --homepage "https://previewship.com" \
  --add-topic previewship \
  --add-topic agent-skills \
  --add-topic codex-skills \
  --add-topic claude-code \
  --add-topic claude-code-skills \
  --add-topic ai-agent \
  --add-topic mcp-server \
  --add-topic developer-tools \
  --add-topic html-hosting \
  --add-topic static-preview \
  --add-topic chat-export \
  --add-topic transcript-sharing
```

### 2. GitHub Release

Release tag:

```text
agent-chat-sharing-skills-v1.0.0
```

Release title:

```text
PreviewShip Agent Chat Sharing Skills: Codex + Claude Code
```

Release body 使用 `docs/agent-skill-submissions.md` 中的 GitHub Release 文案。

如果 `gh` 已登录，可以执行：

```bash
gh release create agent-chat-sharing-skills-v1.0.0 \
  --title "PreviewShip Agent Chat Sharing Skills: Codex + Claude Code" \
  --notes-file /tmp/previewship-agent-chat-sharing-release.md
```

## Agent Skills 目录提交

优先提交两个独立 skill，而不是只提交 PreviewShip：

1. `share-codex-chat`
2. `share-claude-code-chat`

推荐平台：

```text
https://agenticskills.io/
https://mcpservers.org/agent-skills
https://agentskills.io/home
```

提交字段使用 `docs/agent-skill-submissions.md`。

## Awesome List PR

优先目标：

```text
https://github.com/VoltAgent/awesome-agent-skills
```

PR 标题：

```text
Add PreviewShip chat sharing skills for Codex and Claude Code
```

PR 内容使用 `docs/agent-skill-submissions.md`。

## OpenAI / Codex 生态

这里不一定有官方市场提交入口，所以重点是让搜索和社区能发现：

1. GitHub topics 命中 `codex-skills`。
2. docs 页面命中 `share Codex chat` / `export Codex conversation`。
3. 在 OpenAI / Codex 社区发教程型帖子。
4. 在 Agent Skills 目录提交 `share-codex-chat`。

社区帖子使用 `docs/agent-skill-submissions.md`。

## Claude Code plugin 生态

本仓库已经添加 Claude Code marketplace manifest：

```text
.claude-plugin/marketplace.json
skills/share-claude-code-chat/.claude-plugin/plugin.json
```

你可以先本地验证：

```bash
claude plugin validate skills/share-claude-code-chat
```

之后在 Claude Code 中测试：

```text
/plugin marketplace add blockdancez/PreviewShip
/plugin install previewship-claude-code-chat-sharing@previewship
/reload-plugins
```

如果要提交 Claude community marketplace，使用 `docs/agent-skill-submissions.md` 的 Claude Code plugin 提交字段。

## 推荐执行顺序

1. 确认仓库所有 skill 文档、docs 页面、metadata 已提交并推到 GitHub。
2. 设置 GitHub About / topics。
3. 发 GitHub Release。
4. 提交 AgenticSkills / mcpservers Agent Skills。
5. 提 PR 到 awesome-agent-skills。
6. 验证 Claude Code plugin manifest 并提交 community marketplace。
7. 发 HN / Reddit / X / LinkedIn 教程型内容。
