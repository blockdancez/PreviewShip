# Share Codex Chat Skill 使用说明

`share-codex-chat` 是 PreviewShip 为 Codex 用户提供的可选 Agent Skill。它可以把当前 Codex 对话中可见的聊天记录还原成高保真 HTML 页面，通过 PreviewShip CLI 部署，并返回一个可分享的公开 URL。

这个功能不是 PreviewShip 的主部署流程。普通用户仍然可以直接用控制台、CLI、MCP、VS Code/Cursor 插件部署 HTML、Markdown 或静态构建产物。`share-codex-chat` 更适合需要分享 Codex 调试过程、实现记录、评审上下文或 AI 协作结果的场景。

## 安装

全局安装：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

项目内局部安装，在项目根目录执行：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes
```

## 使用

在 Codex 中输入：

```text
$share-codex-chat 分享当前 Codex 对话
```

Skill 会生成聊天 HTML 页面，调用 PreviewShip CLI 部署，并在完成后返回公开 URL。

## PreviewShip API Key

部署前需要先配置 PreviewShip API Key：

```bash
npx previewship login
```

如果没有 API Key，请先访问 https://previewship.com 登录并创建 API Key。

## 隐私说明

该 skill 设计为导出可见聊天内容，并过滤隐藏系统/开发者上下文、工具日志、API Key 和密钥。分享敏感工作前，仍然建议先检查生成的 HTML 页面。
