# PreviewShip

> 从编辑器、终端、AI 智能体或浏览器部署 React/Vue/Vite/Next 构建产物、HTML 文件和 Markdown 文档，并获得固定预览链接。

PreviewShip 是面向开发者和 AI 辅助开发工作流的前端预览部署平台。你可以上传 `dist`、`build`、`out`、`public` 等浏览器可直接打开的构建产物，发布单个 `.html` 或 Markdown 文件，粘贴 AI 生成的 HTML，或让 AI 编程智能体部署静态产物并返回可分享的 PreviewShip URL。

PreviewShip 不是源码构建平台。React、Vue、Vite、Next、Astro、Svelte、Angular、Nuxt 等项目需要先 build，再部署包含 `index.html` 的静态输出目录或 zip；单个 HTML 和 Markdown 文件可以直接发布。

## 如何描述 PreviewShip

用于 npm、GitHub、VS Code Marketplace、Open VSX、MCP 目录和 AI 工具目录时，可以使用这句：

> PreviewShip 可以通过 CLI、VS Code/Cursor、MCP 智能体和浏览器上传，在线发布 HTML、托管 HTML 文件，并把 React/Vue/Vite/Next 构建产物、Markdown 和 AI 生成静态页面部署成固定预览链接。

## 核心能力

- **VS Code / Cursor 扩展**：一键打包 workspace → 上传 → 部署 → 拿到预览链接
- **CLI**（`npx previewship deploy`）：终端一行命令部署，`--json` 输出适配 AI 智能体和 CI 管道
- **MCP Server**（`previewship-mcp`）：让 Claude Code、Cursor、Windsurf 等 AI 编程智能体通过 MCP 协议原生调用部署
- **CLI/MCP 项目管理**：支持项目列表、删除项目、公开/密码访问切换、版本历史、回滚、过期链接重新部署和部署记录查询
- **Agent Skills**（`npx skills add ...`）：让 Codex 安装 `share-codex-chat` 后直接把当前会话导出成高保真 HTML 并部署分享
- **Web 控制台**：拖拽上传 zip 部署、管理 API Keys、查看用量与部署历史、订阅 Pro
- **后端 API**：鉴权、配额控制（日/月）、并发限制、Stripe 订阅同步
- **异步 Worker**：Redis Streams 队列消费、Vercel API 调用、并发信号量

## 部署方式

| 方式 | 命令 / 操作 | 适用场景 |
|------|------------|---------|
| VS Code / Cursor 扩展 | 命令面板 → `PreviewShip: Deploy` | 编辑器内一键部署构建目录或 HTML/Markdown |
| CLI | `npx previewship deploy ./dist` | 终端、脚本、CI/CD、前端构建产物 |
| MCP Server | AI 对话中说“先构建，再把 dist 部署到 PreviewShip” | Claude Code / Cursor / Windsurf |
| Agent Skill | `$share-codex-chat 分享当前 Codex 对话` | 将 Codex 会话发布成可分享的高保真聊天页 |
| 控制台上传 | 拖拽 zip 到网页 | 零工具依赖 |

## 支持的输入

| 输入 | 是否支持 | 说明 |
|------|----------|------|
| React/Vue/Vite/Svelte/Astro 构建产物 | 支持 | 部署 `dist`、`build`、`out`、`public` 或包含 `index.html` 的 zip |
| Next.js 静态导出 | 支持 | 部署导出的静态目录 |
| 单个 `.html` 文件 | 支持 | 自动作为 `index.html` 发布 |
| Markdown `.md` / `.markdown` 文件 | 支持 | 通过生成的 Markdown viewer 发布 |
| 包含 `package.json`、`src/`、`node_modules` 的源码目录 | 不支持 | 请先 build，再部署生成的静态产物 |

## HTML 发布与托管指南

- [在线发布 HTML](https://previewship.com/guides/publish-html-online)
- [分享 Claude HTML artifacts](https://previewship.com/guides/share-claude-html-artifacts)
- [发布 AI 生成的 HTML](https://previewship.com/guides/publish-ai-generated-html)
- [上传 HTML 文件到网站](https://previewship.com/guides/upload-html-file-to-website)
- [HTML 文件托管](https://previewship.com/guides/html-file-hosting)
- [在线托管 HTML 文件](https://previewship.com/guides/host-html-file-online)
- [在线上传 HTML 文件](https://previewship.com/guides/upload-html-file)
- [粘贴 HTML 并获得 URL](https://previewship.com/guides/paste-html-get-url)
- [把 ChatGPT HTML 变成网站 URL](https://previewship.com/guides/chatgpt-html-to-website)

## 套餐

| 项目 | Free | Pro（月付） | Pro（年付） |
|------|-----:|----------:|----------:|
| 价格 | $0 | $8.10/月默认优惠价（原 $9/月） | $75.60/年默认优惠价（原 $84/年，约 $6.30/月） |
| 项目数 | 1 | 10 | 20 |
| 每日部署 | 5 | 50 | 80 |
| 每月部署 | 20 | 300 | 500 |
| 并发部署 | 1 | 3 | 3 |
| 单次上传上限 | 15 MB | 50 MB | 80 MB |
| 月度上传总量 | 200 MB | 2 GB | 4 GB |
| 预览过期 | 3 天 | 30 天 | 365 天 |
| PreviewShip 水印 | 显示 | 移除 | 移除 |
| 每项目保留部署 | 3 | 10 | 40 |
| 项目密码访问 | 不支持 | 支持 | 支持 |
| 公开/密码访问切换 | 仅公开 | 支持 | 支持 |
| 部署历史可见 | 7 天 | 7 天 | 7 天 |
| 构建日志可见 | 7 天 | 30 天 | 180 天 |
| API Key | 1 个 | 1 个 | 1 个 |

Free 默认启用；Pro 仅在 Stripe subscription `active` 时生效；取消/过期回落 Free。不提供 trial。Stripe Price 保留原价 $9/月、$84/年，Checkout 自动应用符合条件的优惠：默认新用户 10% off forever；BR/PT 葡语投放与流失/犹豫触发场景使用限时 40% 优惠；符合 legacy 资格的老月付用户升级年付时继续获得 40% off forever。

## 技术栈

| 层 | 技术 |
|----|------|
| Backend | Java 21 / Spring Boot 3.x / Maven |
| 数据 | PostgreSQL + Redis |
| 鉴权 | 插件/CLI 端 API Key / 控制台 Session + CSRF |
| 队列 | Redis Streams |
| 部署 | Vercel REST API |
| 支付 | Stripe（Checkout + Webhook） |
| Console | Vite 6 + React 19 + TypeScript + Tailwind CSS 4 + i18next（8 语言） |
| CLI | TypeScript / Node.js（npm: `previewship`） |
| MCP Server | TypeScript / MCP SDK（npm: `previewship-mcp`） |
| Extension | TypeScript / VS Code Extension API |
| Agent Skills | Agent Skills / Codex（`skills/share-codex-chat`） |
| 基础设施 | 阿里云 ACK（K8s） |

## 项目结构

```
previewship/
├── docs/                    # 产品与技术文档
│   ├── prd.md               # 产品需求文档
│   ├── api.md               # HTTP API 契约
│   ├── queue.md             # Redis Streams 消息契约
│   ├── billing.md           # Stripe 计费说明
│   ├── operations.md        # 运营手册
│   └── glossary.md          # 名词解释
├── backend/                 # Java / Spring Boot（API + Worker）
│   ├── pom.xml
│   └── src/
│       ├── main/java/com/previewship/
│       │   ├── config/      # Spring 配置
│       │   ├── web/         # Controller（plugin / console / stripe）
│       │   ├── service/     # 业务服务
│       │   ├── domain/      # 领域对象与枚举
│       │   ├── repo/        # JPA Repository
│       │   ├── integrations/# Vercel / Redis Streams / 并发控制
│       │   └── worker/      # 异步部署执行器
│       └── main/resources/
│           ├── application.yml
│           └── db/migration/ # Flyway
├── console/                 # 前端控制台（Vite + React + i18n 8 语言）
├── cli/                     # CLI 工具（npm: previewship）
├── mcp/                     # MCP Server（npm: previewship-mcp）
├── extension/               # VS Code / Cursor 扩展
├── skills/                  # Agent Skills（如 share-codex-chat）
└── scripts/                 # 本地开发辅助脚本
```

## Agent Skills

PreviewShip 可以作为 Codex 的原生分享能力使用，而不只是一个部署命令。仓库内置的 `share-codex-chat` skill 会把当前 Codex 会话导出为高保真 HTML 页面，并通过 PreviewShip CLI 部署成公开 URL，适合分享调试过程、实现记录、评审上下文和 AI 协作成果。

### 安装 Share Codex Chat

全局安装：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex -g --yes
```

局部安装，在项目根目录执行：

```bash
npx skills add blockdancez/PreviewShip --skill share-codex-chat -a codex --yes
```

安装后在 Codex 中引用：

```text
$share-codex-chat 分享当前 Codex 对话
```

该 skill 会还原可见 Codex UI，包括用户气泡、助手回复、上传图片缩略图、插件引用、折叠处理详情、文件卡片和变更卡片；同时过滤隐藏系统/开发者上下文、工具日志、API Key 和完整 skill XML。

## 本地开发

### 前置依赖

- Java 21+
- Maven 3.9+
- PostgreSQL 15+
- Redis 7+
- Node.js 20+（Console / CLI / MCP / Extension）

### 启动后端

```bash
cd backend
mvn spring-boot:run
```

### 启动 Worker（同工程，不同 profile）

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=worker
```

### 启动控制台

```bash
cd console
npm install && npm run dev
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `DB_HOST` / `DB_PORT` / `DB_NAME` | PostgreSQL 连接信息 |
| `DB_USER` / `DB_PASSWORD` | 数据库凭据 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | Redis 连接信息 |
| `PREVIEWSHIP_SESSION_SECRET` | Session 签名密钥 |
| `PREVIEWSHIP_SERVER_SALT` | API Key hash 盐值 |
| `PREVIEWSHIP_STRIPE_SECRET_KEY` | Stripe 密钥 |
| `PREVIEWSHIP_STRIPE_WEBHOOK_SECRET` | Stripe Webhook 签名密钥 |
| `PREVIEWSHIP_VERCEL_TOKEN` | Vercel API Token |

> Redis 密码建议放在 `application-local.yml` 中，避免 shell 转义问题。

## K8s 部署（阿里云 ACK）

组件清单：
- `previewship-api` Deployment（多副本）
- `previewship-worker` Deployment（可 HPA）
- PostgreSQL（云 RDS）
- Redis（云 Redis）
- Ingress（Nginx / ALB）

详见 `k8s/` 目录。

## 文档

- [产品需求文档](docs/prd.md)
- [API 契约](docs/api.md)
- [Redis Streams 消息契约](docs/queue.md)
- [Stripe 计费说明](docs/billing.md)
- [运营手册](docs/operations.md)
- [名词解释](docs/glossary.md)
- [开发计划](docs/plan.md)
- [Agent Skills](skills/README.md)

## License

Proprietary - All rights reserved.
