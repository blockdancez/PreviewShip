# PreviewShip 内容信任与发布安全治理实施计划

- 日期：2026-09-01
- 状态：可实施
- 关联设计：[PreviewShip 内容信任与发布安全治理设计](../superpowers/specs/2026-09-01-preview-security-governance-design.md)
- 仓库：根仓库负责设计/运行手册，`backend/` 和 `console/` 为独立 Git 仓库，必须分别提交和验证

## 实施目标

本计划交付三条相互配合但可独立回滚的能力：

1. Search Console 安全事件的全域清理、证据和人工复审闭环。
2. 新账号默认无感 `noindex`，内部信誉满足条件后自动开放，风险账号人工复核。
3. Abuse 后台显示业务状态、访问配置、真实 HTTP、精确 URL 和各平台域安全信誉。

任何信誉状态、等待时间和内部安全原因都不得进入用户控制台、用户 API、CLI、MCP、扩展、邮件或发布提示。标准 `X-Robots-Tag` 仍按协议对 crawler 和 HTTP 客户端可见。

## 实施纪律

- 每项后端行为先写失败测试，再做最小实现，再运行定向测试。
- 外部网络测试全部使用 fake transport；测试套件不得访问真实 Preview、Google 或 Web Risk。
- 外部探测只在 Worker 中执行，数据库事务内只领取任务或写回结果。
- 所有新开关默认保守：诊断可关闭、供应商缺失返回 UNKNOWN、自动晋级先 shadow、索引策略失败时 noindex。
- 不复用 `AccountPolicy` 承载信誉；不复用 Deployment Redis Stream 承载诊断；不复用日报飞书配置发送安全告警。
- 不把 `NO_MATCH` 命名为 `CLEAN`，不把共享平台域命中自动归因到某个用户。
- 不修改无关公开 SEO 文案，不新增用户可见信誉字段。

## 上线依赖顺序

```text
V33 信誉数据模型
  → 信誉评估与后台人工动作（shadow）
  → Preview/Showcase/sitemap/IndexNow 最终索引策略

V34 诊断快照与缓存
  → 安全目标解析和 HTTP 探测
  → Web Risk 与多平台域缓存
  → 管理 API
  → Console 内部页面
  → 生产观测和全域清理
  → Search Console 人工复审
```

数据库迁移必须先于依赖新字段的应用版本。Console 只能在后端兼容返回新字段后发布。

## P0：配置开关和不可见性契约

### 修改文件

- `backend/src/main/java/com/previewship/config/PreviewShipProperties.java`
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/application-local.yml`
- `backend/src/main/resources/application-prod.yml`
- 新增 `backend/src/test/java/com/previewship/config/PreviewSecurityPropertiesTest.java`

### 实现

新增两个独立配置节点：

```yaml
previewship:
  reputation:
    enforce-index-policy: ${PREVIEWSHIP_REPUTATION_ENFORCE_INDEX_POLICY:false}
    auto-promotion-enabled: ${PREVIEWSHIP_REPUTATION_AUTO_PROMOTION_ENABLED:false}
    minimum-age-days: 7
    minimum-ready-deployments: 3
    minimum-active-days: 2
  diagnostics:
    enabled: ${PREVIEWSHIP_DIAGNOSTICS_ENABLED:false}
    http-probe-enabled: ${PREVIEWSHIP_DIAGNOSTICS_HTTP_ENABLED:false}
    reputation-enabled: ${PREVIEWSHIP_DIAGNOSTICS_REPUTATION_ENABLED:false}
    provider: ${PREVIEWSHIP_DIAGNOSTICS_REPUTATION_PROVIDER:NONE}
    platform-domains:
      - previewship.net
      - previewship.cc
      - previewship.com
      - mellowcade.com
```

诊断配置同时包含批量、并发、租约、冷却、TTL、DNS/connect/total timeout、正文上限和重试次数。Web Risk API key 只从 Secret 环境变量读取，不写入 Git 或数据库。

测试锁定：

- 默认不执行外呼；
- 生产 key 缺失时 provider 自动降级为 NONE/UNKNOWN，应用仍能启动；
- 域名列表去空、转小写、去重，只允许合法 hostname；
- 阈值必须大于零，超时和正文上限有合理上界。

### 验证

```bash
cd backend
mvn -q -Dtest=PreviewSecurityPropertiesTest test
```

### 提交

```text
feat: add preview security feature flags
```

## P1：V33 账号信誉数据模型

### 新增文件

- `backend/src/main/resources/db/migration/V33__add_account_reputation.sql`
- `backend/src/main/java/com/previewship/domain/AccountReputationState.java`
- `backend/src/test/java/com/previewship/repo/MigrationV33SafetyTest.java`

### 修改文件

- `backend/src/main/java/com/previewship/domain/User.java`
- `backend/src/main/java/com/previewship/repo/UserRepository.java`
- `backend/src/main/java/com/previewship/repo/DeploymentRepository.java`
- `backend/src/test/java/com/previewship/config/FlywayMigrationHistoryTest.java`

### 测试先行

`MigrationV33SafetyTest` 先断言以下内容并观察失败：

- User 四个字段均为 NOT NULL 且有安全默认值；
- BLOCKED/已有 Abuse 用户回填为 RESTRICTED；
- INTERNAL ACTIVE 用户回填 ESTABLISHED；
- CUSTOMER 只有满足 7 天、3 次原始成功、跨 2 个 UTC 日期且无 Abuse 时回填 ESTABLISHED；
- rollback、redeploy、subscription restore、guest 不计入；
- 存在候选用户索引和 `(user_id, ready_at)` 部分索引。

### 实现

在 User 增加：

```text
reputation_state          VARCHAR(24) NOT NULL DEFAULT 'PENDING'
reputation_reason         VARCHAR(64) NOT NULL DEFAULT 'NEW_ACCOUNT'
reputation_changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
reputation_evidence_since TIMESTAMPTZ NOT NULL DEFAULT now()
```

`@PrePersist` 对新用户将 `reputationEvidenceSince` 与 `createdAt` 对齐。状态只定义 `PENDING | ESTABLISHED | RESTRICTED`；reason 保持受控字符串常量，避免为每个运营原因频繁迁移数据库 enum。

Repository 增加：

- `findByIdForUpdate` 继续作为唯一迁移锁；
- 分页获取到达年龄线的 PENDING CUSTOMER；
- 聚合 `evidence_since` 之后的权威成功次数和 UTC 日期数；
- 判断 User/Project/Deployment 是否存在 Abuse/BLOCKED。

聚合以 `ready_at IS NOT NULL` 为成功事实，不能只检查当前 status，因为成功版本可能已变为 SUPERSEDED/EXPIRED。

### 验证

```bash
cd backend
mvn -q -Dtest=MigrationV33SafetyTest,FlywayMigrationHistoryTest test
```

### 提交

```text
feat: add internal account reputation state
```

## P2：信誉状态机、shadow 评估和管理员动作

### 新增文件

- `backend/src/main/java/com/previewship/service/AccountReputationService.java`
- `backend/src/main/java/com/previewship/worker/AccountReputationScheduler.java`
- `backend/src/test/java/com/previewship/service/AccountReputationServiceTest.java`
- `backend/src/test/java/com/previewship/worker/AccountReputationSchedulerTest.java`

### 修改文件

- `backend/src/main/java/com/previewship/worker/DeploymentWorker.java`
- `backend/src/main/java/com/previewship/service/AbuseModerationService.java`
- `backend/src/main/java/com/previewship/service/ProjectAccessService.java`
- `backend/src/main/java/com/previewship/web/AbuseAdminController.java`
- `backend/src/test/java/com/previewship/service/ProjectAccessServiceTest.java`
- 新增或扩展 Abuse 管理测试

### 测试先行

覆盖状态边界：

1. 7 天、3 次原始成功、跨 2 日、无 Abuse 才生成 `AUTO_CRITERIA_MET` 决策。
2. 少任一条件、部署来源不合格或账号非 ACTIVE/CUSTOMER 时不晋级。
3. RESTRICTED 永不自动晋级。
4. 人工 RESET 迁移到 PENDING 并重置 evidenceSince，旧证据不再使用。
5. 人工 APPROVE 可以直接 ESTABLISHED，并记录管理员和理由到安全审计日志。
6. 任一项目/部署确认 Abuse，ESTABLISHED 立即降为 RESTRICTED。
7. evaluator 异常不能反向导致 Deployment 失败。
8. 同一用户并发评估通过行锁只产生一次迁移。

### 实现

- `AccountReputationService.evaluate(userId)` 是自动条件的唯一入口。
- `recordRestriction(userId, reason)`、`manualReset(adminId, userId, reason)`、`manualApprove(...)` 是人工/Abuse 入口。
- 状态改变时更新四个 User 字段、写结构化 `security.audit` 日志，并失效该用户全部 Preview 缓存。
- `DeploymentWorker` 在 READY 和最终 `deploymentRepository.save` 成功后调用 evaluator；捕获异常只告警。
- Scheduler 每小时分页处理年龄达标的 PENDING 用户，并复用同一 evaluator。
- `auto-promotion-enabled=false` 时只计算并输出 Micrometer 计数/结构化日志，不修改状态；人工动作仍有效。
- AbuseModerationService 在项目或部署封禁事务内调用 restriction；用户全封禁逻辑保持现状且优先级最高。

管理员新增命令式接口，不接受任意状态字符串：

```http
POST /console/admin/abuse/users/{userId}/reputation
Content-Type: application/json

{"action":"APPROVE|RESET","reason":"..."}
```

只有内部 Abuse 用户响应增加 reputation；所有用户侧 Controller/DTO 不修改。

### 验证

```bash
cd backend
mvn -q -Dtest=AccountReputationServiceTest,AccountReputationSchedulerTest,ProjectAccessServiceTest test
```

### 提交

```text
feat: evaluate and moderate account reputation
```

## P3：原始 Preview 的最终索引策略

### 修改文件

- `backend/src/main/java/com/previewship/repo/ProjectRepository.java`
- `backend/src/main/java/com/previewship/service/ProjectAccessService.java`
- `backend/src/main/java/com/previewship/web/PreviewAccessController.java`
- `backend/nginx/nginx.conf`（仅在测试证明后端响应不能独立完成时修改）
- `backend/src/test/java/com/previewship/service/ProjectAccessServiceTest.java`
- `backend/src/test/java/com/previewship/web/PreviewAccessControllerTest.java`
- `backend/src/test/java/com/previewship/config/NginxPreviewAccessConfigTest.java`

### 测试先行

- 只有 User ACTIVE + ESTABLISHED、Project ACTIVE + PUBLIC、非 Guest 才 index。
- PENDING、RESTRICTED、PASSWORD、PRIVATE、Guest、User BLOCKED、Project BLOCKED、缺失用户均 noindex。
- allowed + noindex 不改变 2xx 访问结果。
- robots 对 noindex 页面允许 crawler 请求页面，不能返回 `Disallow: /` 阻止读取 `X-Robots-Tag`。
- 信誉开关关闭时保持当前索引行为，方便首次部署和紧急回滚。
- 用户 API 响应不新增信誉或等待字段。

### 实现

- ProjectRepository 增加 preview access projection，一次 join User 获取 `userStatus` 和 `reputationState`。
- `PreviewAccessProject` 缓存投影增加 userId/userStatus/reputationState，继续使用现有短 TTL，不额外查库。
- `isPubliclyIndexable` 应用完整条件和 feature flag；异常保持 noindex。
- `invalidatePreviewAccessForUser(userId)` 在低频状态变化时使该用户所有缓存条目失效，并保持“事务内 + afterCompletion”双失效模式。
- PreviewAccessController 保持 `X-Robots-Tag` 作为唯一最终指令；robots 对存在但 noindex 的内容返回 Allow，访问控制继续由 auth_request 决定。
- 更新 Nginx 约束测试，确认 Header 仍加到 HTML 和资源，滚动发布顺序仍为后端先行。

### 验证

```bash
cd backend
mvn -q -Dtest=ProjectAccessServiceTest,PreviewAccessControllerTest,NginxPreviewAccessConfigTest test
```

用本地环境额外验证：

```bash
test -n "$PREVIEW_SECURITY_TEST_URL"
curl -I "$PREVIEW_SECURITY_TEST_URL/"
curl "$PREVIEW_SECURITY_TEST_URL/robots.txt"
```

验收只检查访问结果和响应头，不在用户页面增加提示。

### 提交

```text
feat: enforce internal preview index policy
```

## P4：Showcase、sitemap 和 IndexNow 一致性

### 修改文件

- `backend/src/main/java/com/previewship/service/ShowcaseService.java`
- `backend/src/main/java/com/previewship/web/ShowcaseController.java`
- `backend/src/main/java/com/previewship/repo/ShowcaseItemRepository.java`
- `backend/src/main/java/com/previewship/service/IndexNowOutboxService.java`
- `backend/src/test/java/com/previewship/service/ShowcaseServiceTest.java`
- `backend/src/test/java/com/previewship/web/ShowcaseControllerTest.java`
- `backend/src/test/java/com/previewship/repo/ShowcaseRepositoryQueryShapeTest.java`
- `backend/src/test/java/com/previewship/service/IndexNowOutboxServiceTest.java`

### 测试先行

- Showcase 现有内容质量资格和用户可见 reasons 不出现信誉状态。
- PENDING 用户的 Showcase 详情仍可按原产品规则打开，但页面 meta 为 noindex。
- sitemap 只包含 ESTABLISHED 用户的最终有效条目。
- ESTABLISHED、PENDING、RESTRICTED 迁移都会为受影响 Showcase URL 入 IndexNow outbox。
- 聚合页展示规则不因内部信誉改变，用户提交状态保持不变。
- Public/User DTO 不新增 `reputationState` 或 `reputationReason`。

### 实现

- 将现有“内容质量资格”和“最终搜索索引策略”拆成两个内部方法。
- `ShowcaseItemView.indexable/indexabilityReasons` 保留现有产品语义，不注入账号信誉；Controller 渲染 meta 时使用独立的内部最终策略。
- sitemap repository query join User 并要求 ESTABLISHED。
- AccountReputationService 完成真实状态迁移后，批量获取该用户 Showcase item ID 并复用现有 outbox 入队。
- 降级同样通知 IndexNow，以促进搜索引擎重抓 noindex；IndexNow 失败不回滚信誉状态。

### 验证

```bash
cd backend
mvn -q -Dtest=ShowcaseServiceTest,ShowcaseControllerTest,ShowcaseRepositoryQueryShapeTest,IndexNowOutboxServiceTest test
```

### 提交

```text
feat: align showcase indexing with reputation
```

## P5：V34 诊断队列、快照和共享信誉缓存

### 新增文件

- `backend/src/main/resources/db/migration/V34__add_admin_project_diagnostics.sql`
- `backend/src/main/java/com/previewship/domain/AdminProjectDiagnostic.java`
- `backend/src/main/java/com/previewship/domain/DiagnosticJobState.java`
- `backend/src/main/java/com/previewship/domain/HttpOutcome.java`
- `backend/src/main/java/com/previewship/domain/SecurityReputationCache.java`
- `backend/src/main/java/com/previewship/domain/SecurityVerdict.java`
- `backend/src/main/java/com/previewship/domain/SecurityScope.java`
- `backend/src/main/java/com/previewship/repo/AdminProjectDiagnosticRepository.java`
- `backend/src/main/java/com/previewship/repo/SecurityReputationCacheRepository.java`
- `backend/src/test/java/com/previewship/repo/MigrationV34SafetyTest.java`
- `backend/src/test/java/com/previewship/repo/AdminProjectDiagnosticRepositoryTest.java`

### 实现

`admin_project_diagnostics` 每项目一行，承担最新任务与最新快照：

- 目标和 CAS：projectId、targetDeploymentId、runId；
- 队列：state、availableAt、leaseUntil、attemptCount；
- 生命周期：requestedAt、startedAt、completedAt；
- HTTP：status、outcome、latencyMs、contentType、errorCode、checkedAt；
- 精确 URL 信誉：verdict、threatTypes、provider、checkedAt、errorCode；
- 告警：consecutiveHttpFailures、lastAlertFingerprint、lastAlertedAt。

`security_reputation_cache` 使用唯一键：

```text
provider + scope + indicator_sha256
```

只保存规范化 indicator、哈希、verdict、threat types、checkedAt、expiresAt 和 errorCode，不保存页面正文或供应商原始响应。

Repository 原子 claim 使用 `FOR UPDATE SKIP LOCKED`，事务提交后才允许网络调用。完成写回必须匹配 runId 和 targetDeploymentId。增加：

- 领取批量任务；
- 重领过期 lease；
- cooldown 内幂等 refresh；
- 批量按 projectId 读取快照；
- 批量读取配置化 platform domains 的信誉缓存。

### 测试

- 并发 claim 唯一；
- 租约过期可恢复；
- 部署切换后旧 run 无法覆盖新快照；
- 60 秒 cooldown 幂等；
- 列表批量读取不产生 N+1；
- 多个平台域缓存结果互不覆盖。

### 验证

```bash
cd backend
mvn -q -Dtest=MigrationV34SafetyTest,AdminProjectDiagnosticRepositoryTest test
```

### 提交

```text
feat: add persistent project diagnostic queue
```

## P6：安全目标解析和真实 HTTP 探测

### 新增文件

- `backend/src/main/java/com/previewship/service/DiagnosticTargetResolver.java`
- `backend/src/main/java/com/previewship/service/PreviewHttpProbeClient.java`
- `backend/src/test/java/com/previewship/service/DiagnosticTargetResolverTest.java`
- `backend/src/test/java/com/previewship/service/PreviewHttpProbeClientTest.java`

### 测试先行

目标解析拒绝：

- 非 HTTPS、非 443、userinfo、query、fragment；
- `previewship.net.evil.example` 等后缀欺骗；
- loopback、RFC1918、link-local、multicast、CGNAT、metadata IPv4/IPv6；
- A/AAAA 混合结果中任一私网地址；
- 任意重定向。

允许：

- 由合法 slug + 配置 base domain 构造的 SELF_HOSTED 根 URL；
- 严格边界匹配的 `*.vercel.app` 历史 URL；
- 配置化只读 provider allowlist。

HTTP 分类覆盖 2xx、3xx、401、403、404、410、429、5xx、DNS、TLS、connect 和 timeout；PASSWORD+401、PRIVATE+403 的对齐判断在纯函数中测试。

### 实现

- API 不接受调用方 URL；只接收 projectId，由 resolver 根据 Project/Deployment/provider 生成目标。
- Java HTTP transport 通过接口注入，生产使用限时客户端，测试使用 fake。
- 请求只使用 GET `/`，不带 Cookie/Authorization，不跟随 redirect，不执行 JS。
- 使用 Range 和限长 subscriber，最多读取配置的 32KiB，随后丢弃正文。
- 瞬时网络/5xx 最多重试 2 次并带抖动；401/403/404/明确威胁不重试；429 尊重合法且有上限的 Retry-After。
- 应用层 DNS 检查是第一道防线；生产启用探测前必须完成 P10 的 egress 核验。

### 验证

```bash
cd backend
mvn -q -Dtest=DiagnosticTargetResolverTest,PreviewHttpProbeClientTest test
```

### 提交

```text
feat: probe preview HTTP safely
```

## P7：Web Risk 和多平台域信誉

### 新增文件

- `backend/src/main/java/com/previewship/service/SecurityReputationClient.java`
- `backend/src/main/java/com/previewship/service/NoopSecurityReputationClient.java`
- `backend/src/main/java/com/previewship/service/GoogleWebRiskClient.java`
- `backend/src/main/java/com/previewship/service/SecurityReputationService.java`
- `backend/src/test/java/com/previewship/service/GoogleWebRiskClientTest.java`
- `backend/src/test/java/com/previewship/service/SecurityReputationServiceTest.java`

### 测试先行

- provider NONE/key 缺失返回 UNKNOWN，不影响任务其他结果。
- Lookup 同时请求 SOCIAL_ENGINEERING、MALWARE 和适用的其他 threat type。
- 正确映射 NO_MATCH、THREAT_FOUND、PROVIDER_ERROR 和 expireTime。
- 同一精确 URL/平台域在 TTL 内只请求一次。
- `previewship.net` 命中不能被 `previewship.cc` 未命中覆盖。
- 429、超时、畸形响应和供应商 5xx 不伪造 NO_MATCH。
- 日志不包含 API key、完整供应商响应或页面正文。

### 实现

- 生产实现调用 Google Cloud Web Risk Lookup API；不使用非商业 Safe Browsing API。
- indicator 规范化后以 SHA-256 作为缓存键；数据库保留规范化 URL 仅用于管理员解释。
- 精确项目 URL 随项目诊断刷新。
- 全局 scheduled refresh 对 `platform-domains` 中的每个 `https://{domain}/` 独立刷新；管理列表从共享缓存一次批量合并为 `platformDomains[]`。
- NO_MATCH 默认 6 小时，THREAT_FOUND/错误默认 10 分钟，并服从供应商更早的 expireTime。

### 验证

```bash
cd backend
mvn -q -Dtest=GoogleWebRiskClientTest,SecurityReputationServiceTest test
```

### 提交

```text
feat: monitor exact and platform URL reputation
```

## P8：诊断编排、Worker 和内部管理 API

### 新增文件

- `backend/src/main/java/com/previewship/service/AdminProjectDiagnosticService.java`
- `backend/src/main/java/com/previewship/worker/AdminProjectDiagnosticWorker.java`
- `backend/src/test/java/com/previewship/service/AdminProjectDiagnosticServiceTest.java`
- `backend/src/test/java/com/previewship/worker/AdminProjectDiagnosticWorkerTest.java`
- `backend/src/test/java/com/previewship/web/AbuseAdminDiagnosticsControllerTest.java`

### 修改文件

- `backend/src/main/java/com/previewship/service/ActivePreviewService.java`
- `backend/src/main/java/com/previewship/web/AbuseAdminController.java`
- `backend/src/test/java/com/previewship/service/ActivePreviewServiceTest.java`

### 实现

任务入口：

- ActivePreviewService 成功切换 latest 的事务内 upsert QUEUED，只入队不探测。
- 管理员手动 refresh 只接受 projectId，无 URL body。
- Scheduler 定时将过期快照重新入队。

Worker 流程：

1. 短事务 claim 并提交。
2. 事务外解析可信目标，执行 HTTP 和精确 URL 信誉查询。
3. 独立短事务按 runId + targetDeploymentId 写回。
4. HTTP 成功但供应商失败写 PARTIAL；全部失败才 FAILED。
5. 状态变化后计算稳定 alerts/overallSeverity；第一版只计数和结构化 error 日志，不自动 block。

内部 API：

```http
POST /console/admin/abuse/projects/{projectId}/diagnostics/refresh
GET  /console/admin/abuse/projects/{projectId}/diagnostics
```

列表响应扩展内部字段：

```text
access { mode, passwordConfigured }
diagnostics {
  state, targetDeploymentId, stale,
  http { status, outcome, latencyMs, checkedAt, errorCode },
  reputation {
    provider,
    exactUrl { verdict, threatTypes, checkedAt, errorCode },
    platformDomains [{ domain, verdict, threatTypes, checkedAt, errorCode }]
  },
  accessAlignment, overallSeverity, alerts[]
}
```

缺快照返回 NOT_RUN/UNKNOWN。Controller 继续调用现有 `adminService.requireAdmin`；批量列表一次读取项目快照和平台域缓存。

Severity 后端统一计算：

- exact THREAT_FOUND：项目 CRITICAL；
- 任一 platform domain THREAT_FOUND：平台 CRITICAL，但不自动归因/封禁用户；
- PUBLIC 连续三次 5xx/network 且跨度至少 5 分钟：CRITICAL；
- PASSWORD+401、PRIVATE+403：OK；
- provider error、过期快照和未检测：UNKNOWN。

### 验证

```bash
cd backend
mvn -q -Dtest=AdminProjectDiagnosticServiceTest,AdminProjectDiagnosticWorkerTest,AbuseAdminDiagnosticsControllerTest,ActivePreviewServiceTest test
```

### 提交

```text
feat: expose internal project diagnostics
```

## P9：Console 内部诊断界面

### 新增文件

- `console/src/lib/admin-abuse-diagnostics.ts`
- `console/scripts/admin-abuse-diagnostics.test.mjs`

### 修改文件

- `console/src/types/api.ts`
- `console/src/lib/query-keys.ts`
- `console/src/hooks/use-admin-abuse.ts`
- `console/src/pages/admin-abuse.tsx`

### 测试先行

将以下逻辑提取为纯函数并先用 Node test 锁定：

- PASSWORD+401 和 PRIVATE+403 显示“符合预期”；
- PUBLIC+401/403 显示访问配置不匹配；
- exact NO_MATCH + platform domain THREAT_FOUND 同时呈现，不把项目写成精确命中；
- UNKNOWN/PROVIDER_ERROR 不显示“安全”；
- stale 与 checkedAt 的文案和颜色；
- overallSeverity 只渲染后端结果，前端不复制判定规则。

### 实现

- 扩展的类型只存在 admin API 类型区域，不进入用户项目类型。
- Status 区拆成业务、访问、HTTP、信誉和内部索引五部分。
- 每行提供 Refresh；QUEUED/RUNNING 时 2 秒轮询，终态恢复现有 15 秒缓存节奏。
- 展示精确状态码、分类、耗时和检查时间；URL 存在就允许管理员打开，不再以 DB READY 作为唯一门槛。
- 平台域逐项展示，例如 `previewship.net：危险`、`previewship.cc：未命中`，文案始终带供应商和时间。
- 顶部只统计当前页“危险/不可达/未检测”，不得伪装成全站统计。
- 账号信誉和索引策略只在此管理员页面出现；用户页面和翻译资源不增加相关文案。

### 验证

```bash
cd console
npm run test:unit
npm run lint
INDEXNOW_ENABLED=false npm run build
```

`INDEXNOW_ENABLED=false` 会使用现有脚本的明确禁用路径，避免测试构建提交生产 URL。

### 提交

```text
feat: show internal preview diagnostics
```

## P10：基础设施出站边界和生产配置

### 只读预检

上线 HTTP probe 前，在生产集群确认：

- Pod/Namespace 现有 NetworkPolicy；
- kube-dns 地址与命名空间；
- PostgreSQL、Redis 和内部 Service 的目标；
- Stripe、Resend、Google OAuth/Web Risk 等现有必要外联；
- 云环境 metadata 地址和节点网段。

不得根据本地假设直接提交可能切断数据库、Redis、支付或邮件的全局 NetworkPolicy。

### 实施

- 优先把诊断 Worker 运行身份与普通 API Pod 分离；若当前发布架构暂不支持，先保持 `http-probe-enabled=false`。
- 为诊断执行单元增加 egress：允许 kube-dns、受控内部 Service、公共 TCP 443；拒绝 RFC1918、link-local、metadata 和节点管理网段，必要内部目标用更具体 allow 规则放行。
- API key 使用 Kubernetes Secret 注入 `WEB_RISK_API_KEY`，不写 ConfigMap、日志或命令历史。
- 先在 staging 用受控域名验证 200、401、404、TLS error、timeout 和 provider error。

### 验收

- 从诊断 Pod 无法访问 metadata、loopback 映射和集群未授权 Service；
- 正常 Preview HTTPS 和 Web Risk 可访问；
- API、数据库、Redis、Stripe 和邮件原有健康检查不退化；
- 未完成 egress 验收前不得在生产打开 HTTP probe。

### 提交

基础设施文件只有在读取真实集群边界后才能创建，提交信息建议：

```text
ops: restrict diagnostic worker egress
```

## P11：全量回归和分阶段开关

### 后端回归

```bash
cd backend
mvn -q test
git diff --check
```

重点检查：

- Flyway 从空库和 V32 升级均成功；
- 用户注册、Google OAuth、Guest 认领、部署 READY、回滚/重部署、过期/恢复无回归；
- Abuse blockUser/blockProject/blockDeployment 原子性；
- Preview auth_request 和 robots 协议；
- Showcase 聚合、详情、sitemap 和 IndexNow；
- 所有诊断测试无真实网络。

### Console 回归

```bash
cd console
npm run test:unit
npm run lint
INDEXNOW_ENABLED=false npm run build
git diff --check
```

### 用户无感知契约审计

在 Backend 和 Console diff 中搜索：

```bash
rg -n "reputation|PENDING|ESTABLISHED|RESTRICTED|等待索引|信誉" \
  backend/src/main/java/com/previewship/web \
  console/src
```

允许命中范围仅为内部 Abuse API/页面和内部类型；所有用户 Controller、用户 hooks、i18n、邮件模板命中都必须逐项解释或删除。

### 分阶段打开

1. 发布 V33/V34 和应用，所有新能力开关关闭。
2. 打开 diagnostics 队列但保持 HTTP/Web Risk 关闭，验证任务生命周期和后台 UNKNOWN。
3. staging 完成 egress 后打开 HTTP probe；观察 24 小时队列、延迟和错误率。
4. 配置 Web Risk key，先只刷新平台域，再开放精确 URL 查询；观察配额和误报。
5. 打开 reputation shadow，至少观察 7 天，核对自动候选和人工判断。
6. 开启 `enforce-index-policy`，先验证新注册 PENDING 的 Preview/Header/robots/Showcase/sitemap。
7. 打开 `auto-promotion-enabled`，每日审计晋级和降级数量。

出现异常时优先关闭对应开关，不回滚数据库迁移或删除状态证据。

## P12：Search Console 全域清理和人工复审

### 新增文档

- `backend/docs/preview-security-incident-runbook.md`
- `backend/docs/preview-security-review-template.md`

### 运行手册内容

- Domain property 和 Owner/Full user 权限检查；
- Security Issues 有 issue 与无 issue 两条路径；
- 证据目录、样例 URL 映射、内容哈希、HTTP/UA/Referer/第三方资源检查；
- 全域扫描范围和完成标准；
- 隔离后必须返回 404/410 或修复后的 200；
- 复审文案模板、提交审批、等待期间禁止重复提交；
- 误报表单路径和批准后 1–2 天浏览器缓存复核。

### 实际处置顺序

1. 为所有内容域确认独立 Domain property 和通知权限。
2. 冻结当前 Security Issues、浏览器告警和诊断证据。
3. 从全部样例扩展到所有活动项目、历史仍可访问 URL 和多平台域。
4. 对风险项目人工确认并使用现有 Abuse 服务隔离；禁止只靠 robots 隐藏。
5. 全量复扫并生成数量、零命中、HTTP 和 hash 证据。
6. Search Console 有 issue：由 Owner/Full user 人工 Request Review。
7. Search Console 无 issue：等待算法重抓；确认误报才提交官方误报表单。
8. 保存提交文本、提交人、时间、确认和最终结果。

### 完成标准

- 所有样例 URL 和同类规则命中 URL 均有处置结果；
- 所有内容域完成全量复扫，不以样例清零代替全域清理；
- 后台能区分项目精确 URL 与每个平台域信誉；
- Search Console 复审已提交，或明确记录“无 issue、无复审入口”的算法路径；
- 复审期间监控保持开启，未重复提交。

## P13：最终审计与交付

### 仓库检查

```bash
git status --short
git -C backend status --short
git -C console status --short
```

三个仓库分别检查提交、未跟踪文件和无关用户改动。不得把 Backend、Console 和根文档误合并为一个 Git 提交。

### 生产验收记录

记录但不暴露给用户：

- 代表 PENDING、ESTABLISHED、RESTRICTED 账号各一例；
- PUBLIC、PASSWORD、PRIVATE 各一例；
- HTTP 200、符合预期 401/403、404/410、网络失败各一例；
- 精确 URL 和全部平台域信誉及 checkedAt；
- Showcase meta、sitemap 和 IndexNow 状态；
- Search Console issue/复审状态；
- 开关最终值和回滚责任人。

只有所有验收项具备证据，才将设计和计划状态改为“已实施”。
