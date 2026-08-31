# Fidelity ledger

本批重绘只继承当前文章、`2026-08-26-local` 直接 evidence、以及 `speedtest-go@59cff12` 的事实关系；旧 SVG 的颜色、布局、源码路径和宣传性文案不作为事实源。

## `librespeed-go-contract-worker-lifecycle-script.svg`

- 类型/主关系：Sequence；Main thread → Web Worker → Go server 的默认 `IP_D_U` 端点交互，以及 `telemetry_level` 分支后的 `state=4` 完成信号。
- 保留：`start`、`getIP`、download `/garbage.php`、upload `/empty.php`、可选 telemetry、`status` 轮询、`testState=4`；把 `test_order` 和 `P` 默认未启用的边界放在标题说明中。
- 合并：旧图中的“状态机面板”和“端点面板”合并为一条按时间向下的消息序列；D/U 的多条流合并为各自一个代表性端点消息。
- 删除：旧图中的暗色代码块、点阵背景、卡片阴影、重复的宽泛阶段箭头，以及没有直接来源支撑的“主权计量”视觉结论。
- 未画入：所有 `time_auto`、grace time、ping/jitter 公式和 quirk 分支；它们属于文章正文，不是本图的生命周期主关系。

## `librespeed-go-telemetry-ulid-obfuscation.svg`

- 类型/主关系：Architecture；Worker FormData → `Record` → raw ULID / TelemetryData → 可逆 ID 变换 → public ID，再由 `ResolveID` 反向查找结果。
- 保留：ULID 记录、前 4 bytes 与 32-bit salt 的 XOR、16 bytes raw base64url、raw ULID 优先解析与 obfuscated ID 解码、`FetchByUUID`。
- 合并：生成 ID、记录字段和公开返回值收敛到 `Record`、`TelemetryData`、`ID transform`、`ResolveID` 四个机制节点；JSON/PNG 两个读取端合并为 `Result URL`。
- 删除：旧图中重复的阶段流水线、RFC 3550 抖动描述和“持久化”泛化口号；这些不是 ID 混淆的主关系。
- 明确边界：图内写明这是 reversible obfuscation / casual privacy，不是 cryptographic security、签名或授权令牌。

## `asymmetric-measurement-authority-flow.svg`

- 类型/主关系：Architecture；分别展示 download 的 server body → browser `xhr.onprogress` 与 upload 的 browser `xhr.upload.onprogress` → server `io.Copy(Discard)`，并汇总到 Worker 的 `dl/ul` 字段。
- 保留：下行客户端累计 `event.loaded`、上行客户端累计 `event.loaded`、Go `garbage` 的 `w.Write(randomData)`、Go `empty` 的 `io.Copy(ioutil.Discard, r.Body)`、`200 OK` 与 Worker 结果字段之间的语义区别。
- 合并：每个方向的多流、重启、计时和换算收敛为一个“方向观测”节点；两种方向共用一条 `Worker result` 汇总节点。
- 删除：旧图中的“致命假象”、`10Gbps` 虚构示例、服务端“真实物理带宽/唯一权威”口号和暗色代码块。
- 明确边界：`200 OK` 只表示 handler 完成响应；当前 Go handler 没有把服务端读到的字节数回传或与客户端 `ulStatus` 对账。本图不把局部观察写成安全保证、反刷保证或生产 SLO。
