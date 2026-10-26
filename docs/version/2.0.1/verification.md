# 2.0.1 实现与验证记录

## 2026-10-26 增长转化优化

方案、优先级、事件契约和后续观察统一维护在 [增长转化优化](growth-optimization.md)。代码基线 Console `63917ef`、Backend `c3becfc` 加本轮未提交修改；保留此前安全主题文档的工作区改动。环境为本机 Node 24.19.0、Java 21.0.9，后端使用测试配置/H2；以下均为本地验收，没有提交 Git、部署、共享数据库写入、真实付款、真实发信或向模型上传用户制品。

| 范围 | 命令与实际结果 |
| --- | --- |
| 前端全量测试 | 全面复审后 `npm run test:unit`：344 项，344 通过，失败/跳过 0。新增真实 handler/重渲染/Effect 清理与重连回归，覆盖套餐与认证回跳、付款轮询与 BFCache、跨账号认领/缓存保护、StrictMode、存储不可用、输入错误分类、内容意图承接和可视曝光；小组定向结果为其子集，不重复累计 |
| 前端静态检查 | `npm run lint` 退出 0；完整构建中的 TypeScript 检查通过 |
| 前端生产构建 | `INDEXNOW_ENABLED=false npm run build` 退出 0；Vite、SSR 和 SEO 生成完成。仍有大于 500 kB 的 bundle 提示，不是构建失败；本轮未以引入新依赖扩大范围 |
| SEO/GEO | 构建校验通过：14 个必需路由、180 个 PROVEN 本地化路由、35 个本地化聚合路由、11 项 Bing 描述和 9 项长度约束。sitemap 仍为 289 个 URL；抽查七个目标路径的实际修改日期为 2026-10-26。产品事实文本沿用集中 facts 的更新时间，竞争资料核验日期保持原值；本地 IndexNow 已跳过，未提交线上索引 |
| 后端完整测试与打包 | 全面复审后 `mvn -B clean package` 退出 0、BUILD SUCCESS：1,078 项，1,063 通过、15 跳过、失败/错误 0；Surefire XML 汇总一致。包含共用 OAuth 安全目标/成功失败 Cookie 清理、Stripe 返回套餐语言来源、认领账号变化不消费 Token、匿名 Pricing 准入、公开事件已有 Session 的内部账号排除，以及新入库 paywall 口径兼容 |
| 后端跳过项 | 7 项 `OpenRouterContentRiskLiveTest` 需要显式真实供应商调用；8 项显式 PostgreSQL 集成测试分布于 ProductEventProperties、AdminAnalyticsOutcome、AdminAnalyticsRepository、ProductEventPropertiesRecovery。此次没有提供外呼/共享数据库测试配置，不将跳过项计为通过 |
| 代码检查与评审 | 根仓库、Console、Backend 的 `git diff --check` 均通过。购买、游客、内容三个模块分别深入复审，根代理整合前后端事件契约、账号边界和浏览器结果；确认问题先以失败测试或实际浏览器布局复现再修复，具体影响与修复见方案的“全面复审补修” |

本地浏览器使用明确指向 `127.0.0.1` 的合成 API 与账号，不连接真实发布/付款接口。实际检查：1265×711 桌面 `/try` 输入和 Publish 首屏可见；375×812 手机三模式保持一行、Publish 可达；空 HTML 显示持久错误并可继续修改；西语年付选择正确进入 Billing，不自动 Checkout；免费密码权益说明在新标签打开套餐，原输入保留；合成认领额度失败保留恢复卡片，转入 Billing 不被自动请求抢回；手机 Billing `scrollWidth=clientWidth=375`，无横向溢出。验收结束已恢复视口、关闭临时标签并停止本地夹具与服务；完整日志及夹具均在仓库外。

全面复审的最终浏览器验收使用生产构建产物，由仓库外静态夹具仅将公开 API 地址改指本机合成接口，并注入固定实验身份；仓库源码及 dist 未写入夹具身份或本机 API。1265×900 桌面与 375×812 手机均确认实验上传卡、持久校验错误和下一段正文之间有 32px 间距；手机比较表仅自身滚动，修复前整页 scrollWidth=972，修复后 scrollWidth=clientWidth=360（375px 视口含滚动条），Billing 为 375/375。繁中指南 CTA 保留 UTM 并进入 HTML 模式；带 mode 参数的 `/try` 整页加载未发现 hydration/React 错误日志。最终 Billing 西语年付入场后主动切换法语，异步翻译包加载完成仍为 `lang=fr`，标题“Facturation & Abonnements”和“Offre sélectionnée”正确；此前已实际复现的 Suspense 重连回滚不再出现。

本地接收的合成事件确认必要 surface、client_flow_version、可视口径或 preflight 错误码齐全；整个浏览器验证未创建 Checkout 或伪造权威成功事件。该结果只验证客户端发送载荷，不等同生产事件入库或真实 Stripe 状态。最终标签、视口覆盖和两个本地夹具服务均已清理。

限制：禁用存储时仅当前页面/SPA 内存兜底，完整刷新和 OAuth 跨页不能保证草稿恢复；不支持 IntersectionObserver 时不记录可视曝光，但业务操作可用。真实 Google OAuth、Stripe Checkout/Webhook、生产新事件和用户端结果尚未验证。当前结果不证明线上已生效，也不保证收入或转化率上升；授权发版后按 [上线与回滚](release.md#2026-10-26-增长转化优化上线) 先后端再 Console，并按方案观察成熟队列和满 28 日数据。本轮无新增 SQL、迁移、价格、套餐或第三方分析依赖。

## 2026-10-20 live 告警只读排查

基线 backend `c3becfc`，生产仍为 `prd_2026-10-15-10-55-10`。本轮为分析；未修改源码、共享数据库、项目状态或配置，未真实发信、登记投诉、执行上传 JavaScript、访问机器人目的地或向模型发送用户制品。

生产 PostgreSQL `REPEATABLE READ READ ONLY` 快照：项目 #13348、唯一部署 #14801，2026-09-08 11:42:27 UTC 创建（北京时间 19:42:27）、当前 latest/READY，项目 ACTIVE/PUBLIC、无隔离或封禁，预览有效至 11-04。该项目 content_risk_checks=0、content_abuse_history=0。V35 于 09-28 07:01:14 UTC 安装，V40 于 10-09 10:06:53 UTC 安装；邮件 10-20 08:31 是举报时间，不是上传时间。

同一只读核对中，排除封禁/隔离、失效访客与账号不可用后的当前有效 READY 项目共 732，其中 **197 无任何审核记录，183 为 PUBLIC**；197 均创建于 V35 安装之前。197 不是恶意站点数量，而是存量覆盖缺口。另新策略 v10 存续检查已有 AI PASS 351、AI HOLD 1，证明 AI 在运行；仍有 AI 未决 6（证据需复核/未达确认门槛/不支持证据各 2）、输入超限 7、节点超限 1、编码拒绝 10，不能宣称上轮全部异常已消失。这些是现存记录汇总，不是包含已删除记录的完整失败率，且不能解释 #14801 的缺失审核。

当前 published 目录为单份 16,021 字节 HTML，本机读取验长并与远端 SHA-256 比较一致；current 链接指向 #14801。只输出结构事实与固定诊断，没有在版本文档中保存原文、完整摘要、token/chat ID 或地址。静态行为链为微软身份宣称→邮箱/密码读取→机器人消息 URL→图片 src 请求→假错误/跳转，另尝试访问当前站点同源可读的 cookie/存储，不能夸大为读取微软域数据或证明实际有人受害。

用当前 v10 编译类在本机静态回放（临时 Java 工具在仓库外，无网络）：needsAi=true，scanError/planError=null，候选仅 SENSITIVE_COLLECTION 1，脱敏摘录 15,502 字符、模型输入 20,030/48,000、315 引用、单批；唯一扫描目标为 CDN RESOURCE，本地可核验提交引用=0。无 form 导致品牌候选未加入，拼接机器人 URL 与 Image.src 未进入传输匹配。独立复核用真实脱敏引用 ID 构造合成 MALICIOUS/HIGH 响应，本机 parse/assess 返回 SUBMISSION_TARGET_MISSING → AI_INVALID_EVIDENCE → UNKNOWN，并保留 MALICIOUS 关切；它不是一次真实模型调用或真实生产判定。暂隔离仍可能在实际模型提出关切时触发，不能说这种页面必然被新规则放行。

代码证据与待修边界统一维护在 backend-review.md。日志 API 两次读取（一次历史范围、一次有界 tail）均超时，本轮不把无法取得日志当作没有错误；主要结论依据数据库、已验真实制品和确定性本地复放。原始 HTML 临时副本在分析结束清理，源码测试和 Git 不收录真实制品。

## 2026-10-15 生产发布后的只读核对（11:00–11:07 +08:00）

用户发布后核对 backend HEAD `c3becfc`。生产 Pod `previewship-65d6548c74-sr59w` 使用镜像 `prd_2026-10-15-10-55-10`，10:57:34 启动、10:59:23 Ready，重启 0。Flyway 启动校验 42 个迁移；只读数据库确认 V44/V42/V41 均成功，没有新增迁移。

只读分段读取运行中 `/app/app.jar` 的 ZIP 内容（共约 391 KiB，校验 ZIP CRC），逐一比较 ContentRiskPrompt、OpenRouterContentRiskClient、ContentRiskGroupState、ContentRiskService、ContentRiskProperties 五个核心类，均与上轮通过测试的本地最终 JAR 的类 SHA-256 一致。生产包内默认 v10、备用 `openai/gpt-4.1`、maxAiChars=48,000；五个相应内容审核环境覆盖变量均未设置。没有修改容器文件、应用配置或生产数据。一次 Java stdin 读取与一次原始二进制范围读取失败属于本次核对工具路径，后改用有界 base64 范围读取并完整验长/CRC；它们不是应用或 OpenRouter 故障。

生产 PostgreSQL 使用 `REPEATABLE READ READ ONLY`，数据库名 previewship、transaction_read_only=on，最后快照 UTC `2026-10-15 03:07:13.78516`（北京时间 11:07:13）。旧 TIMESTAMP 字段按 UTC 存储解读，未把数据库会话时区当成已转换的值。

- 新策略实际记录只有 **1 条**：游客部署 **#26631**，11:05:59.801 创建，11:06:00.291 READY，11:06:05.817 COMPLETED/PASS、errorCode=null、model_version=null（本地规则，未调用 AI）。这证明普通后台发布在新版本中成功运行，不证明 AI 或备用纠正路径已在生产流量中触发。
- 新 Pod 日志截至 11:06:00 的 146 行中，SAFE_WITH_EVIDENCE、SUBMISSION_TARGET_MISSING、AI_INVALID_OUTPUT、AI_EVIDENCE_REVIEW_REQUIRED、AI_INPUT_BUDGET_EXCEEDED、AI_GROUP_STATE_INVALID、发布审核最终失败、后台审核最终未完成均 **0 条**；AI 输入计划及自动纠正也 **0 条**。截至最后数据库快照仍没有新 AI 审核，因此不能由错误为 0 推出三类事故生产验收已经完成。
- 发布前两小时的现存 v9 检查有 PASS 20、UNKNOWN 2（预算/输出异常各 1）；此为当前存续行数，不将已删除记录遗漏的分母解释为完整生产失败率。
- 历史 #26533/#26555/#26560/#26564 仍是 v9 UNKNOWN/READY；#26558 仍是 v9 AI_EVIDENCE_REVIEW_REQUIRED/FAILED；#26538/#26540 当前已不存在。此次核对没有补偿发布、重置审核或发信，也没有新建生产测试项目。

结论：**新补丁和默认配置已实际部署，普通发布链路通过一个生产样本；AI 输出纠正、证据纠正及同规模预算触发路径仍缺生产样本，不能宣布全部业务验收通过。** 两份原事故制品的无损压缩已由上轮本地静态重放证实；真实主备模型合成验证是独立本地外呼，不能冒充生产审核记录。后续应基于 v10 的真实 AI/异常纠正/大输入记录继续验收。本次没有运行持续监控或创建自动任务。

## 2026-10-15 审核可靠性修复（当前增量）

代码基线 backend `c2e68a6` 加本轮未提交差异；本机 Java 21、隔离 H2，生产证据来自上轮只读核对。本轮不提交、不部署、不写共享库、不封禁真实用户或发送真实邮件；真实用户制品只做本机静态预算回放，不执行脚本、不访问样本目的地、不上传模型。

- 输出契约：新请求使用嵌套 assessment 三分支 Schema，SAFE+证据在生成约束中被排除；服务端继续严格拒绝矛盾响应，具体原因用于一次纠正并切备用模型。嵌套/旧扁平混合坏响应的外层/内层固定风险枚举均保留，不从任意嵌套数据推测恶意。实际模型链进入既有 160 字符字段，不新增数据库列。
- 输入预算：对报告中的两份已验原始 content hash 制品，本机逐一验证 22 候选、31,600 原文字符、542/540 引用保留；实际请求从 57,885/57,789 降至 **42,753/42,713**，均完整单批，不依赖增大 48,000 上限。真实源文本、路径、摘要与 ZIP 不入版本文档或源码测试。
- 首轮定向 `mvn -q -Dtest=ContentRiskPromptTest,ContentRiskPromptPlanTest,ContentRiskGroupStateTest,ContentRiskBatchClientTest,ContentRiskSharedHostingTest,OpenRouterContentRiskClientTest,ContentRiskServiceTest,ContentRiskPersistenceTest test` 退出 0，**166/166** 通过；随后补齐在途升级及混合响应反例，最终结果以以下全量/复测为准。
- 显式真实模型合成验收：`PREVIEWSHIP_OPENROUTER_LIVE_TEST=true mvn -q '-Dtest=OpenRouterContentRiskLiveTest#primaryAndFallbackSupportTheStructuredContractOnSyntheticAccounts' test` 退出 0。两模型各一份正常独立 API 认证、一份密码到机器人的近邻样本，共 **4 次 HTTP 200**：正常均经服务层 PASS、恶意均 HOLD，error=null；每次 1.047–1.430 秒，仅属小合成样本。没有发布测试网站或发信；默认测试不联网。模型实际接受新 Schema，不代表全部生产流量或零误判保证。
- 升级保护：旧分组并批后保留最强 M/S/U，低置信或同轮修正不清 U，独立完整 HIGH/SAFE 可逐组清除；无关切、零轮次且同 hash 有效 PENDING 快照可续接新策略，runId/inputRef 不重建。已确认 HOLD、永久封禁与风险历史不因升级失效。
- 独立静态复核已关闭分组布局漂移、PENDING 策略漂移及混合 envelope 遗忘关切三项问题，最终无阻断项。静态复核不替代以下实际测试。

最终验证：

| 范围 | 命令与结果 |
|---|---|
| 全量构建 | `mvn -q clean package` 退出 0；137 类、**1047 用例，1032 通过、15 跳过、0 失败/错误**。包含大制品内存测试：Scanner 4/4（共 223.658 秒）、Artifact 1/1；未排除资源用例。默认真实模型/外部环境依赖按条件跳过，不算通过 |
| 最终补丁复测并重打包 | 全量之后仅修正混合 envelope 的固定风险枚举保存、补充 3 个反例。`mvn -q -Dtest=ContentRiskPromptTest,ContentRiskPromptPlanTest,ContentRiskGroupStateTest,ContentRiskBatchClientTest,ContentRiskSharedHostingTest,OpenRouterContentRiskClientTest,ContentRiskServiceTest,ContentRiskPersistenceTest package` 退出 0，**172/172** 通过（Client 57、Persistence 50 等）；不把累计 XML 说成一次全量执行 |
| 真实制品最终回放 | 用最终 target/classes 静态重扫已验摘要的 26555/26560，候选 22、原文 31,600、引用 542/540、prompt 42,753/42,713、单批/无扫描错误，与修复设计一致；临时工具在仓库外 |
| 成品与差异 | 最终 JAR 内 v10、fallback-model 默认和混合响应风险提取字节码已核验；根/Backend `git diff --check` 及版本文档本地链接检查通过。Console、CLI、MCP、扩展未改动，因此未重跑其构建 |

以上全量与复测分别记录，真实模型 4 样本是独立显式执行，不等于所有 LiveTest 均验收。仅更新后端，无新 SQL、前端/API 字段或 IMAP 方案；旧终态/已删除项目未自动补偿。生产新镜像、v10 实际审核错误率、渠道处置与真实邮件仍待发布后验收。

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
