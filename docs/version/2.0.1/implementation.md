# 2.0.1 实现说明

## 普通发布

HTTP 上传沿用额度、格式、权限、密码与 ZIP 安全校验，创建部署并入既有异步队列。Worker 准备规范化制品，在渠道创建事务中先登记 `PENDING` 审核和私有不可变快照，再创建渠道并激活 `READY`。普通发布不等待 AI，`READY` 详情已有独立审核状态，避免前端漏掉后台任务。

规范化、文件存储和渠道部署仍需时间；此改造移除的是普通发布对模型服务的等待。已有确认危险的完整制品 hash 继续在渠道创建前拦截。旧版中断且仍可恢复的前置审核任务继续原轮次；未持久化远端 ID 的不明确 Vercel 创建不被当作普通新任务重复创建。

## 后台审核与自动恢复

独立调度读取 PostgreSQL 中绑定新快照的 `READY/SUPERSEDED` 任务，先持久化租约和 `runId`，再读取、扫描和调用模型。共享内存许可只覆盖大制品准备/读取/扫描；后台模型等待不持有许可或项目锁。二进制数据流式校验完整 hash，只有 HTML/脚本/SVG 进入现有 Scanner。

技术异常沿既有有限轮次与退避重试。最终 `UNKNOWN` 保持已上线部署状态，不伪造 `PASS`，也不发送违规邮件；提交后产生固定 `ERROR` 业务信号供现有巡检捕获。过期、归档、永久封禁、删除及被取消的部署不继续执行审核或恢复公开。领取和结果提交都再次检查有效期。

结果与输入快照一一绑定；终态后经过短暂排障窗口删除私有字节，保留模式标识及审核元数据。中断临时文件、孤儿快照按安全年龄有限批次清理，不删除仍被数据库引用的任务输入。

## 确认风险后的处置

结果事务把确认危险版本和同项目相同 hash 的公开副本标为 `BLOCKED/CONTENT_RISK_HIGH`，保留原 `readyAt`。只有危险内容仍为 latest 时写项目隔离标记；不同内容的新版本不被旧结论误封。项目保持 `ACTIVE`，可以整改；管理员永久 Abuse 封禁保持原语义。

同时原子登记不可变渠道目标的撤销任务和整改通知。所有共享域名沿同一项目访问门禁；每实例原有五秒访问缓存和提交后失效机制保留。Vercel 直链由独立持久任务严格删除，自托管确认目录不存在；权限、I/O 和供应商异常保留重试。项目删除后任务仍存在，迟到撤销不删除已指向新版本的 current。

安全邮件沿用 outbox、去重、租约和供应商幂等键，描述实际隔离/撤销状态，不宣称所有渠道立即删除完成。领取时再次核对原部署、收件人和有效期；整改已通过或通知已过期则作废。游客无收件人，不承诺邮件送达。

## 整改与用户交互

登录用户在原项目上传整改；游客可附原 `claimToken` 重新上传到隔离中的同一项目。游客有效期、slug 和认领凭据保留，不借整改延长托管期或创建新项目。整改必须先通过现有审核才创建公开渠道；激活事务再次检查 `PASS`、实际 hash、所有权、项目状态和执行权，再清除隔离并恢复原链接。

发布按钮在 `QUEUED/BUILDING` 保持 loading、避免重复提交；`READY` 即结束发布等待。详情页最多额外轮询两分钟后台审核，超时可手动刷新，任务不依赖页面存活。下架后所有打开/复制入口按服务端 `urlStatus` 禁用，展示原因和整改路径。八语言 Console、游客、内嵌上传及 CLI/MCP/扩展均区分“已部署”和“审核完成”。

## 接口与权益

- 内容审核新增 `PENDING`，继续复用 `CHECKING/RETRYING/COMPLETED` 和 `PASS/HOLD/UNKNOWN`。
- Console、游客、插件部署详情与列表提供 `urlStatus`；项目提供 `contentRestricted`。旧接口缺字段时，客户端保守兼容原部署状态。
- 游客上传原接口增加可选 `claimToken`，只接受未过期、未认领、可整改隔离项目的有效凭据。
- 回滚、订阅恢复、游客认领和访问配置使用同一隔离边界；修改访问配置取得项目锁，避免覆盖并发隔离标记。
- Showcase、标签聚合、公开项目页和索引投影只接纳新流程已 `COMPLETED/PASS` 的当前版本；历史无快照标识记录保持兼容。
- 既有项目数、日/月部署次数、上传额度、并发构建、保留版本及托管期未修改；后台审核/撤销不另扣业务额度。已上线后下架不套用构建失败退款。

核心实现：[DeploymentWorker](../../../backend/src/main/java/com/previewship/worker/DeploymentWorker.java)、[ActivePreviewService](../../../backend/src/main/java/com/previewship/service/ActivePreviewService.java)、[ContentRiskService](../../../backend/src/main/java/com/previewship/service/ContentRiskService.java)、[ContentIsolationService](../../../backend/src/main/java/com/previewship/service/ContentIsolationService.java)。
