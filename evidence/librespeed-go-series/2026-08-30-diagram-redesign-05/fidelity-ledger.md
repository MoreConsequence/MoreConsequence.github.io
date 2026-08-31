# Fidelity ledger — task 05

## 路由接口

- 细节：`balanced`；原图是带标题的伪矩阵，正文现在承载精确规格表。
- 删除：旧 SVG 整张删除；旧图只显示 7 行且把 `.php` 路径、缓存、JSON/CSV 和未核对状态码混在一起。
- 保留在正文：12 个现代/`/backend/` 核心 API 挂载、每组 handler 的方法语义、参数/请求体、响应和错误行为；额外说明 12 个 `.php` 兼容挂载、静态 `/*` 和 4 个 PNG 路径变体。
- 不绘制：路由到 handler 的重复收敛线、29 条实际注册语句的逐条拓扑；它们在源码定位中有价值，但表格更可查。

## `/stats` 状态机

- 细节：`balanced`；5 个主要状态，加入口点和两个终止标记。
- 保留：`database_type=none`、`statistics_password="PASSWORD"`、未认证登录页、错误密码 403、成功登录 307 + `logged` Cookie、认证后的 HTML 读取、登出删除 Cookie、`GenerateRandomKey(32)` 在进程初始化时导致重启失效。
- 合并：`L100` 与单条 UUID 查询合并为认证态的“读取结果”转移；它们仍在正文表格中分别说明。
- 删除：旧图的 Basic Auth 对照、bcrypt、撞库/防爆破/15 分钟锁定、金融级安全、跨节点管理和其他源码没有支持的安全断言。

## curl Sequence

- 细节：`balanced`；文章代码有 8 次 curl 调用，图中合并为 6 个时间阶段以保持 Sequence 的 12 条箭头上限。
- 合并：`T1 garbage` + `T2 empty` → `MEASURE` 阶段；`T4 results/json` + `T7 results PNG` → `RESULTS` 阶段。
- 保留：阶段顺序、请求方向、关键路径/参数的阶段标签、服务端响应类别、遥测返回 ID 被后续结果读取复用、stats 登录后带 Cookie 读取 `L100`。
- 删除：旧图中的 localhost:8989 与代码不一致样例、纳秒级/极限/精确吞吐口号、服务端统计回传上行 Mbps 的虚构响应、未由源代码支持的“命令级确定性”结论。
