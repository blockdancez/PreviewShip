# PreviewShip 内部部署账号实施计划

- 日期：2026-07-15
- 状态：代码已实施，待生产迁移与端到端验收
- 前置设计：[内部部署账号设计](./2026-07-15-internal-deployment-account-design.md)
- 架构决定：[ADR-0002](../adr/0002-internal-deployments-share-core-by-account-type.md)

## 实施原则

- 每一阶段保持普通 `CUSTOMER` 行为可独立回归和回退。
- 先写失败测试，再实现最小改动，最后执行阶段级回归。
- 所有内部判断从账号类型和集中策略取得，禁止硬编码邮箱、用户 ID、Key 或请求参数。
- 不引入内部专用项目表、部署表、Controller、队列或存储。
- 不顺带修复已明确接受的队列、`/tmp`、PVC 和 Outbox 问题。
- 后端、控制台、统计、事件和通知必须在同一发布序列内完成，避免半生效状态。

## 阶段总览

| 阶段 | 内容 | 主要风险 | 可独立提交 |
|---|---|---|---|
| P0 | 基线与测试夹具 | 无法区分新增回归 | 是 |
| P1 | 数据库与账号类型 | Flyway/JPA 不一致 | 是 |
| P2 | 集中账号策略 | 特殊判断散落 | 是 |
| P3 | 部署、访问、保留和品牌 | 普通套餐回归 | 是 |
| P4 | 异步回滚与分页版本历史 | 修改历史记录、并发覆盖 | 是 |
| P5 | 事件、经营统计和日报隔离 | 内部数据污染 | 是 |
| P6 | 邮件与 Campaign 隔离 | 误发业务邮件 | 是 |
| P7 | 控制台内部维护视图 | 前后端能力不一致 | 是 |
| P8 | 运维开通与端到端验收 | 过早启用内部账号 | 是 |

## P0：锁定现有基线

### 目标

在任何业务改动前确认后端、控制台和 SQL 形状测试的当前状态，新增可复用的账号测试夹具。

### 操作

1. 执行并保存基线结果：

   ```bash
   cd backend && mvn test
   cd ../console && npm run lint && npm run test:unit && npm run build
   ```

2. 在测试辅助代码中增加创建 `CUSTOMER` 和 `INTERNAL` 用户的方法；如果没有公共夹具目录，先在各测试类中使用小型私有方法，避免为测试过度抽象。
3. 记录任何既有失败，不在本功能分支顺带修复无关问题。

### 验收

- 能明确区分本功能引入的新增失败。
- 尚未改变任何生产行为。

## P1：数据库与账号类型

### 变更文件

- 新增 `backend/src/main/resources/db/migration/V26__add_internal_account_type_and_rollback_source.sql`
- 新增 `backend/src/main/java/com/previewship/domain/AccountType.java`
- 修改 `backend/src/main/java/com/previewship/domain/User.java`
- 修改 `backend/src/main/java/com/previewship/domain/Deployment.java`
- 修改 `backend/src/main/resources/db/migration/V4__add_table_and_column_comments.sql` 的做法不追改历史迁移；在 V26 中直接补新字段注释
- 修改或新增：
  - `backend/src/test/java/com/previewship/web/AuthControllerTest.java`
  - `backend/src/test/java/com/previewship/web/PluginApiControllerTest.java`

### 数据库迁移

1. `users.account_type VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER'`。
2. 增加只允许 `CUSTOMER`、`INTERNAL` 的检查约束。
3. `deployments.rollback_source_deployment_id BIGINT NULL`。
4. 增加自引用外键，删除来源部署时 `ON DELETE SET NULL`。
5. 增加 `rollback_source_deployment_id` 索引。
6. 为两个字段增加数据库注释。

### 实现

1. `AccountType` 使用 `CUSTOMER`、`INTERNAL`。
2. `User.accountType` 使用字符串枚举映射且非空，Java 默认值为 `CUSTOMER`。
3. `Deployment` 只保存来源 ID，不建立复杂双向 JPA 关系，避免序列化和删除级联问题。
4. `/me` 暂时只增加 `accountType` 字段，不改变控制台行为。

### 测试

- 旧用户实体默认是 `CUSTOMER`。
- `/me` 对两种账号返回正确 `accountType`。
- 部署来源字段可空，且普通部署不意外写入。
- Hibernate `ddl-auto=validate` 与 V26 一致。

### 阶段命令

```bash
cd backend
mvn -Dtest=AuthControllerTest,PluginApiControllerTest test
mvn test
```

### 建议提交

`feat: 增加内部账号类型和回滚来源字段`

## P2：集中账号策略

### 变更文件

- 新增 `backend/src/main/java/com/previewship/service/AccountPolicyService.java`
- 新增 `backend/src/main/java/com/previewship/domain/AccountPolicy.java`
- 修改 `backend/src/main/java/com/previewship/config/PreviewShipProperties.java`
- 修改 `backend/src/main/resources/application.yml`
- 修改 `backend/src/main/resources/application-prod.yml`
- 新增 `backend/src/test/java/com/previewship/service/AccountPolicyServiceTest.java`

### 设计约束

`AccountPolicyService` 是生产代码判断内部业务身份的唯一入口。它可以依赖 `UserRepository` 和 `EntitlementsService`，但 `EntitlementsService` 不反向依赖它，避免循环依赖。

策略对象至少提供：

- 账号类型。
- 是否执行商业额度。
- 上传安全上限。
- Worker 并发安全上限。
- 是否自动过期。
- 是否限制保留版本数量。
- 是否注入品牌角标。
- 是否允许密码访问。
- 是否进入增长经营。
- 是否允许业务邮件。

内部上传和并发上限从 `previewship.internal` 技术配置读取，不从 FREE/PRO 套餐继承，也不使用 `Integer.MAX_VALUE` 伪装无限。具体数值沿用部署环境认可的基础设施边界，配置缺失时应用启动失败或使用明确的安全默认值，不能悄悄变成无限。

### 测试

- CUSTOMER 策略完整映射 FREE、月付、年付权益。
- INTERNAL 策略不受订阅状态影响。
- INTERNAL 即使存在 ACTIVE Pro 订阅，仍返回内部策略。
- BLOCKED 状态不由策略放行，仍由现有鉴权和服务校验拒绝。

### 阶段命令

```bash
cd backend
mvn -Dtest=AccountPolicyServiceTest test
mvn test
```

### 建议提交

`feat: 集中内部账号部署策略`

## P3：部署、访问、保留和品牌

### 变更文件

- `backend/src/main/java/com/previewship/service/DeployService.java`
- `backend/src/main/java/com/previewship/service/UsageService.java`
- `backend/src/main/java/com/previewship/service/ProjectAccessService.java`
- `backend/src/main/java/com/previewship/service/ActivePreviewService.java`
- `backend/src/main/java/com/previewship/service/RetainedArtifactService.java`
- `backend/src/main/java/com/previewship/worker/DeploymentWorker.java`
- `backend/src/main/java/com/previewship/worker/CleanupScheduler.java`
- `backend/src/main/java/com/previewship/repo/ProjectRepository.java`
- `backend/src/main/java/com/previewship/repo/DeploymentRepository.java`
- 相关测试：
  - `DeployServiceUploadPackagingTest.java`
  - 新增 `DeployServiceInternalAccountTest.java`
  - `ProjectAccessServiceTest.java`
  - `ActivePreviewServiceTest.java`
  - 新增 `DeploymentWorkerInternalAccountTest.java`
  - 新增或扩展 `CleanupSchedulerTest.java`

### 3.1 DeployService

1. 继续执行用户、项目、文件格式、压缩路径和安全大小校验。
2. CUSTOMER 保持现有项目数检查和 `UsageService.consumeDeploymentQuota`。
3. INTERNAL 跳过项目数、日/月次数和累计上传量消费。
4. 项目查找继续使用原始 `projectName` 精确匹配，不新增规范化。
5. 访问方式通过账号策略判断密码能力，不能再只根据 Pro 计划判断。
6. 创建响应和 Redis 消息格式保持不变。

### 3.2 Worker 与生命周期

1. Worker 通过账号策略取得并发安全上限和品牌行为。
2. INTERNAL 不注入角标。
3. INTERNAL 成功后将 `previewExpiresAt=null`。
4. INTERNAL 自托管产物将 `artifactExpiresAt=null`。
5. INTERNAL 不发送部署成功邮件，不记录产品增长结果事件。
6. 失败、ACK、临时文件和队列行为保持现状。

### 3.3 激活与清理

1. 为项目增加带悲观写锁的查询方法，在 `activateLatest` 的最终发布与 `latestDeploymentId` 更新阶段锁定项目。
2. CUSTOMER 保持按套餐 supersede、到期和版本数量清理。
3. INTERNAL supersede 后保留来源产物，且不设置到期时间。
4. 定时清理查询或循环显式跳过 INTERNAL，不让 `null` 生命周期依赖偶然的 SQL 比较行为。
5. Abuse 删除和项目删除仍可删除内部产物。

### 测试

- INTERNAL 的第 N 个项目和高频部署不会触发商业额度错误。
- INTERNAL 仍会触发上传安全上限和并发安全限制。
- INTERNAL 可以使用密码访问，CUSTOMER FREE 仍不能。
- INTERNAL 的 HTML 和回滚产物无角标。
- INTERNAL 的成功部署和产物均无过期时间。
- Cleanup 不删除 INTERNAL，项目删除和 Abuse 仍删除。
- 失败部署不替换当前版本。
- 两个成功部署并发激活时，数据库 current 与托管 current 一致。

### 阶段命令

```bash
cd backend
mvn -Dtest=DeployServiceInternalAccountTest,ProjectAccessServiceTest,ActivePreviewServiceTest,DeploymentWorkerInternalAccountTest test
mvn test
```

### 建议提交

`feat: 应用内部部署生命周期策略`

## P4：异步回滚与分页版本历史

### 变更文件

- `backend/src/main/java/com/previewship/service/ProjectVersionService.java`
- `backend/src/main/java/com/previewship/integrations/DeploymentQueueProducer.java`（只有需要复用消息构造时才改）
- `backend/src/main/java/com/previewship/repo/DeploymentRepository.java`
- `backend/src/main/java/com/previewship/web/PluginApiController.java`
- `backend/src/main/java/com/previewship/web/ConsoleController.java`
- 新增 `backend/src/test/java/com/previewship/service/ProjectVersionServiceTest.java`
- 扩展 `PluginApiControllerTest.java`、`ConsoleControllerTest.java`

### 实现

1. 将“复制保留产物、创建部署记录、入队”的公共部分提取成 DeployService 内的单一职责方法，供 `redeployLatest` 和回滚复用。
2. 回滚只校验和创建任务，不再在 HTTP 线程调用 PreviewProvider。
3. 新部署写入：
   - 新 ID。
   - `QUEUED`。
   - 来源部署 ID。
   - 明确的 `deploymentSource=ROLLBACK`。
   - 当前账号和项目归属。
4. 允许来源部署就是当前版本，仍创建新任务。
5. 原来源部署任何字段都不得修改。
6. 版本接口支持 `page`、`size`，默认 20、最大 100，按创建时间倒序。
7. 响应保留 `versions`，增加 `page`、`size`、`totalElements`、`totalPages`。
8. CUSTOMER 可以继续受可见历史策略约束；INTERNAL 可分页检索全部历史。

### 异常与补偿

- 来源跨项目、跨账号、非成功状态或产物缺失时，在创建新记录前失败。
- 按批准范围，复制文件后入队失败仍沿用现有一致性风险，不新增 Outbox。
- 回滚任务失败后保留 FAILED 新记录，不影响当前成功版本。

### 测试

- 回滚历史版本创建新记录并正确关联来源。
- 回滚当前版本也创建新记录。
- 来源部署字段、状态、URL 和时间完全不变。
- API 返回新部署 ID，而不是来源 ID 或同步 URL。
- 分页边界、最大 page size、排序和 `canRollback` 正确。
- 跨账号和跨项目回滚均拒绝。

### 阶段命令

```bash
cd backend
mvn -Dtest=ProjectVersionServiceTest,PluginApiControllerTest,ConsoleControllerTest test
mvn test
```

### 建议提交

`feat: 将回滚改为可追溯异步部署`

## P5：事件、经营统计和日报隔离

### 变更文件

- `backend/src/main/java/com/previewship/service/ProductEventService.java`
- `backend/src/main/java/com/previewship/service/OAuthAnalyticsBridgeService.java`
- `backend/src/main/java/com/previewship/repo/AdminAnalyticsRepository.java`
- `backend/src/main/java/com/previewship/service/AdminAnalyticsService.java`
- `backend/src/main/java/com/previewship/worker/DailyStatsReportScheduler.java`
- 可能涉及的业务事实 Repository 查询
- 测试：
  - `ProductEventServiceTest.java`
  - `OAuthAnalyticsBridgeServiceTest.java`
  - `AdminAnalyticsRepositorySqlShapeTest.java`
  - `AdminAnalyticsServiceTest.java`
  - `DailyStatsReportSchedulerTest.java`

### 实现顺序

1. 在 `ProductEventService` 写入入口统一跳过已识别为 INTERNAL 的用户事件。
2. 服务端 Worker 结果事件同样经过该入口，不单独散落判断。
3. 匿名事件只有在能够可靠关联到 INTERNAL 用户旅程时才排除；不能按 IP、邮箱猜测。
4. 对 `AdminAnalyticsRepository` 逐条盘点：
   - 用户注册。
   - 部署事实。
   - 激活与二次部署。
   - 获客和旅程连接。
   - Checkout、订阅、支付与退款。
   - 数据质量与明细列表。
5. 每一类经营查询通过 `users.account_type = 'CUSTOMER'` 排除内部账号，不只依赖“内部事件不写入”。
6. Feishu 日报通过已经过滤后的业务查询构建，不在展示层减数。
7. Showcase 公共列表和 Abuse 查询不添加内部过滤。

### 防漏测试

- SQL 形状测试断言所有业务事实入口都存在账号类型过滤。
- 使用同一组 CUSTOMER/INTERNAL 项目、部署、Checkout 和支付数据，断言经营结果只包含 CUSTOMER。
- INTERNAL 的技术失败码和服务日志仍存在。
- INTERNAL 主动提交的 Showcase 项目仍可展示。

### 阶段命令

```bash
cd backend
mvn -Dtest=ProductEventServiceTest,OAuthAnalyticsBridgeServiceTest,AdminAnalyticsRepositorySqlShapeTest,AdminAnalyticsServiceTest,DailyStatsReportSchedulerTest test
mvn test
```

### 建议提交

`feat: 从增长经营链路排除内部账号`

## P6：邮件与 Campaign 隔离

### 变更文件

- 新增 `backend/src/main/java/com/previewship/service/NotificationPolicyService.java`，或将判断纳入已有账号策略且不形成循环依赖
- `backend/src/main/java/com/previewship/worker/DeploymentWorker.java`
- `backend/src/main/java/com/previewship/worker/CleanupScheduler.java`
- `backend/src/main/java/com/previewship/service/BillingNotificationService.java`
- `backend/src/main/java/com/previewship/service/AdminEmailCampaignService.java`
- `backend/src/main/java/com/previewship/repo/UserRepository.java`
- 测试：
  - `DeploymentNotificationPolicyTest.java`
  - `BillingNotificationServiceTest.java`
  - 新增 `AdminEmailCampaignInternalAccountTest.java`

### 实现

1. 验证码、注册验证和密码恢复邮件保持允许。
2. 部署成功、到期提醒、订阅状态、召回和营销邮件对 INTERNAL 跳过。
3. Campaign 受众查询直接排除 INTERNAL，不能等到发送循环再跳过。
4. 如果 INTERNAL 直接调用 Stripe 并产生支付，PreviewShip 仍不发送业务订阅邮件；Stripe 外部收据不在本系统控制范围内。
5. 邮件跳过必须有技术日志，但不能记录敏感 Key 或密码。

### 测试

- INTERNAL 可收到验证码和密码恢复邮件。
- 其他所有 PreviewShip 业务邮件均不发送。
- CUSTOMER 邮件行为不变。
- Campaign 总人数和发送结果都不包含 INTERNAL。

### 阶段命令

```bash
cd backend
mvn -Dtest=DeploymentNotificationPolicyTest,BillingNotificationServiceTest,AdminEmailCampaignInternalAccountTest test
mvn test
```

### 建议提交

`feat: 隔离内部账号业务通知`

## P7：控制台内部维护视图

### 变更文件

- `console/src/types/api.ts`
- `console/src/hooks/use-auth.ts`
- 新增 `console/src/hooks/use-account-capabilities.ts` 或等价纯函数
- `console/src/layouts/app-layout.tsx`
- `console/src/pages/dashboard.tsx`
- `console/src/pages/deploy.tsx`
- `console/src/pages/projects.tsx`
- `console/src/pages/billing.tsx`
- `console/src/components/pro-upgrade-prompt.tsx`
- `console/src/lib/deployment-rules.js`
- 相关 Node 单元测试脚本

### 实现

1. `MeResponse` 增加 `accountType: 'CUSTOMER' | 'INTERNAL'`。
2. 建立单一前端能力计算：
   - `isInternal`
   - `canUsePassword`
   - `showCommercialUsage`
   - `showUpgrade`
   - `showBilling`
   - `showExpiryPrompt`
3. 内部账号隐藏套餐徽标、Billing 导航、升级 CTA、商业用量卡和过期提示。
4. 上传大小展示使用后端账号策略对应的安全值；不能继续因 `plan === FREE` 固定拦截 15MB。
5. 项目创建和密码访问不再被 FREE 前端逻辑阻塞。
6. INTERNAL 访问 `/billing` 时重定向到项目或 Dashboard；这只是前端隐藏，后端 Stripe 接口保持现状。
7. Console 版本历史组件使用分页响应，不一次加载全部内部历史。
8. 前端营销事件即使误触发，后端仍必须能过滤；前端同时避免内部账号主动发送明显的升级/转化事件。

### 测试与命令

```bash
cd console
npm run lint
npm run test:unit
npm run build
```

需要补充的断言：

- CUSTOMER FREE/PRO 导航和提示不变。
- INTERNAL 看不到 Billing、升级、额度和到期提示。
- INTERNAL 可以选择密码访问和创建超出 FREE 数量的项目。
- INTERNAL 上传不被 15MB 前端常量错误阻塞。
- 内部账号仍只能管理自己的项目和 Key。

### 建议提交

`feat: 增加内部账号维护控制台`

## P8：运维开通、端到端验收与发布

### 变更文件

- 新增 `docs/internal-deployment-account-runbook.md`
- 按需要更新 `docs/api.md`、`README-zh.md` 中仅面向内部维护人员的说明
- 不把公司邮箱、用户 ID 或 API Key 写入仓库

### Runbook 内容

1. 注册并验证全新的公司专属账号。
2. 确认账号没有普通用户项目、订阅、支付或营销历史。
3. 使用参数化 SQL/受控脚本将 `account_type` 设置为 `INTERNAL`。
4. 登录确认内部控制台视图。
5. 创建唯一共享 API Key，明文立即进入公司 Secret 管理，不写日志和 ConfigMap 明文仓库。
6. K8s Pod 通过 Secret 注入 `X-API-Key`。
7. 停用步骤：先封禁账号，再撤销 Key；不改回 CUSTOMER。
8. 轮换步骤：撤销旧 Key、创建新 Key、更新调用方，接受中断。

### 端到端验收矩阵

1. API Key 部署 HTML、ZIP、Markdown、PDF。
2. React/Vue 未构建源码被拒绝，构建产物成功。
3. 同名项目更新固定 URL；大小写不同创建不同项目。
4. 首次部署、再次部署、并发成功、失败保护。
5. 公开访问、密码访问和访问方式修改。
6. 历史分页、回滚历史版本、回滚当前版本。
7. 项目删除、Abuse 封禁、账号封禁和 Key 撤销。
8. 无角标、无过期、无业务邮件、无产品事件。
9. 经营驾驶舱和 Feishu 日报数值在内部压测前后不变。
10. 普通 FREE、月付、年付各完成一次完整回归。

### 发布顺序

1. 先发布 V26 和后端，但不设置任何 INTERNAL 账号。
2. 发布控制台。
3. 执行普通用户回归和经营数据对账。
4. 运维授予专属账号 INTERNAL 身份。
5. 创建 Key 并小流量验证。
6. 再接入公司其他 K8s 服务。

### 回退

1. 封禁内部账号并撤销 Key，停止新流量。
2. 回退控制台和应用镜像。
3. 保留 V26 字段，不在紧急回退中删除列或数据。
4. 普通账号始终是 CUSTOMER，因此应用回退不需要迁移普通业务数据。

### 最终全量命令

```bash
cd backend
mvn test

cd ../console
npm run lint
npm run test:unit
npm run build

cd ..
git diff --check
```

## 完成定义

- 所有阶段测试和全量回归通过。
- 设计中列出的普通用户行为零回归。
- 内部账号通过 API Key 和 Session 均可完成完整维护闭环。
- 内部全部历史不进入经营分析、日报和业务邮件。
- 已接受的运行风险没有被误宣称为已解决。
- Runbook 已由实际维护人员演练一次，专属账号和 Key 均未写入代码仓库。
