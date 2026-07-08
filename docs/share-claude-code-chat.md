# Share Claude Code Chat Skill 使用说明

`share-claude-code-chat` 是 PreviewShip 为 Claude Code 对话分享提供的可选 Agent Skill。它会读取本机 `~/.claude/projects` 下的 Claude Code JSONL 会话记录，把可见用户消息、助手回复和安全的工具活动摘要还原成高保真 HTML 页面，通过 PreviewShip CLI 部署，并返回一个可分享的公开 URL。

这个功能不是 PreviewShip 的主部署流程。普通用户仍然可以直接用控制台、CLI、MCP、VS Code/Cursor 插件部署 HTML、Markdown 或静态构建产物。`share-claude-code-chat` 更适合需要分享 Claude Code 研究过程、实现记录、工具调用脉络或评审上下文的场景。

## 与 Codex 会话分享的区别

Claude Code 与 Codex 的本地存储格式、消息类型和工具事件结构不同，所以这个 skill 使用独立解析逻辑，而不是复用 `share-codex-chat` 的 transcript 规则。

它会把 Claude Code 的思考/推理和工具活动挂到对应的助手进度消息附近，并在页面中以可折叠时间线展示。隐藏思考原文、原始工具输出、附件正文、file-history snapshot、API Key 和疑似密钥不会被公开。

## 安装

全局安装：

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex -g --yes
```

项目内局部安装，在项目根目录执行：

```bash
npx skills add blockdancez/PreviewShip --skill share-claude-code-chat -a codex --yes
```

## 使用

在 Codex 中输入：

```text
$share-claude-code-chat 分享 Claude Code 对话
```

Skill 会定位 Claude Code 会话，生成聊天 HTML 页面，调用 PreviewShip CLI 部署，并在完成后返回公开 URL。

## PreviewShip API Key

部署前需要先配置 PreviewShip API Key：

```bash
npx previewship login
```

如果没有 API Key，请先访问 https://previewship.com 登录并创建 API Key。

## 隐私说明

该 skill 设计为只展示可见对话内容和安全的工具活动摘要，并过滤 Claude Code 隐藏思考、原始工具输出、附件正文、API Key 和密钥。分享敏感工作前，仍然建议先检查生成的 HTML 页面。
