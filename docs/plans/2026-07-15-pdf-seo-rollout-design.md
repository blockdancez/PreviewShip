# PDF SEO 内容落地设计

## 背景

PreviewShip 已支持单个 PDF 上传，并通过浏览器原生阅读器提供全屏预览。当前部署页、主要文档和落地页正文已经出现 PDF，但首页实际 SEO 元数据仍由 `public-page-copy.ts` 提供，部分描述仍只覆盖 HTML/Markdown；公开内容层也没有独立的 PDF 搜索入口。

本次目标不是全站机械替换格式列表，而是在不稀释既有 HTML/Markdown 专题关键词的前提下，让通用产品页面准确反映 PDF 能力，并建立一个承接 PDF 搜索意图的独立页面。

## 决策

采用“通用页面补能力 + 独立 PDF 页面承接搜索意图 + 专题页保持聚焦”的方案。

- 首页 title 和主要 H1 暂不改变，降低既有关键词定位变化。
- 首页 description、Open Graph、SoftwareApplication 结构化数据、页脚通用描述和可见格式列表加入 PDF。
- 新增一个英文优先、可索引的 PDF 指南页面，集中覆盖 upload PDF online、host PDF online、share PDF as a link 和 PDF to URL 等相近意图。
- PDF 页面复用现有 `PublicContentPage`、SSG、sitemap、FAQ 和 TechArticle Schema 链路，不创建重复页面组件。
- Guides 首页把 PDF 页面加入高意图内容入口；通用 Content Hub 文案加入 PDF。
- CLI、MCP、Cursor、VS Code 等通用文档内容选择性补充 PDF。
- HTML/Markdown 专题页不改 title、H1、canonical 和核心正文，只在确有帮助的位置增加相关 PDF 内链，避免关键词竞争。
- 不批量修改所有长尾内容，也不把 npm/扩展商店 keywords 当作官网 SEO 工作替代品。

## 页面与数据流

### 首页

`LandingPage` 继续从 `public-page-copy.ts` 读取 SEO 文案。各语言的 description 和 Open Graph description 增加 PDF，title 保持现状。`SoftwareApplication.description` 继续复用同一份文案，避免元数据与结构化数据分叉；`dateModified` 更新到本次能力上线日期。

`landing.json` 中首页输入事实和格式徽标加入 PDF，使首屏可见内容与 SEO 描述一致。

### PDF 指南

在 `public-content.ts` 增加 `guides/upload-pdf-online`：

- 说明单 PDF 直接上传、全屏原生阅读、固定链接、免注册试用、密码访问和现有上传限制。
- 明确 PreviewShip 不编辑 PDF，也不提供 Acrobat 式批注、签名或内容修改。
- 提供真实步骤、适用场景、对比表和 FAQ。
- 关联 CLI、MCP、客户端评审链接与静态托管指南。

该页面首版使用英文原创内容并进入英文 sitemap；不自动生成模板化多语言版本。后续根据 Search Console 展现和点击数据决定本地化优先级。

### 内部链接与内容中心

Guides 首页将 PDF 页面列入高意图入口。Content Hub 的通用输入描述加入 PDF。HTML/Markdown 专题页面保持原有搜索主题，只在相关能力说明中提供 PDF 页面链接，不改其主关键词。

## 索引与 Schema

- PDF 指南沿用现有 `CURATED` 英文内容策略，自动进入预渲染、sitemap 和 llms 内容生成。
- 新页面使用现有 TechArticle、BreadcrumbList 和 FAQPage Schema。
- Schema 中的 FAQ 必须同时显示在页面正文中。
- 首页 SoftwareApplication 描述与页面 meta description 使用同一数据源。
- 不创建多个同义 PDF 页面，避免 upload/host/share PDF 意图之间产生站内竞争。

## 测试

- 公共内容测试确认 `guides/upload-pdf-online` 存在、可索引并包含 PDF 专属内容。
- SEO 生成后确认新 URL 出现在英文 sitemap、预渲染 HTML、llms.txt 或 llms-full.txt 中。
- 确认不存在自动生成的非英文 PDF URL。
- 检查首页预渲染 HTML 的 description、Open Graph 和 JSON-LD 均包含 PDF。
- 执行 JSON 校验、TypeScript、ESLint、单元测试、SEO 验证和 Vite 生产构建。

## 非目标

- 不修改 PDF 部署实现。
- 不承诺 PDF 编辑、批注、签名、转换或访问统计功能。
- 不一次性翻译 PDF 指南到所有语言。
- 不全量重写现有 HTML/Markdown 长尾内容。
