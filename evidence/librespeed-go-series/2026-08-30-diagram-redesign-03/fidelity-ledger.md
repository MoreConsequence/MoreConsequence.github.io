# Fidelity ledger

## 任务 03：客户端 IP、特殊地址与 ISP 回退

### `librespeed-go-client-ip-proxy-cgnat-lookup`

- Detail: `balanced`；旧图的四张彩色“优先级卡片”重排为一个端到端 Flowchart。
- Kept: `/getIP`、`getClientIP`、`classifyPrivateIP`、`isp=true` 条件、`getISPInfoByPriority`、特殊地址短路，以及 API / mmdb / empty 的后续关系。
- Merged: 五级候选的逐项细节折叠为 `getClientIP` 节点的技术副标签；逐项校验在第二张图展开。
- Corrected: `Unknown ISP` 与 `isp=false` 的 `clientIP` 分成同一“无 ISP enrichment”输出节点的两条明确语义，避免把两种展示结果错误合并。
- Dropped: 旧图中的 `True-Client-IP`、`isValidPublic`、手工 XFF 私网过滤、Cloudflare / Akamai “最高可信”、以及“真实源站回退”等未由当前 Go 源码保证的断言。

### `client-ip-five-level-proxy-chain`

- Detail: `balanced`；旧图的四段宽卡片重排为 Sequence。
- Kept: 当前源码明确写出的五级候选：`CF-Connecting-IPv6`、`Client-IP`、`X-Real-IP`、`X-Forwarded-For` 首段、`RemoteAddr`。
- Kept: `normalizeCandidateIP` 的两种校验模式：CF 候选用 `ipv6=true`，其余代理头用 `ipv6=false`；返回注明 `valid / empty → return / continue`。
- Merged: 2–4 号候选共用同一 `ipv6=false` 校验调用，避免复制三个相同的函数节点；顺序仍逐行保留。
- Dropped: CDN、Nginx、Traefik、Fastly 的臆定来源，`X-Forwarded-For` “清洗后取最公网 IP”、`100%` 可靠性和“最合法公共 IP”等源码外语义。

### `special-ip-subnet-classification-matrix`

- Detail: `balanced`；旧的三列“RFC 1918 / CGNAT / 全球可路由”卡片重构为 Flowchart + ordered table。
- Kept: `classifyPrivateIP` 的 `switch` 顺序、七组匹配条件、每组源码返回描述，以及未命中返回空串。
- Merged: `10.*`、`172.16–31.*`、`192.168.*` 三个分支合并为一行，因为它们在源码中都返回相同的 `private IPv4 access` 描述；匹配范围没有扩张。
- Kept: ULA 的 `ip[0]&0xFE == 0xFC` 与 CGNAT 的正则作为实现注记。
- Dropped: “全球可路由 IPv4 / IPv6”、ISP 查询、ASN 反查、haversine 示例和“输出精确距离”等不属于 `classifyPrivateIP` 本身的关系；这些并非本图要证明的事实。

## 统一视觉删减

- 删除旧图中的深色代码块、阴影、彩虹式卡片、点阵背景和装饰性副标题。
- 保留单一 coral 焦点；其余关系使用默认 ink / muted / link 语义色。
- 所有 off-axis connector 改为圆角正交路径；标签使用不透线的 paper mask，并与连接线留出可见间距。
