# PreviewShip 内容信任与发布安全治理设计

- 日期：2026-09-01
- 状态：已确认
- 范围：Search Console 安全事件处置、内部账号信誉与索引策略、管理后台真实访问与安全诊断

## 1. 背景

当前 PreviewShip 后台主要展示数据库中的 `ACTIVE`、`READY` 等业务状态。它们只能说明项目和部署记录处于可用状态，不能证明：

- 域名、TLS 和反向代理当前真实可访问；
- 密码、私有和公开项目的 HTTP 响应符合预期；
- Google 或正式安全信誉供应商是否对精确 URL 或共享根域命中风险；
- 新账号生成的公开内容是否应该被搜索引擎索引。

因此会出现“后台看起来正常，但用户浏览器显示 deceptive/phishing warning”的认知差异。现有公开项目的索引判断也只依赖项目状态和可见性，缺少账号信誉维度。

## 2. 设计目标

1. 建立可执行、可审计的 Search Console 安全事件清理和复审流程。
2. 新账号发布内容默认 `noindex`，在内部信誉建立后无感开放索引。
3. 将业务状态、实际 HTTP、访问模式、索引策略和安全信誉拆成独立事实展示给内部管理员。
4. 所有外部探测异步执行，不增加用户发布和预览请求的尾延迟。
5. 风险判断失败时保持保守策略，同时不影响正常部署完成。

## 3. 明确不做

- 不向用户展示账号信誉、索引等待、复审状态或安全供应商结果。
- 不改变用户发布成功、项目 ACTIVE/READY 或公开访问的既有含义。
- 不承诺 `noindex` 能消除 Safe Browsing 警告；它只控制索引和降低新账号内容暴露面。
- 第一版不因单次 HTTP 探测失败或供应商命中自动封禁用户；仍由管理员执行现有封禁动作。
- 不执行用户页面 JavaScript，不保存页面正文，不通过浏览器自动化提交 Search Console 复审。
- 不抓取 Transparency Report 的非公开接口，不把“供应商未命中”描述为绝对安全。

## 4. 用户无感知边界

账号信誉是内部控制面状态，必须满足以下边界：

- 用户 API、用户控制台、CLI、MCP、扩展、邮件和发布成功提示均不返回或展示信誉状态。
- 公开预览页面不渲染任何“等待索引”“信誉审核中”文案。
- `PENDING` 和 `RESTRICTED` 只改变 HTTP 索引指令，不改变本来允许的访问行为。
- 只有内部 Abuse 管理接口和后台可以读取信誉、诊断和复审信息。
- 产品事件不得记录可被前端反推的信誉迁移细节；安全审计使用独立内部日志。
- 标准的 `X-Robots-Tag`/robots 响应必须对 crawler 可见，因此技术上可被检查响应头的用户观察到；系统不额外暴露状态、原因或预计等待时间。

## 5. 总体模型

系统维护五个正交维度，禁止再合并为单一“正常/异常”状态：

| 维度 | 事实来源 | 示例 |
|---|---|---|
| 业务状态 | PreviewShip 数据库 | User ACTIVE、Project ACTIVE、Deployment READY |
| 访问配置 | Project 配置 | PUBLIC、PASSWORD、PRIVATE |
| 实际访问 | 异步 HTTP 探测 | 200、401、403、404、503、DNS/TLS/超时 |
| 索引策略 | 项目与账号信誉联合判定 | INDEX、NOINDEX 及内部原因 |
| 安全信誉 | 正式供应商 API | 精确 URL 未命中、某个平台域命中、未知、供应商错误 |

`PASSWORD + HTTP 401` 和 `PRIVATE + HTTP 403` 属于符合预期，不应标记为站点故障。精确 URL 未命中与 `previewship.net` 等任一平台域命中可以同时成立，后台必须分别展示各域结果。

## 6. 工作流一：Search Console 安全事件处置

### 6.1 属性与权限

- 为 `previewship.net` 建立 DNS 验证的 Domain property，覆盖其协议和全部子域。
- `previewship.cc`、`previewship.com`、`mellowcade.com` 等其他内容域各自建立独立 Domain property。
- 至少保留两个独立 Owner；安全运营账号使用 Full user 权限。
- 保存 DNS 验证和权限变更审计，但不在产品数据库保存 Google 登录凭据。

### 6.2 两条处置路径

**Search Console 存在 Security Issue：**

1. 冻结证据：问题类型、首次发现时间、全部样例 URL、截图、浏览器告警、HTTP 响应与重定向链。
2. 将 URL 映射到用户、项目、部署、内容哈希和第三方资源。
3. 样例 URL 只作为入口；按相同风险规则扫描所有活动项目和历史可访问 URL。
4. 确认风险的项目立即隔离，返回真实 `404/410`；修复项目则验证修复后的 `200` 内容。
5. 对桌面/移动抓取、UA/Referer 差异、外链、iframe、脚本、表单、下载和跳转做全量复扫。
6. 所有问题类型和同类 URL 均通过验证后，由 Owner/Full user 在 UI 提交 Request Review。
7. 保存提交人、提交时间、复审文本、确认邮件和最终结果；等待决定期间不重复提交。

**Search Console 无 Security Issue，但浏览器仍告警：**

1. 记录为算法告警事件，执行相同的定界、隔离和全量复扫。
2. 修复后等待 Google 重抓和信誉同步，不伪造“已提交复审”状态。
3. 只有确认属于误报时，人工提交 Safe Browsing 误报表单。

Search Console API 不支持读取 Security Issues 样例、提交复审或读取复审队列，因此这部分必须保留人工闸门。

### 6.3 复审材料

复审记录至少包含：

- Issue 类型和发现时间；
- 根因，而不只写“误报”；
- 扫描的账号、项目、部署和 URL 数量；
- 下线、修正、移除的内容与平台防复发措施；
- 样例和同规则命中 URL 的最终 HTTP、内容哈希及复扫结果；
- 预发布检查、持续信誉检测、隔离、审计和告警措施。

## 7. 工作流二：内部账号信誉与索引策略

### 7.1 状态模型

新增内部枚举 `AccountReputationState`：

- `PENDING`：默认状态；公开预览可访问，但返回 `noindex, nofollow, noarchive`。
- `ESTABLISHED`：允许满足其他条件的公开项目被索引。
- `RESTRICTED`：账号存在 Abuse 或安全事件；全账号 `noindex`，禁止自动晋级。

名称使用 `ESTABLISHED` 而不是 `TRUSTED`，避免将账号历史信誉误解为当前内容安全认证。账号现有 `ACTIVE/BLOCKED` 继续负责访问和封禁；信誉状态只负责索引，二者不得合并。

User 增加内部字段：

- `reputation_state`；
- `reputation_reason`；
- `reputation_changed_at`；
- `reputation_evidence_since`。

原因码至少包含：`NEW_ACCOUNT`、`AUTO_CRITERIA_MET`、`PROJECT_BLOCKED`、`DEPLOYMENT_BLOCKED`、`MANUAL_REVIEW_RESET`、`MANUAL_APPROVED`、`MIGRATED_ESTABLISHED`、`MIGRATED_BLOCKED`。

### 7.2 混合晋级策略

只对 `PENDING + CUSTOMER + ACTIVE` 用户进行自动评估，全部满足后迁移为 `ESTABLISHED`：

1. 距 `reputation_evidence_since` 至少 7 天；
2. 至少 3 次权威成功部署，依据 `ready_at IS NOT NULL`，而不是当前是否仍为 READY；
3. 成功部署横跨至少 2 个 UTC 日期；
4. 只计原始上传来源，排除 rollback、redeploy、subscription restore 和 guest；
5. 用户、项目和部署均无 BLOCKED 或 Abuse 记录。

付费状态不作为信誉条件；普通部署失败也不作为负面信号。低风险账号自动晋级，可疑账号进入人工处理。

迁移规则：

- 注册或 Guest 项目：默认 `PENDING`；Guest 永远不可索引。
- `PENDING -> ESTABLISHED`：达到全部硬条件，或管理员明确批准。
- `ESTABLISHED -> RESTRICTED`：任一项目或部署被确认 Abuse 时立即执行。
- `RESTRICTED -> PENDING`：管理员复核后重置 `evidence_since`，重新积累证据。
- `RESTRICTED -> ESTABLISHED`：仅允许管理员明确批准并留下审计理由。
- User `BLOCKED` 始终优先于信誉状态，继续执行现有全账号下线逻辑。

### 7.3 评估时机和故障策略

- Deployment READY 权威事实落库后，异步调用统一的 reputation evaluator。
- 每小时分页扫描符合年龄条件的 PENDING 用户，补偿时间跨线和事件执行失败。
- evaluator 使用用户行锁保证并发迁移幂等。
- 评估异常只记录告警，部署仍正常 READY，信誉保持 PENDING，采用 fail-closed。
- Preview 热路径读取包含用户状态和信誉的短时缓存投影，禁止对每个资源请求实时聚合部署历史。
- 信誉变化后使该账号全部预览访问缓存失效，并在事务完成后再次失效，避免竞态。

### 7.4 索引判定

允许索引的完整条件：

```text
project.status == ACTIVE
&& user.status == ACTIVE
&& project.visibility == PUBLIC
&& user.reputationState == ESTABLISHED
&& project.userId != null
```

其他情况均返回：

```http
X-Robots-Tag: noindex, nofollow, noarchive
```

`noindex` 页面必须允许搜索引擎抓取该响应头，不能同时用 `robots.txt: Disallow` 阻挡，否则搜索引擎无法读取 `noindex`。robots 响应应与这一规则配套调整。

### 7.5 Showcase、sitemap 与 IndexNow

账号信誉必须覆盖所有搜索入口，不能只修改原始预览子域：

- Showcase 现有内容质量资格继续保持原有用户可见语义，不增加 `ACCOUNT_PENDING`、`RESTRICTED` 等原因，也不显示等待时间。
- 将“内容质量资格”和“最终搜索索引策略”拆开计算。用户侧仍只看到现有 Showcase 状态；控制器渲染 robots meta、公开 sitemap 和服务端搜索提交时，额外应用账号信誉。
- Showcase 详情页只有在原有内容/项目/部署条件全部满足且账号为 ESTABLISHED 时才输出 `index, follow`；否则输出 `noindex`，但不改变页面原本是否可访问。
- Showcase sitemap 查询必须关联 User 并只返回 ESTABLISHED 账号的有效条目；不能依赖序列化给用户的 `indexable` 字段作为最终安全授权。
- 账号迁移为 ESTABLISHED、PENDING 或 RESTRICTED 时，为该账号受影响的 Showcase URL 写入现有 IndexNow outbox：晋级用于通知新资格，降级用于促进搜索引擎重抓 `noindex`。IndexNow 只表示 URL 已变化，不代替 robots/noindex 判定。
- 信誉变化不隐藏用户已发布的 Showcase、不改变用户提交状态，也不向用户 API增加信誉原因。公开聚合页可以继续展示符合现有内容质量规则的项目；crawler 访问详情页时仍会收到最终 noindex 策略。

## 8. 工作流三：内部真实访问和安全诊断

### 8.1 异步架构

采用 PostgreSQL 租约队列和持久诊断快照，不在管理列表请求或用户部署链路中执行外部网络请求。

新增 `admin_project_diagnostics`，每项目保存最新任务和诊断快照，核心字段包括：

- 任务：`state`、`available_at`、`lease_until`、`attempt_count`、`run_id`；
- 目标：`project_id`、`target_deployment_id`；
- HTTP：状态码、分类、耗时、错误码、检查时间；
- 安全：精确 URL 信誉、供应商和检查时间；配置化平台域的信誉保存在共享缓存中，由管理查询一次批量合并；
- 告警：连续失败次数、告警指纹和最后告警时间。

任务状态：`NOT_RUN | QUEUED | RUNNING | SUCCEEDED | PARTIAL | FAILED`。

Worker 使用 `FOR UPDATE SKIP LOCKED` 短事务领取任务，网络请求必须在事务外执行。完成写回使用 `run_id + target_deployment_id` 比较交换；如果部署已切换，则丢弃旧结果。租约过期的任务可以重新领取。

触发来源：

- 管理员手动刷新；
- 新部署 READY 后只入队；
- 定时补扫过期快照。

### 8.2 HTTP 诊断

保留精确状态码，并归类为：

- 2xx：`REACHABLE`；
- 3xx：`REDIRECT`，第一版不跟随；
- 401/403：`ACCESS_GATED`；
- 404/410：`NOT_FOUND`；
- 429：`RATE_LIMITED`；
- 5xx：`UPSTREAM_FAILURE`；
- DNS、TLS、连接和超时：`NETWORK_FAILURE`。

另计算 `accessAlignment = MATCH | MISMATCH | UNKNOWN`：

- PASSWORD + 401、PRIVATE + 403：MATCH；
- PUBLIC + 401/403：MISMATCH；
- 业务 READY + 404/410：MISMATCH；
- 缺少诊断或瞬时网络错误：UNKNOWN。

默认配置：HTTP 成功缓存 5 分钟；DNS 超时 500ms、连接超时 2 秒、总超时 5 秒；最多读取 32KiB 后丢弃正文；瞬时失败最多重试 2 次并带抖动。

### 8.3 安全信誉

供应商通过 `SecurityReputationClient` 接口抽象。商业环境默认接入 Google Cloud Web Risk 或其他已获许可的正式 API。

新增 `security_reputation_cache`，按以下键缓存：

```text
provider + scope(EXACT_URL | PLATFORM_DOMAIN) + indicator_sha256
```

信誉结果：

- `UNKNOWN`：尚未检测或没有可用供应商；
- `NO_MATCH`：供应商当前未命中；
- `THREAT_FOUND`：命中威胁，并保存 threat types；
- `PROVIDER_ERROR`：限流、超时或供应商错误。

`NO_MATCH` 默认缓存 6 小时；`THREAT_FOUND` 和错误默认 10 分钟复核，并尊重供应商返回的过期时间。后台必须分别呈现精确 URL 和各个平台域结果。

平台域不是单值。配置提供受控列表，例如 `previewship.net`、`previewship.cc`、`previewship.com`、`mellowcade.com`；系统对规范化的 `https://{domain}/` 分别查询并保存结果。平台域属于全局事实，不复制到每个项目快照：后台列表一次批量读取这些缓存结果并合并为 `platformDomains[]`，全局定时任务负责刷新，避免按项目重复请求和结果漂移。

### 8.4 SSRF 和探测安全边界

- SELF_HOSTED URL 只能由可信 slug 和配置的 preview base domain 构造。
- 历史 Vercel URL 只允许严格匹配的 `https://*.vercel.app` 或配置白名单。
- 仅允许 HTTPS 443 和 `/`，拒绝 userinfo、query、fragment 和调用方传入任意 URL。
- 解析全部 A/AAAA；任一地址命中 loopback、private、link-local、multicast、CGNAT 或 metadata 即拒绝。
- 不跟随重定向，不携带 Cookie/Authorization，不执行 JS，不发 POST。
- Worker 运行环境额外限制 egress，禁止访问私网、link-local 和 metadata，只开放 DNS、HTTPS 和明确供应商。
- 日志和数据库只保存 allowlist 元数据、哈希和诊断结果，不保存页面正文或供应商原始响应。

### 8.5 内部 API 与后台

现有 Abuse 项目列表响应增加内部字段：

- `access.mode`、`passwordConfigured`；
- `diagnostics.state`、`stale`、`targetDeploymentId`；
- HTTP 状态、分类、耗时、检查时间和错误码；
- 精确 URL 信誉与 `platformDomains[]` 逐域信誉；
- `accessAlignment`、`overallSeverity` 和稳定的告警码。

新增：

- `POST /console/admin/abuse/projects/{projectId}/diagnostics/refresh`：无 URL 入参，返回 202；60 秒内或任务运行中幂等返回现有 run。
- `GET /console/admin/abuse/projects/{projectId}/diagnostics`：读取单项目快照，供运行中轮询。

两者继续执行现有管理员鉴权。项目列表批量读取快照，禁止 N+1 查询。

后台将原“Status”拆成：

- 业务状态；
- 访问模式；
- 实际 HTTP；
- 安全信誉；
- 内部索引策略与账号信誉，仅管理员可见。

示例：`PASSWORD / HTTP 401（符合预期）/ 243ms / 精确 URL 未命中 / previewship.net 危险 / 2 分钟前`。

用户侧的类型、接口和页面不增加这些字段。

## 9. 告警与自动处置边界

第一版只告警，不自动封禁。以下情况触发内部告警：

- 精确 URL 命中威胁；
- 平台根域命中威胁；
- READY + PUBLIC 连续 3 次失败且跨度至少 5 分钟；
- 诊断队列最老任务等待超过 5 分钟；
- 供应商 15 分钟错误率超过 20%。

只有状态转变或告警指纹变化才发送；同一指纹 24 小时内抑制。平台根域命中不得自动封禁单个用户。管理员确认项目/部署 Abuse 后，复用现有封禁服务，并同步将账号信誉降为 RESTRICTED。

## 10. 数据迁移与兼容

建议使用两个独立 Flyway 迁移：

- `V33__add_account_reputation.sql`；
- `V34__add_admin_project_diagnostics.sql`。

信誉回填：

1. 新字段均设 NOT NULL 和安全默认值，`evidence_since` 回填用户创建时间。
2. 已 BLOCKED 或有 Abuse 的用户迁移为 RESTRICTED。
3. 受控 INTERNAL 账号迁移为 ESTABLISHED。
4. 其他历史 CUSTOMER 按与运行时相同的 7 天、3 次成功、跨 2 日、无 Abuse 条件回填；不满足者保持 PENDING。
5. 为信誉候选扫描和按用户统计成功部署添加针对性索引。

旧应用会忽略新增列；新应用由 Flyway 先完成迁移。诊断表缺行时，管理 API 返回 NOT_RUN/UNKNOWN，不影响现有项目列表。

## 11. 分阶段上线

### 阶段 A：观测与止血

- 上线异步 HTTP 诊断、精确 URL/根域信誉和内部后台展示。
- 信誉没有配置或供应商不可用时展示 UNKNOWN，不伪造 CLEAN。
- 保留人工封禁；建立告警去重和 Search Console 事件记录。

### 阶段 B：新账号无感 noindex

- 新账号默认 PENDING。
- 修正 robots 与 `X-Robots-Tag` 配合方式。
- 先记录自动晋级计算结果但不执行迁移，观察阈值分布和误判。

### 阶段 C：混合信誉晋级

- 开启低风险账号自动晋级。
- Abuse 命中立即降级，恢复必须人工介入。
- 观察一段时间后再调整阈值，配置变化必须保留审计。

### 阶段 D：全域清理与复审

- 根据诊断数据完成全部内容域的风险清理和复扫。
- Search Console 有 issue 时人工提交复审；无 issue 时走算法重抓/误报流程。
- 记录审批结果并持续监控，不能以浏览器单次缓存结果作为唯一事实。

## 12. 测试与验收

### 12.1 信誉和索引

- 新账号、Guest、PASSWORD、PRIVATE、PENDING、RESTRICTED 和缺失用户均允许既有访问语义，但返回 noindex。
- 7 天、3 次成功、跨 2 个 UTC 日的边界测试；任一条件不足不得晋级。
- superseded/expired 但曾成功的原始部署仍计入；失败、回滚、重部署、恢复和 Guest 不计。
- RESTRICTED 不自动晋级；人工 reset 后旧证据不得重复使用。
- 项目/部署确认 Abuse 后账号立即降级；封禁事务失败不得产生半状态。
- 索引策略响应可被 crawler 获取，不被 robots.txt 阻挡。
- 信誉评估失败不影响部署 READY。

### 12.2 诊断

- HTTP 200、401、403、404、410、429、503、DNS、TLS 和 timeout 分类正确。
- PASSWORD+401、PRIVATE+403 为 MATCH，PUBLIC+401/403 为 MISMATCH。
- 精确 URL NO_MATCH 与任一平台域 THREAT_FOUND 可以同时保存和显示；多个平台域结果不能互相覆盖。
- 未配置 provider、限流和供应商错误均为 UNKNOWN/PROVIDER_ERROR，不能显示“安全”。
- 并发 claim 唯一、冷却幂等、租约恢复、重试退避和部署切换 CAS 写回均有覆盖。
- 列表批量查询无 N+1；只有 QUEUED/RUNNING 状态短轮询。

### 12.3 安全

- 覆盖协议、端口、userinfo、query、fragment、后缀欺骗、私网 IPv4/IPv6、混合 DNS、metadata 和 redirect。
- 测试使用注入的 fake transport，不允许测试真实访问公网。
- 验证正文上限、正文不落库、不记录凭据和供应商原始响应。

### 12.4 用户无感知

- 用户端 REST/CLI/MCP/扩展响应契约无新增信誉或索引字段。
- 用户控制台、邮件和公开预览无等待或审核文案。
- 发布成功、访问控制和订阅流程的回归测试保持不变。
- Showcase 用户视图不出现信誉原因；详情页 meta、sitemap 和 IndexNow 则遵守内部最终索引策略。

## 13. 监控和回滚

关键指标：诊断队列深度与最老等待时间、HTTP 分类分布、供应商命中与错误率、信誉状态迁移数量、noindex/index 判定数量、缓存失效失败和复审事件状态。

回滚策略：

- 诊断 worker、定时补扫和供应商调用均可通过配置关闭；后台保留旧业务状态并将诊断显示为 UNKNOWN。
- 自动信誉晋级可关闭，已有状态保持不变；紧急情况下可内部批量降为 PENDING/RESTRICTED，但不得改变用户访问状态。
- 数据库新增字段和表保持向后兼容，不在应用回滚时删除。
- noindex 策略单独配置开关只用于紧急止损；任何放宽都必须记录审计。

## 14. 官方依据

- Google Search Console Security Issues：https://support.google.com/webmasters/answer/9044101
- Google 危险网站处理和算法告警：https://support.google.com/webmasters/answer/6347750
- Google `noindex` 规则：https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Google 防止平台用户生成垃圾内容：https://developers.google.com/search/docs/monitor-debug/prevent-abuse
- Search Console API 能力边界：https://developers.google.com/webmaster-tools/v1/api_reference_index
- Google Cloud Web Risk Lookup API：https://cloud.google.com/web-risk/docs/lookup-api
