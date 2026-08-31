# Source verification — task 05

核对日期：2026-08-30。

## 版本与路由注册

命令：

```sh
git -C /Users/lianghaoyu/codes/speedtest-go status --short --branch
git -C /Users/lianghaoyu/codes/speedtest-go rev-parse HEAD
git -C /Users/lianghaoyu/codes/speedtest-go show -s --format='%H%n%ad%n%s' --date=iso-strict 59cff12
```

结果：源码 checkout clean，HEAD 与目标提交均为 `59cff12d1b95b3f80acd8a42b0156aa4fde440de`，提交时间为 `2026-08-17T13:28:02+08:00`。

`web/web.go` 的注册事实：

- `web.go:66`：`GET conf.BaseURL+"/*"` 交给 `pages`，是静态资源 wildcard。
- `web.go:67-82`：现代路径与 `/backend/` 前缀的 12 个核心 API 挂载；`empty` 和 `stats` 使用 chi `HandleFunc`，其余使用 `Get`/`Post`。
- `web.go:73-76`：PNG 结果有 `/results`、`/results/`、`/backend/results`、`/backend/results/` 四个 GET 挂载。
- `web.go:85-96`：12 个 `.php` 兼容挂载，复用 `empty`、`garbage`、`getIP`、`Record`、`Stats` 和 `JSONResult`；PNG 没有 `.php` 注册。
- `middleware.GetHead`（依赖 `github.com/go-chi/chi/v5`）会把没有显式 HEAD handler 的 GET 路由转给 GET handler；图与正文将显式注册方法和这个全局 HEAD 兜底分开表达。

## Handler 行为

- `web/web.go:140-159`：`empty` 把 body 读入 `ioutil.Discard`，读取失败写 400；成功设置 `Connection: keep-alive` 并写 200；`cors=true` 触发 PHP 兼容头。
- `web/web.go:161-193`：`garbage` 默认写 4 个 1 MiB `randomData` 块；可解析 `ckSize`，大于 1024 时钳制到 1024；响应为二进制下载头。
- `web/web.go:195-237` 与 `web/getip_util.go:44-104`：`getIP` 先还原客户端 IP，再对私网/特殊地址直接返回描述；公网且 `isp=true` 时尝试 ipinfo，随后可回退 GeoIP；`distance` 的 `km` 和 `NM` 是显式分支，其余走英里分支。
- `web/web.go:35-52`：全局中间件顺序为 `RealIP → GetHead → CORS → NoCache → Recoverer`；因此 `r=` 不是 handler 自己的防缓存参数。
- `results/telemetry.go:147-213`：`Record` 读取 `dl`、`ul`、`ping`、`jitter`、`ispinfo`、`log`、`extra`，附加请求 IP、User-Agent 和语言，写入数据库后返回 `id <ULID>`；`database_type=none` 返回 `Telemetry is disabled`。
- `results/json.go:19-92`：`JSONResult` 缺少 `id` 返回 400，查询失败返回 404；成功返回展示精度的 JSON，并通过 `ResolveID` 接受原始或混淆 ID。
- `results/telemetry.go:215-378`：`DrawPNG` 解析记录并返回 `image/png`；数据库关闭时直接返回。
- `results/stats.go:23-107`：Cookie store 使用 init 时生成的 `securecookie.GenerateRandomKey(32)`；Cookie 名为 `logged`，属性为 `Path=BaseURL+/stats`、`MaxAge=3600`、`HttpOnly`、`SameSite=Strict`。密码比较是普通 `==`；错误密码写 403，正确密码保存认证态并 307 重定向；认证态的 `logout` 清 Cookie 并 307。
- `results/stats.go:163-193`：统计页是 HTML 模板；哨兵密码 `PASSWORD` 只显示“请设置密码”提示，认证态可读最近 100 条或单条 UUID。

## 既有本机 evidence

`evidence/librespeed-go-series/2026-08-26-local/` 记录的是 Darwin/arm64、127.0.0.1:8915、memory database 的本机运行：

- `evidence_session.log:2-20`：getIP、1 MiB garbage、empty sink、telemetry ID、JSON、PNG 的实际输出。
- `evidence_session.log:27-36`：密码门确认、错误密码 403、正确密码 307、认证态 `L100` 读取。
- `evidence_obf.log:2-11`：启用混淆时返回非标准 ULID 形态，JSON 端点可自动解码；IP 脱敏也有本机输出。
- `README.md` 明确限制：这些结果只覆盖 loopback，不覆盖 TLS/HTTP2/proxy protocol。

这些日志支持图中的本机响应类别，不被扩大为线上或生产证明。
