# Token 的吊销税：Session / JWT / JWT+Introspection 三路对比

同一个 `/api/profile`，用三种鉴权方式各实现一遍，对比两件事：

1. **验证路径的本地延迟量级**：Map 查一次 vs 本地 RSA 验签 vs 进程内 introspection。
2. **「踢人」的生效语义**：Session 删记录立即生效；裸 JWT 本地验签不查黑名单，只能等 TTL；JWT+Introspection 把裁决权交给端点，jti 上黑名单立即生效。

## 运行

仓库根目录，零依赖（只用 Node 内置 `crypto`/`http`）：

```bash
# 压测 + 踢人演示
node experiments/auth-ledger/server.js

# 起真实 HTTP 服务，另开终端用 curl 打
node experiments/auth-ledger/server.js --server
curl -s localhost:8787/api/tokens        # 拿到三种 token
curl -s localhost:8787/api/profile -H "Authorization: Bearer <token>"
```

## 一次运行输出（2026-08-16，macOS，Node v24.19.0）

```
== 验证路径延迟（本地单进程，单次运行，非稳定分界线）==
行数    均值       p50      p99      说明
200000  0.07µs    0.08µs   0.13µs   Map 查一次
200000  19.14µs   18.00µs  28.58µs  本地 RSA 验签，无状态
200000  19.21µs   18.08µs  30.46µs  进程内 introspection（真实网络版另加一次 RTT）

== 踢人演示 ==
session               踢前  200 OK
session               踢后  401 拒绝
jwt                   踢前  200 OK
jwt                   踢后(仍有效)  200 OK
jwt+introspection     踢前  200 OK
jwt+introspection     踢后  401 拒绝
```

## 边界（别把原型当结论）

- **这是本地单次运行的量级，不是稳定分界线。** p50 是稳定量级（Map 亚微秒，RSA 验签约 20µs），但 p99 在同量级内抖动（28.6 vs 30.5µs 属于噪声，不能当作「introspection 比 JWT 慢」的证据）。真实差异来自网络：线上 introspection 每请求多一次 RTT，局域网约 0.1ms，跨城/跨洋 10–100ms 量级（量级，非实测）。
- **introspection 用进程内函数模拟。** 它只证明「API 不再本地验签、每请求多一次端点调用」这条路径的 CPU 开销，不包含网络延迟、端点自身负载或缓存命中率。
- **denylist 是内存 Map，重启即失**；没有过期扫描，只演示语义。生产还需要持久化、TTL 清理、Redis/数据库与端点高可用。
- 压测与「踢人演示」每次都重新生成 RSA 密钥，输出中不包含密钥材料。
- `alg=none` / RS256→HS256 算法混淆由 `verifyJwt` 里「只接受 RS256」显式拦截，代码即注释。

## 文章对应

正文见 `content/posts/jwt-session-oauth2-revocation.md`（draft）。正文中的压测数字与本节输出一致；「本机实测待补」指更换机器/加 `--server` 网络压测后的回填。
