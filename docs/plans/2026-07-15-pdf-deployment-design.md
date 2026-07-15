# PDF 部署设计

## 目标

在不改变现有静态部署模型的前提下，让用户可以从控制台、免注册上传、CLI、MCP 和 VS Code/Cursor 扩展直接部署单个 `.pdf` 文件，并通过固定预览链接全屏阅读。

首版使用浏览器原生 PDF 阅读能力，不引入 PDF.js。部署根地址只负责将浏览器顶层导航到实际 PDF 文件，PDF 占满整个视口，不增加 PreviewShip 顶部工具栏。由于浏览器原生 PDF Viewer 不允许页面叠加内容，最终阅读页不显示悬浮品牌标识。

## 统一产物规范

客户端和后端沿用现有 Vercel Build Output 静态产物协议：

- 单个 PDF 被包装到 `.vercel/output/static/document.pdf`。
- 后端规范化产物后保留 `document.pdf`，并生成根目录 `index.html` 作为跳转入口。
- `index.html` 在 `<head>` 首次绘制前使用受 CSP 哈希约束的固定脚本执行 `location.replace()`，将顶层页面导航到经过安全编码的 `document.pdf`；同时保留 `meta refresh` 和手动打开原文件的双重降级。
- Vercel 和自托管渠道都消费同一份规范化文件集合，不维护渠道专属模板。

后端是入口页生成和产物优先级的唯一事实来源。新版客户端可以预先包装 PDF，后端也必须兼容直接上传的原始 `.pdf`，从而支持旧客户端升级、浏览器上传和直接 API 调用。

## 入口优先级与歧义处理

规范化产物按以下顺序决定首页：

1. 已有根目录 `index.html` 或可规范化的单 HTML 入口时，保持 HTML 首页，PDF 只作为普通静态资源。
2. 没有 HTML 但存在 Markdown 时，保持现有 Markdown viewer 行为，不因同时包含 PDF 而改变旧部署结果。
3. 没有 HTML 和 Markdown，且只有一个 PDF 时，为该 PDF 生成全屏入口。
4. 没有 HTML 和 Markdown，且存在多个 PDF 时：优先使用根目录 `index.pdf`；没有唯一 `index.pdf` 则拒绝部署并返回稳定错误码，避免随机选择首页。

单文件客户端统一使用 `document.pdf`，所以常规用户路径不会触发多 PDF 歧义；手工 ZIP 仍可用根目录 `index.pdf` 明确指定入口。

## 数据流

1. 各入口把 `.pdf` 加入允许扩展名，并保持现有套餐或免注册上传大小限制。
2. CLI 和扩展将单 PDF 包装成静态输出 ZIP；浏览器直接上传原始 PDF，由后端流式包装，避免大文件在浏览器内产生额外内存副本。
3. Worker 解包并规范化静态根目录，识别 PDF 首页候选。
4. 后端校验 PDF 文件签名以排除伪装扩展名，并生成零延迟跳转 `index.html`。
5. 现有品牌注入逻辑仍只修改生成的 HTML，不修改 PDF 二进制内容；跳转后的浏览器原生阅读页不叠加品牌标识。
6. Vercel 或自托管 Provider 发布 `index.html` 与 `index.pdf`；密码访问、过期清理、回滚和保留产物继续复用现有流程。

## 兼容性与安全

- PDF 文件仍受现有单次上传、月度流量和免注册 5 MB 限制约束。
- 校验文件开头的 `%PDF-` 签名；不引入 PDF 解析依赖，避免在 Worker 中解析不可信复杂文档。
- 生成的 HTML 只引用后端选定的相对路径，并进行 HTML 属性和 URL 编码，防止特殊文件名破坏模板。
- PDF 通过顶层导航打开，不再使用会受浏览器 MIME Handler 与页面 CSP 交互影响的 `<object>` 或 `<iframe>` 内嵌方式。
- 主路径使用固定、无动态代码拼接的抢先导航脚本，并通过精确 SHA-256 CSP 哈希授权，不开放 `unsafe-inline`；JavaScript 被禁用时由 `meta refresh` 接管。
- 中转页使用与原生 PDF Viewer 接近的深色背景，正常跳转期间不显示文字或按钮；只有跳转超过 1.5 秒仍未完成时才显示手动入口。
- 同一静态产物可以在 Vercel 和自托管渠道复用，无需新增 Provider 或 Nginx 分支。
- 自托管 Nginx 已加载标准 MIME 映射、支持静态文件 Range 请求，并且 `/index.pdf` 继续经过现有 `auth_request`，无需复制一套 PDF location。
- Vercel 静态输出按 `.pdf` 扩展名返回 `application/pdf`，继续使用现有 Build Output 发布链路。
- HTML/Markdown 旧产物的规范化顺序、Free 品牌注入和错误处理保持不变。

## 代码范围

### Backend

- `DeployService`：识别直接上传 PDF、推导项目名并包装 `document.pdf`。
- `DeploymentArtifactService`：选择 PDF 首页候选、校验签名、生成阅读入口并保留既有 HTML/Markdown 优先级。
- `ErrorCode` 与部署失败文案：增加无效 PDF 或多 PDF 歧义的稳定错误表达。
- Provider/Nginx：以回归测试确认 MIME、Range、鉴权和两种 Provider 产物一致性，避免无必要的渠道分支。

### Console

- 登录部署页、免注册页和营销上传组件接受 `.pdf`。
- 浏览器只读取少量文件头提供即时签名校验，原始 PDF 直接上传并由后端统一包装。
- 文件图标、项目名推导、上传埋点和八种语言提示同步支持 PDF。

### CLI、MCP 与扩展

- CLI 和扩展增加 PDF 类型识别及 `index.pdf` 打包函数。
- MCP 复用 CLI 核心部署函数，只更新工具 schema、描述和示例。
- 命令帮助、类型注释、README 和包元数据统一把 PDF 列为单文件输入。

## 异常与降级

- 空文件、伪 PDF 签名、多 PDF 无唯一入口：部署失败并返回可翻译的稳定错误码。
- 浏览器不支持内联 PDF：由浏览器按自身策略下载或交给外部阅读器；根入口在短暂等待后显示手动打开 PDF 的降级链接。
- PDF 加载失败：保留原生查看器错误反馈；不在前端重复下载或解析文件。
- Provider 发布失败、密码保护、项目封禁、部署过期和回滚：完全沿用现有状态机。

## 验收

- 控制台、免注册上传、CLI、MCP 和 VS Code/Cursor 均可部署单个大小写扩展名的 PDF；扩展可从 PDF 编辑器标签或资源管理器菜单部署。
- 打开固定预览根地址后，地址栏切换到实际 PDF 路径，并由原生查看器全屏打开 PDF。
- 正常跳转不显示 “Opening” 或 “Open PDF” 中转文案，最多短暂显示与原生 Viewer 一致的深色背景；降级链接仅在跳转异常时延迟出现。
- 原生 PDF 阅读页没有 PreviewShip 顶部工具栏或悬浮品牌标识。
- PDF 原文件返回正确 MIME，并支持 Range 请求；密码项目不能绕过鉴权访问 PDF。
- HTML + PDF、Markdown + PDF 的旧首页行为不变。
- 单 PDF ZIP、根目录 `index.pdf`、特殊文件名 PDF、多 PDF 歧义、伪 PDF 和直接 API 上传均有自动化测试。
- 自动化测试确认跳转入口不再生成 `<object>`，并正确编码空格、中文和 HTML 特殊字符文件名。
- 后端测试、Console 类型检查/构建、CLI/MCP 类型检查与构建、扩展构建全部通过。
