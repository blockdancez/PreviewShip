# 后端内容隔离与渠道撤销

本文承接 [设计](design.md) 与 [实施计划](implementation-plan.md) 的隔离、撤销和安全邮件部分。版本为 2.0.1；后台审核基线已在生产运行，本轮 2026-10-12 补丁未提交、未部署、未执行共享数据库迁移，也未发送真实邮件。

## 管理员手动封禁通知

管理员封禁沿永久 Abuse 状态执行，区别于后台风险的可整改隔离。复用既有 `content_risk_notifications` 和发送执行器，V44 增加来源 `ADMIN_PROJECT_BLOCK / ADMIN_USER_BLOCK / ADMIN_DEPLOYMENT_BLOCK`、公开说明和封禁时间；旧记录仍为 `CONTENT_RISK`，原有外键及删除语义不变，旧审核不回填。账号通知无需项目、部署或 AI 检查，项目通知不要求已有部署。

- 现有项目/slug、用户、部署和已核实投诉封禁入口均在处置事务中写入通知。只有服务端查询的当前所属注册用户是收件人；不接受客户端提供邮箱。单项目只发项目通知，账号及合并封禁只发一封账号通知；历史部署只涉及该版本，当前部署被撤下整个项目时发项目通知。游客留下 `SKIPPED_NO_RECIPIENT` 审计，不宣称发送。已封禁账号仍可接收安全通知。
- 理由为去除首尾空白、统一换行的 1–500 字符公开说明，非法控制字符拒绝；不悄悄截断。账号→项目顺序加锁，避免通知用户外键与账号封禁交叉等待。状态、理由及原封禁时间未变时保留时间，SHA-256 幂等键复用同一通知，局部唯一索引兜底；重放已受理操作不重发。更新理由形成新通知，旧待发任务按实际状态失效。
- 请求只入队；首次后台领取才准备八语言邮件快照。支持邮箱或模板故障不回滚封禁，按固定原因有限退避重试。成功准备后固定请求字节和供应商幂等键；邮件调用在领取事务外执行，沿既有租约/runId 拒绝迟到回写。收件人、归属或处置改变停止旧任务；每次发送重新查询安全邮件权限。失败耗尽为 `FAILED` 并输出固定 ERROR，不含邮箱、理由或上游正文。
- 邮件主题为“平台访问限制通知”，包含对象/参考编号/UTC 处置时间/管理员说明/实际范围，说明渠道清理可能仍在进行。允许无需登录直接回复支持请求复核，不承诺自动解除、退款或订阅变化，也不自动声称用户违法或钓鱼。正文动态字段转义，收件人和 reply_to 必须是单个纯邮箱。
- 封禁响应追加 `notificationId / notificationStatus / notificationReasonCode`；无记录明确 `NOT_QUEUED`，游客返回真实跳过记录。管理员 GET `/console/admin/abuse/notifications/{id}` 仅返回 `id,status,reasonCode,acceptedAt`，不暴露收件人/理由/正文；普通用户与游客不可查询。`ACCEPTED` 只表示邮件供应商已受理，不能当作到达收件箱。

配置及滚动升级边界见 [release.md](release.md#2026-10-14-管理员封禁通知上线)，只读验收见 [SQL 入口](sql/README.md)。本机事务与模板测试不替代真实邮件投递和生产全部入口撤销验收。

## 实现边界

- `Project.contentQuarantinedAt` 与 `contentQuarantineDeploymentId` 是一组字段，不替代 `ACTIVE/BLOCKED`、托管归档或访问密码。
- `ContentIsolationService.applyConfirmedRisk(deploymentId, contentHash, policyVersion)` 加入审核结果事务，重新验证 `COMPLETED HOLD` 和内容/策略，仅给同项目相同内容的已公开或已创建渠道版本标记 `BLOCKED + CONTENT_RISK_HIGH`，保留 `readyAt`。仅当该内容版本仍是 latest 时隔离项目。此方法不调用渠道或文件系统。
- `requiresPrePublishReview(Project/Long)` 为发布链路提供门槛；近期风险账号后续提交也走前置检查，不能通过删除重建绕过。`clearAfterVerifiedActivation(Project, Deployment, verifiedHash)` 只允许同项目当前 `READY` 且实际 `COMPLETED PASS`、hash 相同的整改版本清除标记；调用方必须持有项目锁，并已完成 current/latest 切换。永久封禁和归档不能被解除。
- 同一个版本的撤销任务唯一，保存不可变 provider ID 和项目 slug。任务不设级联删除外键：用户删除项目后仍能撤销残余 Vercel 直链。
- 任务每 15 秒独立调度，每批 4 条，逐条领取 90 秒租约；网络执行不占事务。失败退避到最多 1 小时，持续保留可重试状态，不因重试耗尽宣称下架成功。第 3 次及以后失败输出固定 ERROR（只含部署 ID、次数、固定错误码，无异常链），接入既有错误巡检。`runId` 拒绝旧执行的完成回写；迟到清理只有在项目仍隔离同一 latest 时才能修改 current。
- `PreviewProvider.deleteDeploymentStrict` 与原尽力清理接口分开。自托管按不可变部署 ID 删除，并在删除前后读取文件属性，只把 `NoSuchFileException` 当作已不存在；权限和其他 I/O 失败必须重试，不能把 `Files.exists=false` 当作成功。Vercel 使用独立 5 秒连接、20 秒读取预算，确认官方 `200 + DELETED + 同一 uid` 或 `404`。其他响应、超时、错误保留任务，错误码不含响应、源码、认证头或密钥。
- 项目访问投影包含隔离状态；所有别名沿同一 slug 权限检查。既有每实例缓存 5 秒和本实例提交后失效保留，因此不承诺跨实例瞬间传播。后台新任务在 `COMPLETED PASS` 前仅禁止索引，不影响普通公开访问；历史无 `inputRef` 记录保持兼容。
- 风险邮件沿用 outbox、固定请求快照、供应商幂等键与安全邮件权限。新增发布后模板描述“正在撤销”，不假称远程全部完成；整改通过后恢复链接，无人工审核队列承诺。纯技术 `UNKNOWN` 不产生违规通知；实际风险未决或隐藏编码无法完整检查，在暂隔离且自动复核终结后产生整改通知。原部署已删除、已到预览/游客到期时间，或已出现更新 READY/PASS 时旧通知作废。
- 访问设置写入也使用项目锁，避免整实体回写覆盖刚提交的隔离字段。回滚重新创建部署并走相同前置门槛；认领只改变所有者和游客身份，保留隔离；归档/会员恢复只定向更新托管状态，不清除隔离。

Vercel 契约依据：[Delete a Deployment 官方 API](https://vercel.com/docs/rest-api/deployments/delete-a-deployment)。不可变部署目标的撤销不按稳定别名字符串删除，避免误删已指向整改版本的别名。

本轮暂隔离复用撤销任务：自托管撤销 current/项目公开入口并保留私有不可变制品，复核通过恢复原版本；Vercel 严格删除后用完整已验哈希快照重建，READY 前不放开项目。私有 `ContentRiskRestoreJournal` 保留新副本坐标，数据库落库或补偿删除失败后可续清理，不重复创建未知副本。每次短事务检查 runId、内容/策略、latest、所有者、到期和永久封禁，旧版标记 `CONTENT_RISK_VERSION_REVOKED` 而不替换 current。确认风险仍执行严格删除，恢复不是对 HOLD 的放行。

## 文件与迁移

- 主体：`backend/src/main/java/com/previewship/service/ContentIsolationService.java`。
- 持久化：`Project`、`ContentRiskRevocation`、`ContentRiskRevocationRepository`；访问投影在 `ProjectRepository`。
- 调度：`ContentRiskRevocationScheduler` 和专用 `ContentRiskRevocationConfiguration`。
- 渠道：`PreviewProvider`、`SelfHostedPreviewProvider`、`VercelPreviewProvider`、`VercelClient`。
- 访问和邮件：`ProjectAccessService`、`ContentRiskNotificationService`、`EmailService`。
- 运行迁移：[`V41__content_isolation_and_revocations.sql`](../../../backend/src/main/resources/db/migration/V41__content_isolation_and_revocations.sql)。执行与只读验收统一由 [SQL 交付说明](sql/README.md) 管理，不维护第二份迁移正文。
- 积压验收：[`verify-content-isolation.sql`](sql/verify-content-isolation.sql)，需 V40/V41 已完成，可重复只读执行；当前没有在共享环境执行。

## 验证证据

2026-10-09，最终全量 Maven 打包退出码 0；实际读取 `backend/target/surefire-reports/TEST-*.xml`：本模块以下 7 个测试类共 **42/42** 通过，失败、错误和跳过均为 0。新增严格删除权限拒绝、访问设置并发隔离，以及三项删除/到期通知回归均已纳入。整体验证与配置资源复打包见 [总验证记录](verification.md) 和 [机器汇总](verification-summary.json)。`git diff --check` 通过。

自托管权限拒绝另用 `/tmp` 独立 Java 探针验证：修复前 `exists=false / strict=FALSE_SUCCESS / fileRemains=true`；修复后 `exists=false / strict=IO_REJECTED / fileRemains=true`。只编译临时目录，未修改共享 `target`，没有运行 Maven、共享数据库或远程渠道。

- `ContentIsolationServiceTest`：当前风险、同 hash 副本、不同新版本、重复处置、变更结果、不解除 Abuse/归档、仅 PASS 恢复。
- `ContentIsolationPersistenceTest`：本机隔离 H2 验证外层事务回滚、持久任务唯一、渠道失败与重启续领、项目删除后继续撤销、旧 runId 拒绝、迟到清理不碰新 current、实际 JPQL 索引投影；新增访问设置与隔离的双事务竞争。
- `VercelRevocationTest`：模拟 200/404/403/429/500、错误目标和损坏响应，验证不误认成功、不泄露上游正文。
- `ProjectAccessServiceTest`、`SelfHostedPreviewProviderTest`：缓存失效后拒绝隔离访问，待审仍可访问但 noindex，严格删除不碰新版本；新增真实 POSIX 权限拒绝用例（特权进程或不支持 POSIX 权限的文件系统跳过此模拟）。
- `ContentRiskNotificationPolicyTest`、`ContentRiskEmailTemplateTest`：隔离邮件正常领取、UNKNOWN 不发、迟到通知作废、两语言模板与输出转义；新增原部署缺失、预览到期与游客到期边界。

定向复跑命令（不与主任务 Maven 并发执行）：

```sh
mvn -Dtest=ContentIsolationServiceTest,ContentIsolationPersistenceTest,VercelRevocationTest,ProjectAccessServiceTest,SelfHostedPreviewProviderTest,ContentRiskNotificationPolicyTest,ContentRiskEmailTemplateTest test
```

本机 H2 能验证 JPA 查询、事务原子性与持久状态，但不替代 PostgreSQL 实际迁移、跨实例锁竞争和远程渠道下架验收。没有调用 Vercel/Resend 真接口；公开缓存、已下载文件及浏览器本地副本不保证可追溯撤回。
