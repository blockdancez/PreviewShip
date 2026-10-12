-- 仅供 verify-local-migrations.py 的新建本机临时库使用；禁止用于共享环境。
-- 依赖 V40/V41/V42 和 test-local-legacy-seed.sql；事务回滚合成变更，可重复本机验收。
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM content_risk_checks WHERE deployment_id = 9000001 AND input_ref IS NULL AND status = 'COMPLETED') THEN
        RAISE EXCEPTION '历史审核记录被改写或回填';
    END IF;
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
    IF NOT EXISTS (SELECT 1 FROM content_risk_revocations WHERE deployment_id = 9000001 AND status = 'PENDING') THEN
        RAISE EXCEPTION '项目删除错误地丢失了撤销任务';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM content_abuse_history WHERE deployment_id = 9000001 AND confirmed) THEN
        RAISE EXCEPTION '项目删除错误地丢失了安全审计';
    END IF;
END $$;
ROLLBACK;
