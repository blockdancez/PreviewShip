-- 仅供 verify-local-migrations.py 的新建本机临时库使用；禁止用于共享环境。
-- 依赖 V40–V42、V44 和 test-local-legacy-seed.sql；事务回滚合成变更，可重复本机验收。
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$
DECLARE legacy_check BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM content_risk_checks WHERE deployment_id = 9000001 AND input_ref IS NULL AND status = 'COMPLETED') THEN
        RAISE EXCEPTION '历史审核记录被改写或回填';
    END IF;
    SELECT id INTO legacy_check FROM content_risk_checks WHERE deployment_id = 9000001;
    INSERT INTO content_risk_notifications(check_id, project_id, deployment_id, dedupe_key)
    VALUES (legacy_check, 9000001, 9000001, repeat('b', 64)), (legacy_check, 9000001, 9000001, repeat('b', 64));
    IF (SELECT count(*) FROM content_risk_notifications WHERE dedupe_key = repeat('b', 64) AND notification_type = 'CONTENT_RISK') <> 2 THEN
        RAISE EXCEPTION '旧通知默认来源或去重行为被改变';
    END IF;
    INSERT INTO content_risk_notifications(notification_type, project_id, user_id, dedupe_key, block_reason, blocked_at)
    VALUES ('ADMIN_PROJECT_BLOCK', 9000001, 9000001, repeat('c', 64), '合成项目封禁说明', now());
    INSERT INTO content_risk_notifications(notification_type, user_id, dedupe_key, block_reason, blocked_at)
    VALUES ('ADMIN_USER_BLOCK', 9000001, repeat('d', 64), '合成账号封禁说明', now());
    INSERT INTO content_risk_notifications(notification_type, project_id, deployment_id, user_id, dedupe_key, block_reason, blocked_at)
    VALUES ('ADMIN_DEPLOYMENT_BLOCK', 9000001, 9000001, 9000001, repeat('e', 64), '合成历史版本封禁说明', now());
    BEGIN
        INSERT INTO content_risk_notifications(notification_type, user_id, dedupe_key, block_reason, blocked_at)
        VALUES ('ADMIN_USER_BLOCK', 9000001, repeat('d', 64), '合成账号封禁说明', now());
        RAISE EXCEPTION '管理员通知唯一约束缺失';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        UPDATE content_risk_notifications SET block_reason = NULL WHERE notification_type = 'ADMIN_USER_BLOCK';
        RAISE EXCEPTION '管理员通知理由非空约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE content_risk_notifications SET block_reason = '' WHERE notification_type = 'ADMIN_USER_BLOCK';
        RAISE EXCEPTION '管理员通知空理由约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE content_risk_notifications SET project_id = 9000001 WHERE notification_type = 'ADMIN_USER_BLOCK';
        RAISE EXCEPTION '管理员通知范围约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE content_risk_notifications SET notification_type = 'INVALID' WHERE dedupe_key = repeat('d', 64);
        RAISE EXCEPTION '通知来源约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE content_risk_notifications SET check_id = NULL WHERE notification_type = 'CONTENT_RISK';
        RAISE EXCEPTION '旧内容风险通知必填绑定约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE content_risk_checks SET status = 'PENDING', decision = 'UNKNOWN', input_ref = 'local-fixture' WHERE deployment_id = 9000001;
    BEGIN
        UPDATE content_risk_checks SET status = 'INVALID' WHERE deployment_id = 9000001;
        RAISE EXCEPTION '审核状态约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE projects SET content_quarantined_at = now() WHERE id = 9000001;
        RAISE EXCEPTION '隔离字段配对约束缺失';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE projects SET content_quarantined_at = now(), content_quarantine_deployment_id = 9000001 WHERE id = 9000001;
    INSERT INTO content_risk_revocations (deployment_id, project_id, project_slug, provider, provider_deployment_id)
    VALUES (9000001, 9000001, 'migration-fixture', 'VERCEL', 'dpl_fixture');
    BEGIN
        INSERT INTO content_risk_revocations (deployment_id, project_id, project_slug, provider)
        VALUES (9000001, 9000001, 'migration-fixture', 'VERCEL');
        RAISE EXCEPTION '撤销任务唯一约束缺失';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    INSERT INTO content_abuse_history(source, source_key, user_id, project_id, deployment_id,
                                     project_slug, content_hash, reason_code, confirmed)
    VALUES ('AI_CONFIRMED', 'local-fixture', 9000001, 9000001, 9000001,
            'migration-fixture', repeat('a', 64), 'CONTENT_RISK_HIGH', true);
    BEGIN
        INSERT INTO content_abuse_history(source, source_key, project_slug, reason_code, confirmed)
        VALUES ('AI_CONFIRMED', 'local-fixture', 'migration-fixture', 'CONTENT_RISK_HIGH', true);
        RAISE EXCEPTION '安全事件幂等约束缺失';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    DELETE FROM deployments WHERE id = 9000001;
    DELETE FROM projects WHERE id = 9000001;
    IF EXISTS (SELECT 1 FROM content_risk_notifications WHERE project_id = 9000001 OR deployment_id = 9000001) THEN
        RAISE EXCEPTION '原项目通知级联删除行为被改变';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM content_risk_notifications WHERE notification_type = 'ADMIN_USER_BLOCK' AND user_id = 9000001) THEN
        RAISE EXCEPTION '账号通知错误依赖单个项目生命周期';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM content_risk_revocations WHERE deployment_id = 9000001 AND status = 'PENDING') THEN
        RAISE EXCEPTION '项目删除错误地丢失了撤销任务';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM content_abuse_history WHERE deployment_id = 9000001 AND confirmed) THEN
        RAISE EXCEPTION '项目删除错误地丢失了安全审计';
    END IF;
END $$;
ROLLBACK;
