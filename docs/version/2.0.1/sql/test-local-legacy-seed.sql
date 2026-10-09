-- 仅供 verify-local-migrations.py 的新建本机临时库使用；禁止用于共享环境。
-- 依赖 V2–V39；只执行一次，随后由临时实例销毁，不是生产补偿数据。
INSERT INTO users (id, email, password_hash) VALUES (9000001, 'migration-fixture@example.invalid', 'fixture');
INSERT INTO projects (id, user_id, name, vercel_project_name) VALUES (9000001, 9000001, 'migration-fixture', 'migration-fixture');
INSERT INTO deployments (id, user_id, project_id, status) VALUES (9000001, 9000001, 9000001, 'READY');
INSERT INTO content_risk_checks (deployment_id, project_id, content_hash, policy_version, run_id, status, decision)
VALUES (9000001, 9000001, repeat('a', 64), 'fixture-v39', '00000000-0000-0000-0000-000000000001', 'COMPLETED', 'PASS');
