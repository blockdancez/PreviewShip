-- 版本 2.0.1：后台审核状态与租约只读验收。
-- 依赖 V40/V41；目标为已核对连接身份的 PostgreSQL；应用启动后执行，可重复。
-- 仅查询元数据，不输出源码、证据、邮箱、输入文件引用或供应商密钥。
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL TIME ZONE 'UTC';

SELECT c.status AS "审核状态", c.decision AS "审核决定", count(*) AS "任务数",
       count(*) FILTER (WHERE d.status = 'READY') AS "已发布数",
       min(c.created_at) AS "最早创建UTC",
       count(*) FILTER (WHERE c.status = 'PENDING' AND c.created_at < now() - INTERVAL '5 minutes') AS "待审超过五分钟",
       count(*) FILTER (WHERE c.status = 'CHECKING' AND c.lease_until < now()) AS "到期租约数"
FROM content_risk_checks c
JOIN deployments d ON d.id = c.deployment_id
WHERE c.input_ref IS NOT NULL
GROUP BY c.status, c.decision
ORDER BY c.status, c.decision;

SELECT c.deployment_id AS "部署ID", d.status AS "部署状态", c.status AS "审核状态",
       c.error_code AS "错误码", c.attempt_count AS "审核轮次", c.created_at AS "创建UTC",
       c.next_retry_at AS "下次审核UTC", c.lease_until AS "租约UTC"
FROM content_risk_checks c
JOIN deployments d ON d.id = c.deployment_id
WHERE c.input_ref IS NOT NULL AND (
    c.status = 'PENDING' AND c.created_at < now() - INTERVAL '5 minutes'
    OR c.status = 'RETRYING' AND c.next_retry_at < now() - INTERVAL '5 minutes'
    OR c.status = 'CHECKING' AND c.lease_until < now())
ORDER BY c.created_at, c.id
LIMIT 100;

SELECT c.error_code AS "未完成原因", c.model_version AS "配置模型", count(*) AS "一小时终态数"
FROM content_risk_checks c
WHERE c.input_ref IS NOT NULL AND c.status = 'COMPLETED' AND c.decision = 'UNKNOWN'
    AND c.completed_at >= now() - INTERVAL '1 hour'
GROUP BY c.error_code, c.model_version
ORDER BY count(*) DESC;

COMMIT;
