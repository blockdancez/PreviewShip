# 发布与后台审核分离 Implementation Plan

> **For agentic workers:** 按下列任务实施；本次使用现有 content_risk、review_blocking、risk_ui 子代理，主代理负责发布入口整合和版本交付。未经用户授权不提交 Git 或部署生产。

**Goal:** 普通发布先成功，后台可靠审核并自动下架、通知、整改恢复。

**Architecture:** 复用 ContentRiskCheck 和通知 outbox；保存规范化快照，独立调度与撤销任务通过数据库租约恢复。可整改隔离与永久 Abuse 封禁分离，所有公开创建/激活入口使用同一门禁。

**Tech Stack:** Spring Boot / Java、PostgreSQL / Flyway、Redis、React / TypeScript、既有自托管与 Vercel provider。

**Spec:** [design.md](design.md)

## Global Constraints

管理员手动通知增量沿既有 outbox：增加 V44 的来源/范围约束和幂等索引，贯通项目/用户/部署封禁与事务入队，账号→项目锁顺序；首次发送准备八语言安全模板，异常独立退避；管理弹窗与通知进度有界查询。验证按真实隔离 H2 事务→模板/鉴权→Console 单测/类型/lint/构建→本机 PostgreSQL V2–V42、V44 顺序，禁止真实客户封禁或发信。验证结果统一更新 verification.md，不另建过程报告。

版本 2.0.1；代码注释使用中文；不写共享测试/生产库、不发送真实邮件；会员权益保持现有值；审核 UNKNOWN/HOLD 不能伪装 PASS；普通发布不等 AI；整改在公开渠道创建前完成审核；版本交付集中当前目录。

## Task 1：独立审核任务与快照

Files：ContentRiskService、ContentRiskCheck、ContentRiskCheckRepository；新增规范化快照服务和审核调度器；V40 迁移；后台任务行为测试。

- [x] 先验证 READY + PENDING 可持久化领取、宕机租约恢复且旧记录不参与。
- [x] 实现设计文档的 registerBackgroundReview、requirePreparedForPublication、requireNotKnownUnsafe、processDuePublishedReviews 接口。
- [x] 校验快照 hash、重复领取、运行栅栏、SUPERSEDED 旧版及技术错误重试。
- [x] 定向测试通过并记录证据。

## Task 2：可整改隔离与可靠撤销

Files：Project、ContentIsolationService、撤销任务实体/仓库/调度器、ProjectAccessService、provider 严格删除方法；V41 迁移；隔离行为测试。

- [x] 先验证 A 迟到 HOLD 不误封不同 hash 的 B，latest 风险会关闭全部别名入口。
- [x] 实现 applyConfirmedRisk、requiresPrePublishReview、clearAfterVerifiedActivation。
- [x] 将删除失败交给持久任务重试；404 视为已撤销；同 hash 副本按确认风险处理。
- [x] 验证整改通过、永久封禁、归档、删除和并发边界。

## Task 3：主发布链路与 API

Files：DeploymentWorker、ActivePreviewService、DeployService、ConsoleController、Guest/Plugin API、Showcase/索引入口；发布行为测试。

- [x] 将普通发布的 review 调用移出 Worker；渠道创建事务先登记实际快照。
- [x] 内容隔离时仍前置 review；创建与激活项目锁内二次校验，恢复须 PASS。
- [x] 补充 urlStatus/contentRestricted，覆盖列表、回滚、认领与归档恢复。
- [x] 测试审核不会挡普通 READY、整改仍受门禁、权益与原版本可用性。

## Task 4：邮件与用户交互

Files：ContentRiskNotificationService/安全邮件模板；console hooks、页面、列表、类型、八语言文案与行为脚本。

- [x] 验证 READY 后按钮停止 loading、后台审核继续有界更新。
- [x] 全部打开/复制入口使用服务端 urlStatus；风险整改操作保留项目上下文。
- [x] 安全邮件按真实处置状态发送，技术 UNKNOWN 不发违规信；游客不假称邮件。
- [x] 校验八语言缺失键、重复点击、重新上传/整改 loading 与断连恢复。

## Task 5：统一验证与交付

- [x] 执行后端定向/全量打包，前端测试、类型检查、lint 与构建。
- [x] 检查跨模块依赖、生命周期、竞态、文件清理、迁移兼容和已知风险入口。
- [x] SQL 在 sql/ 中以运行迁移引用及只读验收交付；填写配置差异、上线与回滚清单。
- [x] 记录所有实际结果、未执行项，保持代码未提交且不标记生产已完成。

## 钓鱼漏检修复（2026-10-12，用户已批准）

范围沿用本版本的快速后台审核；未授权提交或部署。实施顺序：

- [x] 有界静态解码、虚拟审核源与原制品摘要绑定；关联唯一字面 URL 变量外发及敏感页本地脚本。
- [x] 保留证据脱敏与完整预算；编码不透明或超限不能因零候选变成 PASS。
- [x] 将实际模型风险未决与纯技术故障分开；前者暂隔离并自动复核，后者保持原异步发布。
- [x] 使用可验证的敏感读取、实际外传及隐藏/欺骗组合确认风险；独立有效 HIGH/SAFE 可纠正未决结果，同轮修复降级不能解除风险。
- [x] 风险审计独立于项目删除，已确认摘要持续拦截；风险账号后续提交前置审核。
- [x] 管理员核验后登记 Cloudflare 报告，幂等封禁全项目与持久渠道撤销；不消费未认证邮件指令。
- [x] 八语言暂隔离、自动复核、恢复与管理端审核方式展示；维持复制/打开守卫及有界轮询。
- [x] 单线程后端整体验证、完整迁移、前端构建和安全链路独立评审收尾；结果只写 verification.md，外部验收限制单独列出。

SQL 新增 V42，正文唯一维护在 backend Flyway 目录，交付引用在 sql/README.md。真实样本及临时日志留在仓库外，不进入回归夹具。

## 共享托管审核边界优化（2026-10-14，用户已批准）

沿用 2.0.1，主代理实施，独立子代理只读评审；无新增 SQL/接口。保留现有证据、租约、隔离和额度契约。

- [x] 修改 `OpenRouterContentRiskClient.SYSTEM`，明确托管域名不是客户身份、自有账户与第三方账户区别、外部 API/OAuth/SSO/原型的正常边界，同时禁止用演示声明或 API 名称豁免真实窃密。
- [x] `ContentRiskScanner` 补 Zoho 候选且明确品牌提及不等于仿冒；`ContentRiskProperties` 和 `application.yml` 同步 v9，保留全部召回及危险行为门槛。
- [x] `ContentRiskSharedHostingTest` 覆盖正常登录注册、独立 API、混合 OAuth、企业 SSO、非收集原型与第三方会话钓鱼/机器人外传/编码隐藏等近邻；严格引用与真实 Service 评分贯通。
- [x] 单线程 Maven 定向回归与最终打包；显式开启合成真实模型评测，记录实际模型结果和限制，更新现有验证/发布正文，不提交或部署。

## 取消邮箱自动接入（2026-10-14，用户已明确要求）

移除未发布的邮箱连接/解析/游标、外部告警持久任务与独立完整源复核、管理页接入状态及 V43；保留共享托管 v9、既有后台风险复核/隔离/恢复、可信投诉登记和 V44 管理员邮件。沿既有源测试和临时 PostgreSQL 重新验证，当前结果仅写 verification.md，不将撤销实现的旧测试计数作为当前验收。
