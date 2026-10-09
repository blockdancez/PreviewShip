# 审核规则、模型调用与会员权益

本版本改变普通发布与审核的先后顺序，继续复用已有静态规则、模型输入规划、证据校验和风险判定。规则分值不是恶意概率，也不是 Google/Cloudflare 的内部判定分数。

## 何时调用 AI

普通发布成功后，后台扫描 HTML/脚本/SVG；只有出现敏感候选才调用 OpenRouter。无候选且扫描完整的文件可由本地规则判定 `PASS`。孤立密码框、品牌文字、压缩脚本、base64 或外部 CDN 不能直接判恶意。

已隔离项目整改仍在渠道创建之前执行同一规则和必要的 AI 审核。相同内容已确认 `HOLD` 的制品继续前置拦截，不通过反复模型抽样变成安全。技术异常、无有效证据、输入预算不足为 `UNKNOWN`；普通在线版本继续可用，整改版本仍需通过才能恢复。

## 确认风险的条件

| 类别 | 规则权重 |
|---|---:|
| 品牌仿冒 | 35 |
| 敏感信息收集 | 25 |
| 可疑外传 | 25 |
| 误导跳转或下载 | 20 |
| 隐藏行为 | 25 |

模型证据须定位到实际送审文件、行号与引用，外传还需要真实提交行为支持。`MALICIOUS/HIGH`、至少三个类别和三处独立证据、包含外传/误导/隐藏行为且累计至少 75 分，才确认 `HOLD`。另保留已有可独立定位的敏感收集与机器人外传组合门槛；明确恶意威胁引用按现有规则阻断。`SUSPICIOUS` 且证据有效时给出中风险建议，分值封顶 74。

规则不执行上传 JavaScript，不做动态浏览器渲染、图片 OCR 或任意外链抓取；静态检测存在覆盖范围，不能宣称全部攻击都可识别。先发布后审有公开窗口；供应商技术异常期间没有保证最长窗口，未完成审核不会被静默标记为通过。

## 有界预算与权益

| 会员权益 | 免费版 | 月付专业版 | 年付专业版 |
|---|---:|---:|---:|
| ZIP 大小 | 15 MiB | 50 MiB | 80 MiB |
| 每月上传量 | 200 MiB | 2048 MiB | 4096 MiB |

这些值未修改。原始 ZIP 解压仍限制单文件 100 MiB、制品合计 128 MiB；规范化后审核文本单文件和累计上限 128 MiB，与既有制品保护边界一致。压缩体积、解压字节和模型输入是不同预算。

Scanner 复用原字节、稀疏页解码和行号，较大 HTML 使用最多 4 MiB 投影，节点上限 20,000。模型每批实际序列化输入默认 48,000 UTF-16 字符、40 个候选，整轮 30 秒、2,500 输出 token；整体放不下时仅证明独立的 HTML 可分组，最多三批、整轮最多四次供应商调用。任何关联组遗漏或放不下都为 `UNKNOWN`，不截取前缀后认定安全。

有限纠正/重试保留先前风险关切与分组结果，不让后续 `SAFE` 覆盖已有疑似风险。后台最终未完成单独记告警；原制品不会仅因模型格式错误要求普通用户重新上传。

`web-risk-enabled=false` 表示关闭可选 Google Web Risk 引用检查；本地规则和 OpenRouter 仍正常执行。仅在配置好对应官方服务时才启用，`NO_MATCH` 不会降低本地证据风险。

实现依据：[ContentRiskProperties](../../../backend/src/main/java/com/previewship/config/ContentRiskProperties.java)、[ContentRiskScanner](../../../backend/src/main/java/com/previewship/service/ContentRiskScanner.java)、[OpenRouterContentRiskClient](../../../backend/src/main/java/com/previewship/service/OpenRouterContentRiskClient.java)。
