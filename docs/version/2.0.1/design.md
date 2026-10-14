# 发布与后台内容审核分离

## 已批准范围

2026-10-14 管理员手动封禁增量：填写的公开理由通知实际所属注册用户；确认界面明确项目/账号范围，提交期间锁定目标及按钮。复用既有持久邮件执行器，封禁与通知入队原子提交，外部发送异步有限重试；重复封禁去重，邮件服务受理与用户收到严格区分。账号已封禁仍可获安全邮件，游客没有地址则记录跳过。八语言措辞仅陈述实际处置和支持联系，不自动作违法指控或承诺上传即解封。接口、存储及操作唯一正文见 backend-isolation.md、frontend.md 和 release.md 对应小节。

普通项目沿原上传、额度校验、规范化、渠道创建及激活流程发布。AI 内容审核移为独立、持久化后台任务。已确认危险内容自动撤销访问并通知整改；技术错误不能直接认定用户违规；已有模型风险但证据未决时暂隔离并自动复核。已限制访问的项目允许上传整改，整改版本通过前置审核后才创建公开渠道并恢复原链接。没有人工审核队列。

## 状态与任务

部署状态继续使用 QUEUED、BUILDING、READY、SUPERSEDED、FAILED、EXPIRED、BLOCKED。READY 表示渠道发布完成；内容审核使用 PENDING、CHECKING、RETRYING、COMPLETED，与部署等待分开。确认风险的公开部署转 BLOCKED，保留 readyAt；项目维持 ACTIVE，另持久化内容隔离标记，管理员 Abuse 封禁语义保持不变。

复用每 deployment 唯一的 ContentRiskCheck，新增规范化输入引用和租约。调用渠道之前将实际 preparedFiles 写入私有不可变快照并注册 PENDING；只有 READY/SUPERSEDED 的新后台记录可被调度。快照 hash 必须与审核及发布字节一致。旧记录不回填、不自动重审。数据库短事务领取任务，AI 在事务外运行；runId/hash 防止迟到结果覆盖，租约到期恢复，重试沿现有次数与时间预算。终态或取消后按有界规则清理输入。

审核 HOLD 在结果事务中持久化撤销任务；撤销调用必须确认成功或不存在，失败独立重试。仅风险部署及同项目相同 hash 副本被撤销；仅风险版本仍为 latest 时限制项目入口。旧 A 的迟到结果不能误封不同内容的 B，B 自身审核继续。归档、删除、过期或永久封禁后的任务不得恢复公开。

## 协作接口

- ContentRiskService.registerBackgroundReview(Deployment, Project, Map<String, byte[]>)：加入调用方事务，保存规范化快照和记录。
- ContentRiskService.requirePreparedForPublication(Long)：要求本次已有有效 PASS 或绑定快照的后台 PENDING 记录。
- ContentRiskService.requireNotKnownUnsafe(Map<String, byte[]>)：确认危险 hash 仍前置拦截。
- ContentRiskService.processDuePublishedReviews(int)：独立调度，仅处理新后台任务。
- ContentIsolationService.requiresPrePublishReview(Project/Long)：读取可整改隔离状态。
- ContentIsolationService.applyConfirmedRisk(Long, String, String)：在审核结果事务内隔离并入撤销任务。
- ContentIsolationService.clearAfterVerifiedActivation(Project, Deployment, String)：仅有效 PASS 的成功整改激活可清隔离。
- PreviewProvider.deleteDeploymentStrict(Project, Deployment)：确认撤销，错误交给持久重试。
- 用户部署详情/列表新增 urlStatus，项目详情暴露 contentRestricted；urlStatus 是可打开/复制的服务端事实。

## 用户交互

普通发布的按钮 loading 仅持续到部署成功或失败。READY 后立即可分享，非阻塞显示后台审核状态；页面有界继续查询审核，服务端任务独立于页面存活。发现风险后禁用所有打开/复制入口，显示固定原因、定位及整改操作。整改上传仍使用原项目，审核等待明确提示。技术 UNKNOWN 显示审核未完成，不显示违规或假称邮件已发送。游客无邮箱时只承诺站内状态；登录用户安全邮件使用现有 outbox、语言及去重机制。

```mermaid
flowchart TD
    A[上传并校验原有权限与额度] --> B{项目已内容隔离?}
    B -->|否| C[保存私有审核快照与任务]
    C --> D[部署成功 READY · 可分享]
    D --> E[独立后台规则与必要的 AI 审核]
    E -->|PASS| F[保持在线 · 可参与公开索引]
    E -->|技术 UNKNOWN| G[有限自动重试 · 保持在线 · 运维告警]
    E -->|确认 HOLD| H[限制访问 · 持久撤销渠道 · 整改通知]
    H --> I[用户在原项目上传整改]
    I --> J[前置审核]
    B -->|是| J
    J -->|PASS| K[部署并恢复原链接]
    J -->|HOLD 或 UNKNOWN| L[继续限制访问 · 保留整改入口]
```

## 系统边界

权限、会员项目数/部署次数/上传量/单包大小/并发构建/托管期、ZIP 路径和解压安全检查维持原权益。后台审核与撤销重试不另扣用户额度、不占构建并发、不延长托管期。后台私有审核快照独立于会员历史版本清理。已公开后下架不套用构建失败退款。

已确认风险和整改预审要在 provider.createDeployment 之前检查，激活时在同一项目锁下再检查。前台请求、Worker、回滚、归档恢复、游客/插件入口共享门禁。所有预览域名与独立渠道 URL 都需要撤销；数据库 BLOCKED 不等于渠道删除成功。缓存传播时间、已下载文件和浏览器安全名单恢复不保证瞬时完成。

先发布后审存在真实公开暴露窗口；AI 技术故障期间不保证最长窗口。不能为了审核通过率把 UNKNOWN/HOLD 改为 PASS。审核故障单独告警和记录，不使普通已经上线的部署最终 FAILED。未经审核的内容不进入公开 Showcase/自动索引放大入口。

## 钓鱼漏检修复补充

用户于 2026-10-12 批准：对可执行的编码内容构建有界静态解码视图，AI 的 file/line/referenceId 均指向送审视图；内容摘要仍绑定原上传字节，不把视图发布到渠道。唯一字面变量关联提交调用，敏感页按需纳入本地依赖脚本。

UNKNOWN 分为技术未完成和风险未决：实际 MALICIOUS/SUSPICIOUS 关切的结果暂隔离；主动隐藏的编码载荷超出静态展开边界时，另以本地 OPAQUE_CONTENT_UNINSPECTED 暂隔离并提示提供可读代码，不伪造 AI 恶意判定。风险未决使用 CONTENT_RISK_RECHECK_PENDING，与永久 Abuse 封禁分开；自动复核耗尽才入队整改通知，本地不透明内容则终结为需修改文件。独立完整、有效 HIGH/SAFE 可纠正未决误报，模型在同轮错误修复中改口 SAFE、低置信度、安全证据缺失或旧任务均不得恢复。已确认 HOLD 同摘要不会通过此机制重新抽样。

自托管暂隔离关闭项目 current 并保留不可公开目录，复核通过恢复当前版本及原 URL；远程渠道先严格撤销，复核通过后从完整已验证快照重建、轮询成功再恢复稳定项目链接。副本恢复失败或渠道尚未完成时保持限制，不假称 READY。

content_abuse_history 不依赖项目/部署外键，保留固定枚举和摘要，删除项目不能抹除审计。只有 confirmed 摘要加入精确拦截；suspected 只在最近 7 天触发账号后续前置检查，当前有效自动纠正后清除其影响，保留审计。

Cloudflare 入口仅使用已有管理员会话、角色和 CSRF：登记已核实的 reportId 与 PreviewShip HTTPS 域名，按项目封禁全部别名并持久撤销；不得执行被举报 URL、任意外链或邮件正文里的操作指令。报告重放不得误封同 slug 后来重建的新项目。官方邮箱自动导入方案已取消；管理员仍需核实云厂商控制台/告警后使用现有登记入口，不自动读取邮箱或执行邮件指令。
