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

-- 最近一小时新建部署的当前状态快照。同一项目多次提交或撤销只计一次。
-- 发布前分母是提交项目，发布后分母是曾到达 READY 的项目。已恢复或删除的历史撤销不计入此刻影响。
WITH project_impact AS (
    SELECT count(DISTINCT d.project_id) AS submitted_projects,
           count(DISTINCT d.project_id) FILTER (WHERE d.ready_at IS NOT NULL) AS published_projects,
           count(DISTINCT d.project_id) FILTER (WHERE d.ready_at IS NULL AND d.status = 'FAILED'
               AND d.failure_code = 'CONTENT_CHECK_UNAVAILABLE') AS pre_publish_failed_projects,
           count(DISTINCT d.project_id) FILTER (WHERE d.ready_at IS NOT NULL AND d.status = 'BLOCKED'
               AND r.status = 'COMPLETED' AND r.completed_at IS NOT NULL
               AND d.failure_code IN ('CONTENT_RISK_RECHECK_PENDING', 'CONTENT_RISK_VERSION_REVOKED', 'CONTENT_RISK_HIGH'))
               AS post_publish_revoked_projects
    FROM deployments d
    LEFT JOIN content_risk_revocations r ON r.deployment_id = d.id
    WHERE d.created_at >= (now() AT TIME ZONE 'UTC') - INTERVAL '1 hour'
      AND d.created_at < (now() AT TIME ZONE 'UTC')
)
SELECT submitted_projects AS "提交项目数", pre_publish_failed_projects AS "上线前审核未完成失败项目数",
       round(100.0 * pre_publish_failed_projects / nullif(submitted_projects, 0), 2) AS "上线前审核失败项目百分比",
       published_projects AS "曾上线项目数", post_publish_revoked_projects AS "上线后已撤销且仍受限项目数",
       round(100.0 * post_publish_revoked_projects / nullif(published_projects, 0), 2) AS "上线后撤销项目百分比"
FROM project_impact;

COMMIT;
