# 2.0.1 本地验证记录

2026-10-09：功能已实现并完成以下本地验收。未提交 Git、发布生产、写共享数据库、发布 npm/编辑器扩展、调用真实模型或发送真实通知。完整机器汇总见 [verification-summary.json](verification-summary.json)。

## 构建与测试

| 项目 | 实际命令与结果 |
|---|---|
| 后端全量 | `mvn -q package`，退出码 0；896 项，883 通过、13 跳过、失败/错误 0 |
| 最终配置打包 | 全量后仅移除 YAML 明文默认密钥，再执行 `mvn -q -DskipTests package`，退出码 0；核对 JAR 环境变量配置、四个新核心类和 V40/V41 正文与源码一致 |
| Console 全量 | `npm run test:unit`，215/215；`npm run lint`、`INDEXNOW_ENABLED=false npm run build`，退出码均 0，含 TypeScript 和 SEO 验证 |
| CLI | 模拟请求与结果测试 2/2，TypeScript 与 `npm run build` 通过 |
| MCP | 结果测试 1/1，TypeScript 与 `npm run build` 通过 |
| 扩展 | 结果测试 1/1，TypeScript 与 `npm run compile` 通过 |
| PostgreSQL | 本机临时 PostgreSQL 17.11 执行 V2–V41 共 40 个 SQL 迁移，历史兼容/约束/删除存续断言与两份只读验收 SQL 均通过；实例已停止并清理 |

本机 Node 为 20.19.5，Console 仓库要求 CI Node 24.x；本机上述测试和构建通过，正式发行仍须沿现有 Node 24 CI 检查。构建保留原有 chunk-size 提示，不当作运行错误。跳过的后端环境依赖/真实服务测试未作为通过计入。

## 核心行为证据

- `BackgroundPublishLifecyclePersistenceTest` 用真实 H2 事务贯通普通 `READY+PENDING`、后台 `HOLD`、撤销与邮件任务原子入队、同项目整改前置 `PASS`、原链接恢复，以及迟到撤销不碰新 current。普通发布到 READY 前未调用模拟 AI，也未产生额外用量操作。
- `ContentRiskPersistenceTest` 44/44、快照 3/3：输入一致性与篡改、回滚清理、旧记录不重审、租约接管/迟到栅栏、后台技术重试、取消/到期双检、提交后终态 ERROR、繁忙时不领取或扣轮次。
- 隔离/渠道/访问/邮件七类测试 42/42：当前/旧版同 hash 和不同 hash、事务回滚、任务唯一、删除后续领、严格 Vercel 响应、真实文件权限拒绝、并发访问设置不覆盖隔离、永久封禁不解除、通知删除/到期/整改作废。
- Worker/Active/Guest/Showcase 与原额度回归在全量中通过：普通发布不走 AI 门禁；整改、已知危险内容、回滚和旧版恢复共享保护；游客沿原凭据/slug/期限整改；待审项目不可进入公开 Showcase/索引。
- Console 渲染与行为测试覆盖八语言、READY 结束 loading、后台继续有界查询、断连刷新、禁用复制/打开、已上线 UNKNOWN 与发布前失败区别、游客重复整改及保留上下文。

## 资源边界证据

隔离 Java 21 子进程 `-Xmx512m` 扫描合成正常主体与末尾候选，不调用模型：64 MiB JS 18.9 秒 / 峰值池 176 MiB；128 MiB JS 36.7 秒 / 242 MiB；128 MiB HTML 27.0 秒 / 242 MiB，均无扫描错误或 OOM。后台二进制只用 8 KiB 缓冲校验，Worker 和后台扫描共享实例内单许可，模型网络等待释放许可。

这些轻量 JVM 样本不能证明完整 Spring 应用、复杂 20,000 节点 HTML 和生产基线下的最坏峰值；保留制品 128 MiB、会员 ZIP 15/50/80 MiB 与原额度，不用缩水权益掩盖资源风险。

## 尚未执行与上线条件

真实 Flyway schema history/应用启动、生产 Secret、共享持久卷、多 Pod 竞争、Vercel 实际删除、自托管全部域名与代理缓存、真实模型与邮件受理，尚未在目标环境验收。本机 SQL 顺序验证不替代 Flyway 运行验收，模拟渠道成功不等于真实直链已撤销。

当前流程仅接管新部署，不自动补发历史失败记录。先发布后审存在公开窗口；终态 UNKNOWN 保持在线但不伪装通过，新内容在 PASS 前不参与公开索引。部署、验收与回滚按 [release.md](release.md) 执行。
