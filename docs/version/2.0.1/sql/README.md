# SQL 交付

目标环境：本地验证；上线时由后端 Flyway 在对应生产库执行。当前未执行共享测试或生产数据库写操作。

执行顺序：既有 V2–V39 → [V40](V40__background_content_reviews.sql)（后台审核）→ [V41](V41__content_isolation_and_revocations.sql)（内容隔离及撤销任务）。上线由后端 Flyway 执行；迁移文件名和既有 checksum 不得修改。

两个迁移入口是指向 `backend/src/main/resources/db/migration/` 唯一运行正文的相对符号链接，需要同层 backend 仓库；不维护第二份正文。Flyway 迁移只执行一次，禁止在已有 schema history 上手动重复执行；只读验收 SQL 可重复执行。

## 分类与验收

| 文件 | 目标与顺序 | 重跑规则 |
|---|---|---|
| V40 | 已至 V39 的应用数据库；先执行 | 只经 Flyway 执行一次 |
| V41 | V40 后；增加隔离标记与持久撤销 | 只经 Flyway 执行一次 |
| [verify-background-review.sql](verify-background-review.sql) | V40/V41 后核对后台任务、到期租约、终态错误 | 可重复；REPEATABLE READ READ ONLY，UTC，5 秒预算 |
| [verify-content-isolation.sql](verify-content-isolation.sql) | V40/V41 后核对隔离与撤销积压 | 可重复；同上 |
| [test-local-legacy-seed.sql](test-local-legacy-seed.sql) | 仅本机新建临时库 V39 后的合成历史数据 | 每临时库一次；禁止共享环境使用 |
| [test-local-migrations.sql](test-local-migrations.sql) | 仅本机临时库 V41 后校验约束、唯一性、删除后任务存续 | 事务回滚，可重复本机执行；禁止共享环境使用 |

`python3 docs/version/2.0.1/verify-local-migrations.py` 创建仅 Unix socket 的全新临时 PostgreSQL，不继承数据库环境变量，执行 V2–V41、合成约束检查及两个只读 SQL，结束停止并销毁实例。2026-10-09 实际通过 PostgreSQL 17.11 的 40 个迁移；这不替代真实 Flyway schema history、应用启动或生产数据兼容验收。

共享环境验收需确认 Flyway 已成功至 V41、旧审核记录 `input_ref` 未回填，待审/到期租约不持续积压。审核沿有限轮次自动恢复；渠道撤销持续退避重试至确认成功，不能把达到次数阈值当作撤销完成。
