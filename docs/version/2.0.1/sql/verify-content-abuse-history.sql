-- V42 上线后的只读验收；可重复执行，不输出邮箱、原文、完整摘要或投诉 URL。
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '5s';
SELECT current_database() AS database_name, now() AS sampled_at,
       to_regclass('public.content_abuse_history') AS history_table;
SELECT source, confirmed, count(*) AS event_count
FROM content_abuse_history GROUP BY source, confirmed ORDER BY source, confirmed;
SELECT count(*) FILTER (WHERE confirmed AND content_hash IS NOT NULL) AS confirmed_hash_events,
       count(*) FILTER (WHERE source = 'AI_SUSPECTED' AND reason_code = 'AUTOMATED_REVIEW_CLEARED') AS corrected_events,
       count(*) FILTER (WHERE project_id IS NOT NULL AND NOT EXISTS
           (SELECT 1 FROM projects p WHERE p.id = h.project_id)) AS retained_after_project_deletion
FROM content_abuse_history h;
SELECT d.failure_code, c.status AS review_status, c.decision, count(*) AS deployment_count
FROM deployments d JOIN content_risk_checks c ON c.deployment_id = d.id
WHERE d.failure_code IN ('CONTENT_RISK_RECHECK_PENDING', 'CONTENT_RISK_VERSION_REVOKED')
GROUP BY d.failure_code, c.status, c.decision ORDER BY d.failure_code, c.status, c.decision;
COMMIT;
