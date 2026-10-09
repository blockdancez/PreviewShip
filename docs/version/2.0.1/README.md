# PreviewShip 2.0.1

目标：普通发布不等待 AI 审核；后台确认风险后自动限制访问、通知整改；同一项目整改通过后恢复原链接。

版本号由用户于 2026-10-09 确认。功能已实现并通过本地整体验证；尚未提交 Git、部署生产、执行共享数据库迁移或发送真实通知。

- [需求与设计](design.md)：范围、状态、接口、安全与会员权益边界。
- [实施计划](implementation-plan.md)：任务分工及行为验收。
- [实现说明](implementation.md)：发布、审核、隔离、整改、接口及兼容逻辑。
- [审核规则与预算](content-risk-policy.md)：何时调用 AI、风险判定、权益与资源边界。
- [后台任务细节](backend-review.md)、[隔离与渠道撤销](backend-isolation.md)、[前端及客户端交互](frontend.md)。
- [实现与验证](verification.md)：实际完成情况、测试证据与限制。
- [配置、上线与回滚](release.md)：配置差异、迁移顺序及发布清单。
- [SQL 交付说明](sql/README.md)：Flyway 迁移正文引用与只读验收 SQL；不维护重复的迁移正文。

所有状态以验证记录为准；本地测试通过不代表生产已生效。
