# 2.0.1 实现与验证记录

## 2026-10-14 取消邮箱自动接入（当前交付边界）

用户明确取消未发布的邮箱自动接入及相关实现。只读生产核对确认当前镜像仍为 `prd_2026-10-12-11-38-23`，Flyway 已成功至 V42（最新 V42/V41/V40），`external_abuse_alerts` 和 `external_abuse_mailboxes` 均不存在。本轮不对共享数据库执行写操作，不创建空白 V43，不重编号保留的 V44。共享托管 v9、既有后台风险复核/隔离/恢复、管理员可信报告登记及封禁邮件继续保留。

旧邮箱接入专项的测试结果不再作为当前功能验收；本轮移除后的构建、回归与迁移结果见本节后续补充。此前管理员通知的聚合计数属于移除前代码，不能替代新基线。没有提交、部署、封禁真实用户或发送真实邮件。

本轮 SQL 验证：`python3 docs/version/2.0.1/verify-local-migrations.py` 退出 0，本机 PostgreSQL 17.11 新建仅 Unix socket 临时实例，**V2–V42、V44 共 42 个迁移通过**。合成历史输入不回填、审核/隔离/撤销约束、删除后安全任务存续、可信报告幂等、旧通知默认/原去重兼容、管理员来源及独立幂等，以及四个只读验收 SQL 全部通过；实例已停止并销毁，不继承共享数据库凭据。Python 语法、本地文档引用及根仓库 `git diff --check` 通过。该顺序验证没有真实 Flyway schema history，不代替生产迁移或应用启动验收。

本轮移除后的最终验证（根 `b59b792`、Backend `26be8f4`、Console `a862cba` 加当前未提交差异）：

- 后端 `mvn -q clean '-Dtest=!ContentRiskScannerMemoryBudgetTest,!DeploymentArtifactMemoryBudgetTest' package` 退出 0，实际新生成 Surefire 共 **1018 用例，1004 通过、14 跳过、0 失败/错误**。两个未改变的内存压力类共 5 用例未重跑；真实模型/环境依赖按默认条件跳过。最后将无目的地合成样本明确为普通密码表单，`mvn -q -Dtest=ContentRiskSharedHostingTest test` 再次 **19/19** 通过；未重复外呼真实模型。管理员邮件模板 **43/43**（去掉收件协议依赖后额外验证非法邮箱 dot-atom 边界）、通知持久链路 **14/14**、GET 鉴权 **3/3** 均纳入最终回归。
- Console `npm run test:unit` **230/230**、`npx tsc -b`、`npm run lint`、`INDEXNOW_ENABLED=false npm run build` 与 SEO 验证通过；移除自动告警专项，保留手动登记、管理员通知弹窗、loading、防重复、八语言与受理进度。生成日期差异已恢复，无 IndexNow 提交、真实账号或邮件操作。
- 源码/配置/测试没有邮箱自动接入或外部复核引用；`clean` 后实际 JAR 不含 ExternalAbuse/PublishedArtifactReviewReader、V43、Angus/Jakarta Mail 协议库或相关环境变量，保留 v9 默认、管理员邮件及 V44、审核快照与隔离恢复类。收件功能的 starter-mail 依赖已去掉；通知邮箱仍按严格单地址格式验证，现有 Resend 发信保持。
- 原 Vercel 审核快照仅为外部重审添加的长期留存取消，恢复终态后五分钟清理；既有风险未决自动复核/恢复所需快照保护保留。独立静态复查确认 Zoho、共享托管边界、实际密码外传与附加证据可靠性、`readAllVerified` 自动恢复、永久封禁及持久撤销没有被移除。
- 根仓库、Backend、Console `git diff --check` 与文档链接验证通过。此前取消前的聚合计数仅是历史证据，生产上线/真实邮件仍未验收。

## 2026-10-14 共享托管审核优化（先前独立验证，本次合并交付）

基线 backend `26be8f4` 加本轮未提交补丁；本机 Java 21，数据库相关测试仅使用本地 H2。生产改动限于模型提示词、Zoho 品牌候选和两处默认策略 v9；未修改证据引用/评分门槛、未知风险处置、隔离、额度、接口或前端契约。独立子代理只读评审无阻断项。

| 范围 | 实际命令与结果 |
|---|---|
| 定向契约回归 | `mvn -q -Dtest=ContentRiskSharedHostingTest,OpenRouterContentRiskClientTest,ContentRiskServiceTest,ContentRiskScannerTest,ContentRiskStaticViewsTest,ContentRiskBatchClientTest test`：初始 118/118 通过；后加认证路径窃密近邻，最终 15 项共享托管回归已纳入全量通过 |
| 当前模型合成实测 | `PREVIEWSHIP_OPENROUTER_LIVE_TEST=true mvn -q -Dtest='OpenRouterContentRiskLiveTest#sharedHostingLoginAndPhishingNearNeighborsAreDistinguishedByTheRealModel' test`：退出 0，14 个场景全部达标；请求模型 `openai/gpt-4.1-mini`，12 次模型调用、无纠正请求或未完成错误，总费用约 $0.00954（最终这一轮） |
| 全量测试与打包 | `mvn -q package`：退出 0；Surefire 956 项，942 通过、14 跳过、失败/错误 0；4 项 512 MiB/单 CPU/原 90 秒上限的内存回归通过 |
| 产物与静态检查 | JAR 内核对 v9 配置、共享托管 system 提示、Zoho 候选及既有 V42；根仓库/后端 `git diff --check` 通过 |

实测正常场景 9/9 PASS：自有账户登录、注册、独立 JavaScript 认证 API 与真实响应分支、密码重置、自有密码与 Google/Microsoft OAuth 并存、Zoho 集成但登录自有账户、企业 SSO 会话过期、禁用原型、纯 OAuth 跳转。其中前七项由真实模型判 SAFE/HIGH，最后两项扫描完整无候选、本地 PASS。

恶意近邻 5/5 HOLD：Zoho 假会话过期并转发其密码、官方 OAuth 链接旁另行索取第三方密码、无品牌机器人密码转发、使用与正常认证同样的 `identity.noteboard…/auth/login` 路径窃取 Google 密码、编码渲染窃密并声明 demo。风险均经严格服务端引用和候选校验进入 HOLD，未用域名命名充当恶意证据。

真实评测曾暴露正常认证被误判与变量外传选错引用，最终提示词已补明自有认证的 SAFE 边界、逐个提交区分 OAuth 与第三方密码、选择目标 URL 声明并结合实际数据流。本小节只保留最终可复现证据，完整临时日志未归档。默认测试不会外呼；显式实测只向既有 OpenRouter 提交源码内合成文本，未执行网页或请求样本目的地，未上传真实用户制品、创建项目、发送邮件、写共享数据库或发布生产。

本轮无新增 SQL，无需重复迁移或发布前端。正式上线需发布后端并确认环境覆盖的 `PREVIEWSHIP_CONTENT_RISK_POLICY_VERSION` 为 `2026-10-14-v9`。旧终态不自动重审，已确认恶意摘要/永久封禁继续有效。上述有限合成评测不能证明零误判、全部攻击覆盖或 Cloudflare 不再告警；真实生产高风险隔离/恢复/邮件验收限制仍保留。

## 2026-10-12 发布后的只读生产核对

用户报告已发布后，于北京时间 11:47–11:54 核对：本地 backend/console HEAD 为 `26be8f4`/`a862cba`；实际生产 Pod `previewship-666f88f6f-ddm7q` 使用 `prd_2026-10-12-11-38-23`，Ready、重启 0，启动时间 11:40:52。只读列出实际 JAR，确认静态解码、恢复 journal、安全历史核心类与 V42 均存在；镜像 tag 与本地提交仍是不同证据，未取得镜像完整 git revision 元数据。

启动日志 11:41:34 记录 V42 成功执行；生产 PostgreSQL `REPEATABLE READ READ ONLY` 查询确认 V40/V41/V42 success=true、历史表存在，回填 AI_CONFIRMED 1 / AI_SUSPECTED 7。原输入、原文、凭据和完整摘要没有归档。Pod 私有共享卷挂于 `/prd/previewship`，OpenRouter key 存在但未输出；策略覆盖变量未设置，实际新增记录已证明默认 `2026-10-12-v8` 生效。

观察到新策略真实发布 #25448–#25452，均 READY、COMPLETED PASS、errorCode=null。创建至 READY 分别 1.203/1.048/0.153/0.263/0.145 秒，审核完成在 READY 后 5.593/4.435/3.058/1.943/0.143 秒；#25448 使用 `openai/gpt-4.1-mini`，其余四项为本地规则。上述为少量自然流量样本，不是性能保证。两次抽查新 Pod 的启动及上线后日志，无 WARN/ERROR，含 #25448 的 AI 输入计划。没有人为创建或发布测试项目。

已登录 Chrome 刷新生产 `/admin/abuse`，可见新投诉登记表及“AI 审核 / 本地规则检查 · 未调用 AI”的实际记录；未提交表单或点击封禁/发邮件。原举报 #25101 当前 BLOCKED，但仍展示旧 v7 本地 PASS，这是管理员封禁与旧审核记录分别保留的结果；另外两个原举报部署已不存在，本轮查询没有恢复其历史记录。

历史审计仍有两个当前 READY 的旧策略风险未决版本 #24946、#25050（v7、MALICIOUS/HIGH、AI_REQUIRES_REVIEW）；账号/项目 ACTIVE、未隔离/封禁，预览期限未到。这是数据库访问状态核对，没有打开它们的上传页面，不能把模型关切直接当成已确认钓鱼。另 #24623 为非当前 SUPERSEDED。新补丁未自动复核这些旧记录，不能宣称它们因上线而得到隔离或安全确认，需要另行核实/处置。持久渠道撤销汇总为 7 项 COMPLETED，无当前积压。

本次确认基础上线、迁移及真实普通发布/AI 审核。高风险暂隔离→自动复核→恢复、供应商严格撤销与真实整改邮件未做生产端到端操作；本版本不自动读取 Cloudflare 告警邮箱。本次全部为只读核对，没有共享数据库写入、封禁或真实通知。

## 2026-10-12 钓鱼漏检修复（当前交付）

代码基线：backend `38acd20`、console `940126b` 加本轮未提交补丁。以下为本机 Java 21、Node 20.19.5、H2 与临时 PostgreSQL 17.11 的结果；没有发布生产、提交 Git、写共享数据库、发送真实邮件或向模型上传真实样本。旧机器摘要属于 10-09 历史验收，不代表本轮结果。

| 范围 | 命令与实际结果 |
|---|---|
| 后端全量及失败项复测 | 单线程 `mvn -q test`：940 项，最初最后一项远程恢复请求对象复用断言失败；修复后 `mvn -q -Dtest=ContentIsolationPersistenceTest,ContentIsolationServiceTest,ContentRiskArtifactSnapshotTest,ContentRiskRestoreJournalTest test` 退出 0，实际匹配的两类 16 项通过。最终 Surefire XML 汇总 940 项，927 通过、13 跳过、失败/错误 0；没有把首轮退出码写成成功 |
| 最终后端打包 | `mvn -q -DskipTests package` 退出 0；V42 和新增核心类已打入 JAR |
| Console | `npm run test:unit` 222/222、`npm run lint`、`INDEXNOW_ENABLED=false npm run build` 均通过；最后只新增编码不透明/旧版撤销的八语言断言，定向 `node --test scripts/content-risk-render.test.mjs scripts/deployment-rules.test.mjs` 28/28 通过 |
| 客户端 | CLI `npm run build` 和格式测试 2/2；MCP `npm run build` 和结果测试 1/1；扩展 `npm run compile` 和结果测试 1/1。未发行 npm/商店包 |
| 本地迁移 | `python3 docs/version/2.0.1/verify-local-migrations.py`：V2–V42 共 41 个迁移、历史输入兼容、审计删除存续、投诉幂等及三个只读验收 SQL 通过；临时库已销毁 |
| 浏览器布局 | 使用真实组件 SSR 与当前构建 CSS 的本地静态夹具；中文/葡语 390px、英文 1440px 检查暂隔离、自动复核、恢复和报告入口，无横向溢出。静态夹具使用回退字体，没有验证登录/API 请求或真实邮件；临时页面、服务和视口覆盖已关闭 |

核心回归覆盖：有界静态解码、唯一字面 URL 变量外传、本地脚本关联、编码不透明不能变零候选 PASS；纯技术错误不封禁，真实模型风险未决暂隔离；独立 HIGH/SAFE 自动纠正、同轮格式修复不能洗掉风险；自托管保留私有制品后恢复、远程完整资源重建及数据库失败补偿 journal；旧版不覆盖 current；永久封禁不被恢复；删除后安全记录、确认摘要拦截、风险账号前置审核、Cloudflare 登记幂等与持久渠道撤销。

实际 #25101 样本仅在本机静态分析，不执行其脚本，不请求外传目的地，不上传模型，不纳入源码夹具。修复后召回隐藏行为、敏感数据、品牌、实际外传四类候选及一个外传目标，`needsAi=true`；送审文本 14,986 字符，原制品摘要前缀 `87c874c3b7c0` 保持一致。此结果证明该漏检路径得到召回，不能代替真实模型判定。

资源边界回归四项全部通过：`-Xmx512m`、单 CPU、150 MiB 存活基线加 128 MiB 制品，每个子进程完整扫描两次，分别 51.877/79.588/30.916/58.877 秒，保留原 90 秒超时。未压缩会员 ZIP 15/50/80 MiB、月上传 200/2048/4096 MiB 权益。合成压力测试不能证明全部生产负载和多 Pod 竞争，正式 CI 仍须 Node 24。

上线仍需 Flyway V42、策略 `2026-10-12-v8`、共享私有 snapshot/journal 及真实访问/渠道/通知验收。Cloudflare 已有管理员核实后的登记入口，**未接入认证邮箱的自动投诉导入**；历史 LOW/PASS 不会自动重新扫描，旧危险项目要通过可信报告入口处置。没有实际人工审核队列。普通项目先发布后后台检查仍存在公开窗口，无法承诺零漏检或瞬时跨实例撤回。

## 2026-10-09 历史基线验证

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

当前流程仅接管新部署，不自动补发历史失败记录。先发布后审存在公开窗口；纯技术终态 UNKNOWN 保持在线但不伪装通过，实际模型风险未决或隐藏内容无法展开则限制访问，新内容在 PASS 前不参与公开索引。部署、验收与回滚按 [release.md](release.md) 执行。


## 2026-10-14 管理员手动封禁通知（取消邮箱方案前的历史验证）

代码基线仍为根仓库 `b59b792`、Backend `26be8f4`、Console `a862cba` 加本地未提交增量，当时包含 v9 和随后撤销的邮箱接入增量；本节为取消方案前的历史验证。本轮不提交、不部署、不写共享库、不封禁真实账号或发送真实邮件。

- Backend：`mvn -q '-Dtest=!ContentRiskScannerMemoryBudgetTest,!DeploymentArtifactMemoryBudgetTest' package` 退出 0。本轮实际更新的 141 个 Surefire XML 共 **1106** 用例：**1091 通过、15 跳过、0 失败/错误**。排除两个未改动的内存压力类共 5 用例，未将旧结果计入本轮；真实模型/环境依赖用例仍按默认条件跳过。本次新增模板 39、真实 H2 事务/持久队列 14、通知 GET 鉴权 3，共 **56/56** 通过；与既有封禁/投诉/风险通知策略相关类共 81/81 通过。
- H2 贯通覆盖：封禁和通知原子提交/回滚、单项目/整个账号/历史部署/当前部署范围、账号已 BLOCKED 仍通知、合并封禁其他项目撤销积压、相同处置重复请求不重发、HTTP 失败稳定字节和幂等键重试、耗尽 FAILED、模板准备失败不回滚处置、更新理由/收件人变更失效、游客跳过、关闭通知和安全邮件权限。邮件与渠道全部 mock，不触发外部服务。
- 邮件覆盖：8 语言 × 3 真实范围、单收件人、reply_to、UTC 时间、动态文本/多行转义、支持地址异常及 mailto 编码、无未核实违法/钓鱼指控、未承诺渠道全部完成或自动解封；保留旧邮件协议与日志脱敏。
- Console：`npm run test:unit` **236/236**、`npx tsc -b`、`npm run lint`、`INDEXNOW_ENABLED=false npm run build` 通过；本机 Node 20，正式 CI 仍按项目 Node 24。新增 7 项涵盖八语言键/插值、所有者匹配、真实组件渲染与表单行为、同步防重复/关闭守卫、失败保留说明、受理与送达区分和有界 GET 查询。构建中一次公共 SEO 上游 TLS 连接重置，原命令重跑成功；生成日期文件恢复，未提交临时产物。未在真实生产页面执行封禁测试。
- PostgreSQL：`python3 docs/version/2.0.1/verify-local-migrations.py` 新建本机仅 Unix socket 的 PostgreSQL 17.11，**当时 V2–V44 共 43 个迁移通过**。合成约束验证旧通知 CONTENT_RISK 默认/原非唯一去重、管理员来源/理由/范围/局部唯一、原级联删除及账号通知存续；当时五个只读验收 SQL 通过。实例结束销毁，不继承共享数据库凭据。这不替代真实 Flyway schema history、生产存量数据及跨实例数据库锁竞争验证。
- 独立静态评审发现合并账号封禁仅查单项目撤销状态的问题，已修正并加入事务回归；账号→项目锁顺序及旧通知消费者兼容边界均已复核。根仓库、Backend、Console `git diff --check` 通过。

尚未验收：V44 在生产执行、全部后端实例更新、Console 线上弹窗、真实 Resend 受理/收件箱投递与支持邮箱回复。滚动升级时暂停管理员封禁/可信投诉登记，全部后端更新后才产生新来源任务，避免旧消费者读取 check_id 为空的管理员通知；详细操作见 release.md 最新小节。
