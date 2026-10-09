# Console 发布与后台安全检查交互

本版本把部署完成与内容安全检查分开。`QUEUED/BUILDING` 期间，按钮保持 loading 并阻止重复上传；部署达到 `READY` 时结束发布等待，公开链接可按服务端 `urlStatus` 分享。`contentRisk.status=PENDING/CHECKING/RETRYING` 在详情页作为非阻塞状态展示，当前页面最多再查询两分钟；超时后可手动刷新，后台任务不依赖页面存活。审核完成为 `PASS` 时按原流程显示建议；技术性 `UNKNOWN` 不标记违规，也不关闭已经上线的链接。

确认高风险后，后端把风险部署标记为 `BLOCKED` 并限制访问。Console 的发布详情、游客页、内嵌上传、项目、部署历史、Dashboard、Showcase 与管理入口按 `urlStatus`（兼容旧接口缺字段时的部署状态）决定是否提供打开或复制。前端隐藏动作仅是交互保护，实际封禁由后端和托管渠道执行。风险卡片仍显示文件、行号、理由及整改建议；免注册用户仅看到页面状态，不承诺发送邮件。

整改发布保留原项目：登录用户选择原项目，游客在隔离状态的同一项目上传时向原 `POST /public/guest/deployments` 附上 `claimToken`，成功后使用返回的新部署 ID 和原认领凭据继续跟踪。隔离期间新版本必须先通过安全检查才可恢复原链接；检查失败不清除游客项目上下文。普通游客发布不附 `claimToken`，仍创建新项目。

接口依赖：部署详情及列表返回 `urlStatus`；项目返回 `contentRestricted`；内容审核状态增加 `PENDING`；游客整改上传接受可选 `claimToken`。旧服务缺少 `urlStatus` 时，部署详情/列表只把 `READY` 视为可分享。此次未增加部署列表的审核状态字段，详情页展示完整审核进度。

CLI、MCP 和编辑器扩展使用部署状态与审核状态分别生成提示。`READY+PENDING/CHECKING/RETRYING` 明确链接已上线、后台审核仍在进行；`READY+UNKNOWN` 说明审核未完成但并非违规结论；`BLOCKED+HOLD` 说明链接已限制访问。状态查询按 `urlStatus` 隐藏不可访问链接，扩展区分发布前拦截与发布后下架。工具返回部署成功不代表后台安全审核通过。

本地验证记录：Console 发布生命周期、规则和实际组件渲染定向测试 75/75，最终全量单测 **215/215**、TypeScript、全库 ESLint 和生产构建通过（IndexNow 显式关闭）；CLI 测试 2/2、MCP 测试 1/1、扩展结果测试 1/1，三处 TypeScript 与本地构建均通过。覆盖 READY 后续查询、下架隐藏链接、游客同项目再次整改和八语言文案。详细环境与尚未执行的真实前后端联调见 [总验证记录](verification.md)。当前实现尚未部署，未发送真实通知。
