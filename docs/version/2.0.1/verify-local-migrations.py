#!/usr/bin/env python3
"""只在新建、仅 Unix socket 的本机临时 PostgreSQL 验证迁移；不读取共享库凭据。"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", default="/opt/homebrew/opt/postgresql@17/bin")
    args = parser.parse_args()
    binaries = Path(args.pg_bin)
    version = Path(__file__).resolve().parent
    migrations = version.parents[2] / "backend/src/main/resources/db/migration"
    ordered = sorted(migrations.glob("V*__*.sql"), key=lambda p: int(re.match(r"V(\d+)__", p.name)[1]))
    if not ordered or ordered[-1].name != "V41__content_isolation_and_revocations.sql":
        raise RuntimeError("迁移列表与 2.0.1 验收目标不一致")
    # 子进程只接收工具运行所需环境，避免继承任何共享数据库连接配置或密钥。
    environment = {"PATH": str(binaries) + os.pathsep + os.defpath, "LANG": "C", "LC_ALL": "C"}
    with tempfile.TemporaryDirectory(prefix="previewship-2.0.1-pg-") as temporary:
        root = Path(temporary)
        data, socket = root / "data", root / "socket"
        socket.mkdir(mode=0o700)

        def run(name, *arguments):
            return subprocess.run([str(binaries / name), *map(str, arguments)], env=environment,
                                  check=True, capture_output=True, text=True)

        def sql(path):
            return run("psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", socket,
                       "-p", "55439", "-U", "version_test", "-d", "postgres", "-f", path)

        run("initdb", "-D", data, "-A", "trust", "-U", "version_test", "--no-locale")
        started = False
        try:
            # 空 listen_addresses 禁止 TCP；唯一临时 socket 目录不与本机其它实例混用。
            run("pg_ctl", "-D", data, "-l", root / "postgres.log", "-o",
                f"-h '' -k {socket} -p 55439", "-w", "start")
            started = True
            for migration in ordered:
                sql(migration)
                if migration.name.startswith("V39__"):
                    sql(version / "sql/test-local-legacy-seed.sql")
            sql(version / "sql/test-local-migrations.sql")
            sql(version / "sql/verify-background-review.sql")
            sql(version / "sql/verify-content-isolation.sql")
            print(json.dumps({"result": "PASS", "postgres": run("postgres", "--version").stdout.strip(),
                              "migration_count": len(ordered), "versions": "V2-V41",
                              "checks": ["historical_input_not_backfilled", "PENDING_constraint",
                                         "quarantine_pair", "revocation_unique", "revocation_survives_deletion"],
                              "shared_database_access": False}, ensure_ascii=False))
        except subprocess.CalledProcessError as failure:
            # 本脚本只含合成数据，但仍限制日志长度；不读取或输出用户环境。
            raise RuntimeError((failure.stderr or failure.stdout)[-2000:]) from None
        finally:
            if started:
                run("pg_ctl", "-D", data, "-m", "immediate", "-w", "stop")


if __name__ == "__main__":
    main()
