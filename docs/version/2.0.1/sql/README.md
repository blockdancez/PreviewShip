# SQL 交付

目标环境：本地验证；上线时由后端 Flyway 在对应生产库执行。当前未执行共享测试或生产数据库写操作。

2026-10-26 增长转化优化无新增 SQL、表结构或历史回填。事件仍写入既有 schemaVersion=2 和 properties_json；后端仅对新入库的旧客户端 paywall 事件补充来源/曝光定义。部署该增量不需要手工执行本目录历史迁移。

2026-10-14 共享托管审核 v9 本身沿用 V42；本次管理员手动封禁通知新增 V44；未发布的邮箱自动接入及 V43 已取消，不改历史检查结论或既有 checksum。

执行顺序：既有 V2–V39 → [V40](V40__background_content_reviews.sql)（后台审核）→ [V41](V41__content_isolation_and_revocations.sql)（内容隔离及撤销任务）→ [V42](V42__durable_content_abuse_history.sql)（删除后安全历史）→ [V44](V44__admin_abuse_notifications.sql)（管理员通知来源、处置快照与局部幂等约束）。生产已至 V42 时，本轮仅新增 V44；V43 不交付，不创建占位，Flyway 允许版本号不连续；不要先手工预执行。上线由后端 Flyway 执行；迁移文件名和既有 checksum 不得修改。

四个迁移入口是指向 `backend/src/main/resources/db/migration/` 唯一运行正文的相对符号链接，需要同层 backend 仓库；不维护第二份正文。Flyway 迁移只执行一次，禁止在已有 schema history 上手动重复执行；只读验收 SQL 可重复执行。

## 分类与验收

| 文件 | 目标与顺序 | 重跑规则 |
|---|---|---|
| V40 | 已至 V39 的应用数据库；先执行 | 只经 Flyway 执行一次 |
| V41 | V40 后；增加隔离标记与持久撤销 | 只经 Flyway 执行一次 |
| V42 | V41 后；安全历史回填和事件幂等索引 | 只经 Flyway 执行一次 |
| V44 | V42 后；管理员通知允许无审核/项目/部署，以来源约束保持真实范围，旧通知默认 CONTENT_RISK | 只经 Flyway 执行一次，不补发历史封禁 |
| [verify-admin-abuse-notifications.sql](verify-admin-abuse-notifications.sql) | V44 后；管理员通知状态/错误、到期积压、受理时间完整性 | 可重复；只读事务、UTC、5 秒预算，无邮箱/理由/正文 |
| [verify-content-abuse-history.sql](verify-content-abuse-history.sql) | V42 后；审计分布、删除后存续和暂隔离状态 | 可重复；只读事务，不输出源码或用户邮箱 |
| [verify-background-review.sql](verify-background-review.sql) | V40/V41 后核对后台任务、到期租约、终态错误 | 可重复；REPEATABLE READ READ ONLY，UTC，5 秒预算 |
| [verify-content-isolation.sql](verify-content-isolation.sql) | V40/V41 后核对隔离与撤销积压 | 可重复；同上 |
| [test-local-legacy-seed.sql](test-local-legacy-seed.sql) | 仅本机新建临时库 V39 后的合成历史数据 | 每临时库一次；禁止共享环境使用 |
| [test-local-migrations.sql](test-local-migrations.sql) | 仅本机临时库 V44 后校验约束、唯一性、删除后任务存续及旧审核字段兼容 | 事务回滚，可重复本机执行；禁止共享环境使用 |

`python3 docs/version/2.0.1/verify-local-migrations.py` 创建仅 Unix socket 的全新临时 PostgreSQL，不继承数据库环境变量；严格核对迁移版本为 V2–V42、V44，共 42 个迁移，执行合成约束检查及四个只读 SQL，结束停止并销毁实例。校验包含 V42 回填/删除存续/报告幂等，以及 V44 旧通知来源默认/管理员来源绑定/独立幂等/原级联删除和账号通知存续。2026-10-14 取消 V43 后，本机 PostgreSQL 17.11 重跑退出 0，42 个迁移与上述约束/四个只读 SQL 通过，实例已销毁；详细边界见 [verification.md](../verification.md) 最新小节；这不替代真实 Flyway schema history、应用启动或生产数据兼容验收。

共享环境验收需确认 Flyway 已成功至 V44、旧审核记录 `input_ref` 未回填，待审/到期租约不持续积压。审核沿有限轮次自动恢复；渠道撤销持续退避重试至确认成功，不能把达到次数阈值当作撤销完成。
