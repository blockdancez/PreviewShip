# 后端内容隔离与渠道撤销

本文承接 [设计](design.md) 与 [实施计划](implementation-plan.md) 的隔离、撤销和安全邮件部分。版本为 2.0.1；未提交 Git、未部署、未执行共享数据库迁移，也未发送真实邮件。

## 实现边界

- `Project.contentQuarantinedAt` 与 `contentQuarantineDeploymentId` 是一组字段，不替代 `ACTIVE/BLOCKED`、托管归档或访问密码。
- `ContentIsolationService.applyConfirmedRisk(deploymentId, contentHash, policyVersion)` 加入审核结果事务，重新验证 `COMPLETED HOLD` 和内容/策略，仅给同项目相同内容的已公开或已创建渠道版本标记 `BLOCKED + CONTENT_RISK_HIGH`，保留 `readyAt`。仅当该内容版本仍是 latest 时隔离项目。此方法不调用渠道或文件系统。
- `requiresPrePublishReview(Project/Long)` 为发布链路提供门槛。`clearAfterVerifiedActivation(Project, Deployment, verifiedHash)` 只允许同项目当前 `READY` 且实际 `COMPLETED PASS`、hash 相同的整改版本清除标记；调用方必须持有项目锁，并已完成 current/latest 切换。永久封禁和归档不能被解除。
- 同一个版本的撤销任务唯一，保存不可变 provider ID 和项目 slug。任务不设级联删除外键：用户删除项目后仍能撤销残余 Vercel 直链。
- 任务每 15 秒独立调度，每批 4 条，逐条领取 90 秒租约；网络执行不占事务。失败退避到最多 1 小时，持续保留可重试状态，不因重试耗尽宣称下架成功。第 3 次及以后失败输出固定 ERROR（只含部署 ID、次数、固定错误码，无异常链），接入既有错误巡检。`runId` 拒绝旧执行的完成回写；迟到清理只有在项目仍隔离同一 latest 时才能修改 current。
- `PreviewProvider.deleteDeploymentStrict` 与原尽力清理接口分开。自托管按不可变部署 ID 删除，并在删除前后读取文件属性，只把 `NoSuchFileException` 当作已不存在；权限和其他 I/O 失败必须重试，不能把 `Files.exists=false` 当作成功。Vercel 使用独立 5 秒连接、20 秒读取预算，确认官方 `200 + DELETED + 同一 uid` 或 `404`。其他响应、超时、错误保留任务，错误码不含响应、源码、认证头或密钥。
- 项目访问投影包含隔离状态；所有别名沿同一 slug 权限检查。既有每实例缓存 5 秒和本实例提交后失效保留，因此不承诺跨实例瞬间传播。后台新任务在 `COMPLETED PASS` 前仅禁止索引，不影响普通公开访问；历史无 `inputRef` 记录保持兼容。
- 风险邮件沿用 outbox、固定请求快照、供应商幂等键与安全邮件权限。新增发布后模板描述“正在撤销”，不假称远程全部完成；整改通过后恢复链接，无人工审核队列承诺。`UNKNOWN` 不产生违规通知，原部署已删除、已到预览/游客到期时间，或已出现更新 READY/PASS 时旧通知作废。
- 访问设置写入也使用项目锁，避免整实体回写覆盖刚提交的隔离字段。回滚重新创建部署并走相同前置门槛；认领只改变所有者和游客身份，保留隔离；归档/会员恢复只定向更新托管状态，不清除隔离。

Vercel 契约依据：[Delete a Deployment 官方 API](https://vercel.com/docs/rest-api/deployments/delete-a-deployment)。不可变部署目标的撤销不按稳定别名字符串删除，避免误删已指向整改版本的别名。

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
