-- V44 后可重复只读验收；不输出邮箱、封禁理由或邮件正文。
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL TIME ZONE 'UTC';
SELECT notification_type, status, last_error, count(*) AS notice_count,
       min(created_at) AS first_created_at, max(created_at) AS last_created_at
FROM content_risk_notifications WHERE notification_type <> 'CONTENT_RISK'
GROUP BY notification_type, status, last_error ORDER BY notification_type, status, last_error;
SELECT notification_type, count(*) FILTER (WHERE next_attempt_at <= now() AND status IN ('PENDING', 'RETRYING')) AS due_count,
       count(*) FILTER (WHERE status = 'RUNNING' AND lease_until < now()) AS expired_lease_count,
       count(*) FILTER (WHERE status = 'FAILED') AS failed_count
FROM content_risk_notifications WHERE notification_type <> 'CONTENT_RISK' GROUP BY notification_type;
SELECT notification_type, count(*) AS accepted_missing_timestamp
FROM content_risk_notifications WHERE status = 'ACCEPTED' AND accepted_at IS NULL
GROUP BY notification_type;
COMMIT;
