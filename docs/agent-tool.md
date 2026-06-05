# PreviewShip Agent Tool 规格文档

> 定义 CLI 和 MCP Server 的接口规格、输入输出格式、Agent 集成指南。

---

## 0. 可选 Agent Skill：Codex 会话分享

PreviewShip 仓库内置 `share-codex-chat` skill，Codex 用户可以安装后把当前 Codex 对话导出为高保真 HTML 页面，并通过 PreviewShip CLI 部署成公开 URL。

这个功能是辅助能力，不是 PreviewShip 的主部署流程；普通部署仍然使用 CLI、MCP、编辑器插件或 Web 控制台发布 HTML、Markdown 和静态构建产物。

全局安装：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

项目内局部安装：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes
```

在 Codex 中使用：

```text
$share-codex-chat 分享当前 Codex 对话
```

详见：[Share Codex Chat Skill 使用说明](./share-codex-chat.md)。

---

## 1. CLI 工具规格

### 1.1 基本信息

| 属性 | 值 |
|------|-----|
| npm 包名 | `previewship` |
| 命令名 | `previewship` |
| Node.js 要求 | >= 20.0.0 |
| 运行时依赖 | `archiver` |
| 安装方式 | `npm install -g previewship` 或 `npx previewship` |

### 1.2 命令规格

#### `previewship login`

设置 API Key。

```
用法: previewship login [选项]

选项:
  --key <key>         直接传入 API Key（非交互模式）
  --server <url>      指定服务器地址
  -h, --help          显示帮助
```

**交互模式：**
```
$ previewship login
? 请输入 API Key (ps_live_...): ********
✓ API Key 已保存到 ~/.previewship/config.json
```

**非交互模式（CI/Agent）：**
```
$ previewship login --key ps_live_xxx
✓ API Key 已保存到 ~/.previewship/config.json
```

**JSON 模式：**
```
$ previewship login --key ps_live_xxx --json
{"success": true, "configPath": "/Users/xxx/.previewship/config.json"}
```

---

#### `previewship deploy [path]`

打包并部署目录。

```
用法: previewship deploy [path] [选项]

参数:
  path                要部署的目录路径（默认当前目录）

选项:
  -n, --name <name>   项目名称（默认为目录名）
  --exclude <pattern>  额外排除模式（可多次使用）
  --json              JSON 格式输出
  --no-clipboard      不复制到剪贴板
  -h, --help          显示帮助
```

**人类模式输出：**
```
$ previewship deploy ./dist
✓ 打包完成 (12 个文件, 1.2 MB)
✓ 上传成功，部署 ID: 42
⠋ 构建中...
✓ 部署完成！

预览链接: https://my-project-abc123.vercel.app
（已复制到剪贴板）
```

**JSON 模式输出：**
```json
// 成功
{
  "success": true,
  "deploymentId": 42,
  "projectName": "my-project",
  "previewUrl": "https://my-project-abc123.vercel.app",
  "status": "READY",
  "fileCount": 12,
  "zipSizeBytes": 1258291
}

// 失败
{
  "success": false,
  "error": {
    "code": "DAILY_QUOTA_EXCEEDED",
    "message": "今日部署次数已达上限（5/5），明日重置",
    "details": {
      "used": 5,
      "limit": 5,
      "resetAt": "2026-03-24T00:00:00Z"
    }
  }
}
```

---

#### `previewship status <deploymentId>`

查询部署状态。

```
用法: previewship status <deploymentId> [选项]

选项:
  --json              JSON 格式输出
  -h, --help          显示帮助
```

**人类模式输出：**
```
$ previewship status 42
部署 #42 — my-project
状态: READY
预览链接: https://my-project-abc123.vercel.app
创建时间: 2026-03-23 14:30:00
```

**JSON 模式输出：**
```json
{
  "success": true,
  "deploymentId": 42,
  "projectName": "my-project",
  "status": "READY",
  "previewUrl": "https://my-project-abc123.vercel.app",
  "errorMessage": null,
  "createdAt": "2026-03-23T14:30:00Z",
  "updatedAt": "2026-03-23T14:30:15Z"
}
```

---

#### `previewship usage`

查看配额使用情况。

```
用法: previewship usage [选项]

选项:
  --json              JSON 格式输出
  -h, --help          显示帮助
```

**人类模式输出：**
```
$ previewship usage
今日部署: 3/5 (剩余 2 次)
本月部署: 12/20 (剩余 8 次)
```

**JSON 模式输出：**
```json
{
  "success": true,
  "daily": {
    "used": 3,
    "limit": 5,
    "resetAt": "2026-03-24T00:00:00Z"
  },
  "monthly": {
    "used": 12,
    "limit": 20,
    "resetAt": "2026-04-01T00:00:00Z"
  }
}
```

---

#### `previewship whoami`

查看当前配置信息。

```
$ previewship whoami
API Key: ps_live_Wln...（前 12 位）
服务器: https://api.previewship.com
配置文件: ~/.previewship/config.json
```

---

### 1.3 环境变量

| 环境变量 | 说明 | 优先级 |
|---------|------|--------|
| `PREVIEWSHIP_API_KEY` | API Key | 高于配置文件 |
| `PREVIEWSHIP_SERVER_URL` | 服务器地址 | 高于配置文件 |
| `NO_COLOR` | 禁用彩色输出 | 标准 |
| `CI` | CI 环境标识（自动启用 --json） | 标准 |

### 1.4 退出码

| 退出码 | 含义 | 典型场景 |
|--------|------|---------|
| 0 | 成功 | 部署完成、配置保存成功 |
| 1 | 业务错误 | 部署失败、配额超限、API 返回错误 |
| 2 | 配置错误 | 未设置 API Key、无效参数 |
| 3 | 网络错误 | 连接超时、DNS 解析失败 |

---

## 2. MCP Server 规格

### 2.1 基本信息

| 属性 | 值 |
|------|-----|
| npm 包名 | `previewship-mcp` |
| MCP 协议版本 | 2024-11-05 |
| 传输层 | stdio |
| 运行时依赖 | `@modelcontextprotocol/sdk`, `previewship` |
| 支持的客户端 | Claude Code, Cursor, Windsurf, 所有 MCP 兼容客户端 |

### 2.2 Tool 规格

#### Tool: `deploy_preview`

部署静态网站到预览环境。

**描述（Agent 可见）：**
> 部署静态网站到 PreviewShip 预览环境，获取可公开访问的预览链接。适用于 HTML/CSS/JS 网站、React/Vue/Angular 构建产物（dist/build 目录）、静态站点生成器输出等。部署后链接可直接分享给任何人。

**输入参数：**

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "要部署的目录路径。默认为当前工作目录。建议部署构建产物目录（如 ./dist 或 ./build）而非源代码。"
    },
    "projectName": {
      "type": "string",
      "description": "项目名称，用于标识部署。仅允许字母、数字、下划线、连字符。默认为目录名。"
    },
    "excludePatterns": {
      "type": "array",
      "items": { "type": "string" },
      "description": "额外的 glob 排除模式。默认已排除 node_modules、.git、.env 等常见目录。"
    }
  },
  "required": []
}
```

**成功返回：**

```json
{
  "content": [{
    "type": "text",
    "text": "部署成功！\n\n预览链接: https://my-project-abc123.vercel.app\n部署 ID: 42\n文件数: 12\n包大小: 1.2 MB\n\n链接可直接分享给任何人访问。"
  }]
}
```

**失败返回：**

```json
{
  "content": [{
    "type": "text",
    "text": "部署失败: 今日部署次数已达上限（5/5），明日重置。\n\n升级 Pro 获取更多配额: https://previewship.com/billing"
  }],
  "isError": true
}
```

---

#### Tool: `check_deployment`

查询部署状态。

**描述：**
> 查询 PreviewShip 部署的当前状态。可用于检查正在进行的部署是否完成。

**输入参数：**

```json
{
  "type": "object",
  "properties": {
    "deploymentId": {
      "type": "number",
      "description": "部署 ID（由 deploy_preview 返回）"
    }
  },
  "required": ["deploymentId"]
}
```

**返回示例：**

```json
{
  "content": [{
    "type": "text",
    "text": "部署 #42 — my-project\n状态: READY\n预览链接: https://my-project-abc123.vercel.app\n创建时间: 2026-03-23 14:30:00"
  }]
}
```

---

#### Tool: `show_usage`

查看配额使用情况。

**描述：**
> 查看 PreviewShip 当前的部署配额使用情况，包括日配额和月配额的已用/上限信息。

**输入参数：**

```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**返回示例：**

```json
{
  "content": [{
    "type": "text",
    "text": "PreviewShip 配额使用情况:\n\n今日部署: 3/5 (剩余 2 次)\n本月部署: 12/20 (剩余 8 次)"
  }]
}
```

---

### 2.3 配置指南

#### Claude Code

在 `~/.claude/settings.json` 中添加：

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_xxx"
      }
    }
  }
}
```

也可以在项目级别配置（`.claude/settings.json`）：

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_xxx"
      }
    }
  }
}
```

#### Cursor

在项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_xxx"
      }
    }
  }
}
```

#### Windsurf

在 `~/.codeium/windsurf/mcp_config.json` 中添加：

```json
{
  "mcpServers": {
    "previewship": {
      "command": "npx",
      "args": ["-y", "previewship-mcp"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_xxx"
      }
    }
  }
}
```

---

## 3. 后端 API 接口（CLI/MCP 调用）

CLI 和 MCP Server 调用的后端 API 与 VS Code 插件完全一致，无需任何改动。

### 3.1 认证

所有请求通过 `X-API-Key` 头部传递 API Key：

```
X-API-Key: ps_live_xxx
```

### 3.2 端点

#### POST /v1/deployments

创建部署（multipart/form-data 上传）。

**请求：**
```
POST /v1/deployments
Content-Type: multipart/form-data
X-API-Key: ps_live_xxx

projectName: my-project
file: (binary zip data)
```

**成功响应（201）：**
```json
{
  "deploymentId": 42,
  "status": "QUEUED",
  "createdAt": "2026-03-23T14:30:00Z"
}
```

**错误响应：**
```json
{
  "error": {
    "code": "DAILY_QUOTA_EXCEEDED",
    "message": "今日部署次数已达上限",
    "details": {
      "used": 5,
      "limit": 5,
      "resetAt": "2026-03-24T00:00:00Z"
    }
  }
}
```

---

#### GET /v1/deployments/{id}

查询部署状态。

**成功响应（200）：**
```json
{
  "deploymentId": 42,
  "projectName": "my-project",
  "status": "READY",
  "previewUrl": "https://my-project-abc123.vercel.app",
  "errorMessage": null,
  "createdAt": "2026-03-23T14:30:00Z",
  "updatedAt": "2026-03-23T14:30:15Z"
}
```

状态值：`QUEUED` → `BUILDING` → `READY` / `FAILED`

---

#### GET /v1/usage

查询配额使用情况。

**成功响应（200）：**
```json
{
  "daily": {
    "used": 3,
    "limit": 5,
    "resetAt": "2026-03-24T00:00:00Z"
  },
  "monthly": {
    "used": 12,
    "limit": 20,
    "resetAt": "2026-04-01T00:00:00Z"
  }
}
```

---

## 4. Agent 集成最佳实践

### 4.1 AI Agent 调用 CLI

终端 Agent（Codex、OpenClaw 等）可以直接执行 CLI 命令：

```bash
# Agent 调用方式（JSON 模式，便于解析）
previewship deploy ./dist --json --name my-project

# Agent 解析返回的 JSON
# 成功 → 提取 previewUrl 展示给用户
# 失败 → 提取 error.message 告知用户
```

**Agent 应注意的事项：**
1. 始终使用 `--json` 模式以获取结构化输出
2. 检查退出码判断成败（0=成功，非0=失败）
3. 部署前建议先运行构建命令（如 `npm run build`）
4. 优先部署构建产物目录（`./dist`、`./build`）而非整个项目

### 4.2 MCP 最佳 Tool 描述

Tool 描述对 Agent 的调用决策至关重要。`deploy_preview` 的描述应包含：
- **触发关键词**：部署、预览、分享、链接、deploy、preview、share
- **适用场景**：静态网站、HTML、React/Vue 构建产物
- **操作结果**：返回可公开访问的预览链接

### 4.3 User-Agent 标识

CLI 和 MCP 在 HTTP 请求中携带 User-Agent 以便后端区分来源：

```
User-Agent: previewship-cli/1.0.0
User-Agent: previewship-mcp/1.0.0
```

后端可据此统计各渠道的部署量。

---

## 5. 默认排除模式

所有客户端（VS Code 插件、CLI、MCP）共享相同的默认排除列表：

```
node_modules/**
.git/**
.DS_Store
Thumbs.db
.env
.env.*
*.log
.vscode/**
.idea/**
__pycache__/**
*.pyc
.next/**
.nuxt/**
coverage/**
.cache/**
```

CLI 通过 `--exclude` 参数追加；MCP 通过 `excludePatterns` 参数追加。

---

## 6. 本地测试指南

### 6.1 前提条件

- Node.js >= 20
- 后端 API 可访问（本地开发用 `http://localhost:8080`，生产用 `https://api.previewship.com`）
- 有效的 API Key（`ps_live_...`）

### 6.2 测试 CLI

```bash
# 1. 进入 CLI 目录，安装依赖并构建
cd cli
npm install
npm run build

# 2. 测试基本命令
node bin/previewship.mjs --help        # 查看帮助
node bin/previewship.mjs -v            # 查看版本
node bin/previewship.mjs whoami        # 应显示"Not logged in"

# 3. 设置 API Key（指向本地后端测试时需同时设置 server）
node bin/previewship.mjs login --key ps_live_your_key_here
# 或指向本地后端：
PREVIEWSHIP_SERVER_URL=http://localhost:8080 \
  node bin/previewship.mjs login --key ps_live_your_key_here

# 4. 查看配额
node bin/previewship.mjs usage
# 指向本地后端：
PREVIEWSHIP_SERVER_URL=http://localhost:8080 \
  node bin/previewship.mjs usage

# 5. 部署测试（准备一个含 index.html 的目录）
mkdir -p /tmp/test-site
echo '<html><body><h1>Hello PreviewShip</h1></body></html>' > /tmp/test-site/index.html

node bin/previewship.mjs deploy /tmp/test-site -n test-site
# 指向本地后端：
PREVIEWSHIP_SERVER_URL=http://localhost:8080 \
  node bin/previewship.mjs deploy /tmp/test-site -n test-site

# 6. JSON 模式测试（Agent 场景）
node bin/previewship.mjs deploy /tmp/test-site --json -n test-site

# 7. 查询部署状态（用上一步返回的 deploymentId）
node bin/previewship.mjs status 42

# 8. 错误场景测试
node bin/previewship.mjs deploy /tmp/nonexistent  # 目录不存在
PREVIEWSHIP_API_KEY=ps_live_invalid_key \
  node bin/previewship.mjs usage                   # 无效 Key

# 9. 模拟 npx 方式运行（验证 bin 入口）
npm link
previewship --help
previewship deploy /tmp/test-site -n test-npx
npm unlink -g previewship  # 清理
```

### 6.3 测试 MCP Server

```bash
# 1. 确保 CLI 已构建（MCP 依赖 CLI 包）
cd cli && npm run build && cd ..

# 2. 进入 MCP 目录，安装依赖并构建
cd mcp
npm install
npm run build

# 3. 手动发送 MCP 协议消息测试（验证 Server 启动不崩溃）
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | PREVIEWSHIP_API_KEY=ps_live_your_key_here node dist/index.js

# 4. 在 Claude Code 中测试
# 编辑 ~/.claude/settings.json，添加：
{
  "mcpServers": {
    "previewship": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_your_key_here"
      }
    }
  }
}
# 重启 Claude Code → 对话中输入 "deploy this project" → 应触发 deploy_preview Tool

# 5. 在 Cursor 中测试
# 在项目根目录创建 .cursor/mcp.json：
{
  "mcpServers": {
    "previewship": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "PREVIEWSHIP_API_KEY": "ps_live_your_key_here"
      }
    }
  }
}
# 重启 Cursor → 在 Agent 模式下输入 "deploy a preview of this project"

# 6. 使用 MCP Inspector 测试（可选）
npx @modelcontextprotocol/inspector node dist/index.js
# 在 Inspector UI 中：
# - 查看 Tools 列表（应有 deploy_preview、check_deployment、show_usage）
# - 手动调用 show_usage 验证返回格式
# - 手动调用 deploy_preview 测试部署
```

### 6.4 端到端测试清单

| # | 测试项 | CLI 命令 | 预期结果 |
|---|--------|---------|---------|
| 1 | 帮助信息 | `previewship --help` | 显示完整帮助文本 |
| 2 | 版本号 | `previewship -v` | 显示 `1.0.0` |
| 3 | 未登录状态 | `previewship whoami` | 显示 "Not logged in" |
| 4 | 登录 | `previewship login --key ps_live_xxx` | 保存成功 |
| 5 | 已登录状态 | `previewship whoami` | 显示 Key 前缀和配置路径 |
| 6 | 查看配额 | `previewship usage` | 显示 daily/monthly 用量 |
| 7 | 部署成功 | `previewship deploy /tmp/test-site` | 返回预览链接 |
| 8 | JSON 输出 | `previewship deploy /tmp/test-site --json` | 返回合法 JSON |
| 9 | 查询状态 | `previewship status <id>` | 显示部署详情 |
| 10 | 无效 Key | `PREVIEWSHIP_API_KEY=bad previewship usage` | 错误提示 |
| 11 | 空目录 | `previewship deploy /tmp/empty-dir` | 错误：无可部署文件 |
| 12 | MCP 启动 | MCP Inspector 连接 | 列出 3 个 Tool |
| 13 | MCP 部署 | Claude Code 中说 "deploy preview" | 返回预览链接 |

---

## 7. 发布指南

### 7.1 发布前准备

```bash
# 1. 确保代码已构建且类型检查通过
cd cli && npm run build && npx tsc --noEmit
cd ../mcp && npm run build && npx tsc --noEmit

# 2. 确认版本号
# cli/package.json  → "version": "1.0.0"
# mcp/package.json  → "version": "1.0.0"

# 3. 确认 npm 登录状态
npm whoami
# 若未登录：
npm login

# 4.（仅首次）创建 npm organization "previewship"（如需 scoped 包名）
# 当前使用非 scoped 包名 "previewship" 和 "previewship-mcp"，无需创建 org

# 5. 检查包名是否可用
npm view previewship 2>&1     # 应返回 404 或现有包信息
npm view previewship-mcp 2>&1 # 应返回 404
```

### 7.2 发布 CLI（先发布，MCP 依赖它）

```bash
cd cli

# 1. 确保 package.json 中的 files 字段正确（仅发布 dist/ 和 bin/）
# "files": ["dist", "bin"]

# 2. 检查将要发布的文件列表
npm pack --dry-run

# 3. 打包预览（生成 .tgz 文件，检查内容）
npm pack
tar -tzf previewship-1.0.0.tgz | head -20

# 4. 发布到 npm
npm publish --access public

# 5. 验证发布成功
npm view previewship
npx previewship --help  # 从 npm 直接运行
```

### 7.3 发布 MCP Server

```bash
cd mcp

# 0. mcp/package.json 依赖改成 previewship@^1.0.5

# 1.（重要）将 package.json 中 previewship 依赖从本地路径改为 npm 版本
# 修改前: "previewship": "file:../cli"
# 修改后: "previewship": "^1.0.0"

# 2. 重新安装依赖（从 npm 拉取 previewship）
rm -rf node_modules package-lock.json
npm install

# 3. 重新构建并类型检查
npm run build
npx tsc --noEmit

# 4. 检查将要发布的文件
npm pack --dry-run

# 5. 发布
npm publish --access public

# 6. 验证发布成功
npm view previewship-mcp
npx -y previewship-mcp  # 应启动 MCP Server（等待 stdin 输入后 Ctrl+C 退出）
```

### 7.4 发布后验证

```bash
# 1. CLI 端到端验证
npx previewship --help
npx previewship login --key ps_live_your_key_here
npx previewship deploy /tmp/test-site -n publish-test

# 2. MCP 端到端验证（Claude Code）
# ~/.claude/settings.json:
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
# 重启 Claude Code → "show my previewship usage" → 应返回配额信息
# → "deploy the current project as a preview" → 应返回预览链接

# 3. MCP Inspector 验证
npx @modelcontextprotocol/inspector npx -y previewship-mcp
```

### 7.5 版本更新流程

```bash
# 1. 修改代码
# 2. 更新版本号（CLI 和 MCP 同步更新）
cd cli
npm version patch  # 或 minor / major
cd ../mcp
npm version patch

# 3. 同步更新 MCP 对 CLI 的依赖版本
# mcp/package.json: "previewship": "^1.0.1"

# 4. 构建 + 发布（先 CLI 后 MCP）
cd cli && npm run build && npm publish
cd ../mcp && npm install && npm run build && npm publish

# 5. 同步更新 cli/src/api-client.ts 和 cli/src/cli.ts 中的版本号常量
```

### 7.6 发布检查清单

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | `npm run build` 通过 | CLI 和 MCP 均编译成功 |
| 2 | `tsc --noEmit` 通过 | 无类型错误 |
| 3 | `npm pack --dry-run` 正确 | 仅包含 dist/ 和 bin/，无 src/ 和 node_modules/ |
| 4 | 版本号已更新 | package.json version 字段 |
| 5 | MCP 依赖指向 npm | `"previewship": "^x.y.z"`，非 `file:../cli` |
| 6 | README 内容正确 | npm 页面展示内容 |
| 7 | CLI 先于 MCP 发布 | MCP 依赖 CLI，发布顺序不能反 |
| 8 | `npx previewship --help` 可用 | 从 npm 安装运行正常 |
| 9 | MCP Inspector 可连接 | 3 个 Tool 正常列出 |
| 10 | 端到端部署成功 | 拿到预览链接且可访问 |
