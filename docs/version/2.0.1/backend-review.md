# 2.0.1 后台内容审核实现与验证

## 本模块实现

- `ContentRiskService.registerBackgroundReview` 加入发布事务，将实际 `preparedFiles` 写成私有不可变快照，并登记每部署唯一的 `PENDING` 检查；事务回滚会删除本次快照。已有同策略、同内容的有效 `PASS` 可复用，已知 `HOLD` 或未决旧轮次不能被重置为无风险任务。
- `requirePreparedForPublication` 只允许绑定私有输入的 `PENDING` 或有效 `PASS`；`requireNotKnownUnsafe` 按完整产物 hash 阻止已确认危险内容。
- 独立调度只领取新流程且部署为 `READY/SUPERSEDED` 的记录。轮次先持久化再扫描与外呼；多 Pod 通过数据库锁、租约和 `runId` 栅栏恢复。技术错误沿既有三轮、15/60 秒及五分钟窗口重试，输入缺失/不匹配保持 `UNKNOWN`，不视为安全通过。
- 领取和提交均检查预览到期及游客项目到期；即使清理器尚未把 `READY` 改成 `EXPIRED`，到期任务也终结为 `UNKNOWN`，不扫描、不隔离、不发整改邮件。非取消的后台终态 `UNKNOWN` 在事务提交后记录固定 `ERROR` 业务信号（部署 ID、错误码、轮次），供现有日志告警发现；不记录源码或供应商正文。
- 后台 `HOLD` 与隔离服务的撤销任务及整改邮件任务在结果事务内写入；审核线程不直接访问渠道。终态私有快照经过短暂排障窗口后有限批次清理，保留 `inputRef` 作为历史模式标识；硬删除、回滚留下的正式快照和中断写入留下的临时文件按安全年龄清理。
- 读取快照时对所有文件流式验完整 SHA-256；纯二进制文件仅经过 8 KiB 缓冲区，不进入后台 Scanner 的内存映射。可分析的 HTML/JS/SVG 仍完整交给既有规则，不降低 128 MiB 制品边界。后台读取与扫描和普通 Worker 共享单实例内存许可，繁忙时不领取、不扣审核轮次；完成扫描即释放许可，模型网络等待不阻塞发布构建。
- 数据库迁移为 `backend/src/main/resources/db/migration/V40__background_content_reviews.sql`；版本 SQL 目录的执行说明由版本 README / `sql/README.md` 引用该迁移。历史检查 `input_ref` 保持空，不回填或自动重审。

## 本地验证证据

- 先运行 `mvn -q -Dtest=ContentRiskPreparedSnapshotServiceTest test`，新服务尚不存在，按预期编译失败。
- 后运行 `mvn -q -Dtest=ContentRiskPreparedSnapshotServiceTest,ContentRiskPersistenceTest test`，退出码 0；后续版本统一测试的 Surefire XML 中快照测试 3 项、持久化测试 41 项，失败 0、错误 0、跳过 0。再追加到期与终态日志回归后，最新持久化测试 XML 为 44 项、失败 0、错误 0、跳过 0。两类测试只用本地 H2、模拟 AI 和临时文件；没有发送真实邮件、调用模型或写共享数据库。
- 新增回归覆盖规范化字节哈希与篡改、二进制流式验哈希但不驻留审查 Map、回滚删除、只有 `READY` 后领取、旧检查不参与、租约恢复、`SUPERSEDED` 风险处置、技术错误重试、终态清理保留模式标识。
- 内存许可繁忙与中断写入临时文件清理回归已包括在上述 3+41 项；其后新增的到期取消与终态提交后 `ERROR` 日志回归已在最新持久化测试 44 项中通过。完整后端 package 与跨模块验收仍以版本总验证记录为准。
- 隔离 Java 21 子进程（`-Xmx512m`，不启动 Spring、不调用模型）用合成空白主体和末尾候选扫描：64 MiB JS 用时 18.9 秒、内存池峰值 176 MiB；128 MiB JS 用时 36.7 秒、峰值 242 MiB；128 MiB HTML 用时 27.0 秒、峰值 242 MiB，均没有 OOM 或预算错误。该轻量进程不包含生产约 150 MiB 基线及最复杂 DOM，不能代替整应用 512 MiB 压力验收。临时探针文件已清理。

## 待统一验收

- 本模块验证不代表全量后端、前端、PostgreSQL Flyway 迁移或渠道撤销已通过；这些由版本总验证记录实际结果。
- 生产模型、密钥、域名与渠道撤销状态本轮未查询，也未部署。
