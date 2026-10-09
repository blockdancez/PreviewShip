# 发布与后台审核分离 Implementation Plan

> **For agentic workers:** 按下列任务实施；本次使用现有 content_risk、review_blocking、risk_ui 子代理，主代理负责发布入口整合和版本交付。未经用户授权不提交 Git 或部署生产。

**Goal:** 普通发布先成功，后台可靠审核并自动下架、通知、整改恢复。

**Architecture:** 复用 ContentRiskCheck 和通知 outbox；保存规范化快照，独立调度与撤销任务通过数据库租约恢复。可整改隔离与永久 Abuse 封禁分离，所有公开创建/激活入口使用同一门禁。

**Tech Stack:** Spring Boot / Java、PostgreSQL / Flyway、Redis、React / TypeScript、既有自托管与 Vercel provider。

**Spec:** [design.md](design.md)

## Global Constraints

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
