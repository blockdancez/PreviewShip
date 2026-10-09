-- 版本 2.0.1：内容隔离与撤销积压只读验收。
-- 目标：已完成 V40、V41 的本机/测试/生产 PostgreSQL；先核对连接身份再执行。
-- 顺序：应用迁移完成后执行；可重复执行，无写入、无用户内容、无 provider 密钥。
-- 验收：COMPLETED 可增长；到期未执行及失效租约不持续积压；3 次以上错误结合固定 ERROR 日志处理。
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL TIME ZONE 'UTC';

SELECT status AS "撤销状态", count(*) AS "任务数",
       min(created_at) AS "最早创建UTC", min(next_attempt_at) AS "最早计划执行UTC",
       count(*) FILTER (WHERE attempt_count >= 3 AND status <> 'COMPLETED') AS "持续失败数"
FROM content_risk_revocations
GROUP BY status
ORDER BY status;

SELECT id AS "任务ID", deployment_id AS "部署ID", provider AS "渠道",
       status AS "状态", attempt_count AS "执行次数", last_error AS "固定错误码",
       next_attempt_at AS "计划执行UTC", lease_until AS "租约UTC"
FROM content_risk_revocations
WHERE (status IN ('PENDING', 'RETRYING') AND next_attempt_at < now() - INTERVAL '5 minutes')
   OR (status = 'RUNNING' AND lease_until < now())
ORDER BY next_attempt_at, id
LIMIT 100;

SELECT p.id AS "项目ID", p.status AS "项目状态", p.hosting_state AS "托管状态",
       p.content_quarantine_deployment_id AS "隔离触发部署ID", p.latest_deployment_id AS "当前部署ID",
       d.status AS "当前部署状态", p.content_quarantined_at AS "隔离时间UTC"
FROM projects p
LEFT JOIN deployments d ON d.id = p.latest_deployment_id
WHERE p.content_quarantined_at IS NOT NULL
ORDER BY p.content_quarantined_at, p.id
LIMIT 100;

COMMIT;
