---
title: "接口手册：LibreSpeed Go 全部 12 条路由的请求与响应规格"
description: "源码行纪第五篇：把 web.go 的路由表逐条写成规格书——每个端点的方法、参数、请求体、响应头、错误码与实测样例；附一次完整会话的 curl 序列（getIP→garbage→empty→telemetry→results/json→PNG→stats 登录流）。"
publishedAt: "2026-08-26"
tags: ["Go", "测速", "源码阅读", "API"]
draft: false
featured: false
series: "LibreSpeed Go 源码行纪"
---

**TL;DR：** 这篇是系列的**接口规格书**：`web.go:66-96` 挂载的全部路由，逐条给出方法、路径变体、参数、请求体、响应与错误码——每条都有本机实测输出背书（完整会话存档 `evidence/librespeed-go-series/2026-08-26-local/evidence_session.log`）。三个此前没写透的点：`/results/json` 的数字格式化是**三档精度**（<10 保留两位、<100 一位、≥100 取整，注释明言 matching PHP）；`/stats` 的登录态用 gorilla session cookie 承载且**密钥每次重启随机生成**（重启即全员下线）；默认密码哨兵值 `"PASSWORD"` 的含义是"未配置"而非弱密码。

## 一、总表：一套逻辑 × 三种路径形态

所有功能端点都挂三份：现代路径、`/backend/*` 前缀、`.php` 后缀。下表只列现代路径，其余两条等价（`web.go:67-96`）：

| 路由 | 方法 | 功能 | 上游消费者 |
| --- | --- | --- | --- |
| `/*` | GET | 静态页面（embed 资产或外部目录） | 浏览器 |
| `/empty` | GET/POST/HEAD | 延迟基线 + 上行黑洞 | Worker |
| `/garbage` | GET | 下行载荷（随机字节） | Worker |
| `/getIP` | GET | 客户端 IP/ISP/距离 JSON | Worker |
| `/results/telemetry` | POST | 结果上报，返回 ULID | Worker |
| `/results?id=<id>` | GET | 结果 PNG 卡片 | 用户分享页 |
| `/results/json?id=<id>` | GET | 结果 JSON API | 第三方集成 |
| `/stats` | GET/POST | 密码门统计台（HTML） | 管理员 |

全局中间件按序生效：RealIP → GetHead → CORS(全开) → NoCache → Recoverer。

## 二、测量面三端点

### 2.1 GET /garbage —— 下行载荷

| 项 | 规格 |
| --- | --- |
| 参数 | `ckSize`（整数 MiB 数；缺省 4；>1024 钳到 1024） |
| 响应头 | `application/octet-stream` + `Content-Disposition: attachment; filename=random.dat` |
| 响应体 | chunks × 1 MiB 启动期预生成随机字节循环写出 |
| 错误 | 客户端断开即停止写循环（不报错） |

实测：默认 **4,194,304 B**；`ckSize=1` 恰 1,048,576 B；`ckSize=99999` 恰 1,073,741,824 B。

### 2.2 ANY /empty —— 延迟基线 + 上行汇

| 项 | 规格 |
| --- | --- |
| 行为 | 读入整个 body 写进 `ioutil.Discard`；回 `Connection: keep-alive` + 200 |
| 用途 A | 小 GET 计往返延迟（Worker 默认打 10 次，取最小值） |
| 用途 B | 大 POST 作上行汇（实测 10 MB 进出无状态副作用） |
| 参数 | `?cors=true` 触发 PHP 口径的 per-request CORS 头 |

### 2.3 GET /getIP —— 身份与距离

| 项 | 规格 |
| --- | --- |
| 参数 | `isp=true` 附带 ISP 归属；`distance=km\|mi\|NM` 选距离单位；`r=` 防缓存 |
| IP 还原 | 五级链：CF-Connecting-IPv6 → Client-IP → X-Real-IP → XFF 首段 → RemoteAddr（03 篇） |
| 私网短路 | 命中 localhost/私网/link-local/CGNAT/ULA 时直接返回描述，不查外部库 |
| 外呼 | `isp=true` 且公网时调 ipinfo.io（失败落 MaxMind mmdb） |

响应体（回环实测）：`{"processedString":"127.0.0.1 - localhost IPv4 access","rawIspInfo":{…}}`

## 三、结果面三端点：上报 → 三种读法

### 3.1 POST /results/telemetry —— 上报

请求体为 form 字段：`dl / ul / ping / jitter / ispinfo(JSON字符串) / log / extra`。服务端另取 `RemoteAddr`、User-Agent、Accept-Language 入库。实测返回：

```text
id 01M0XHTRFPBT37WCW3KTS49H9H
```

ULID 由时间戳 + 单调熵生成；开启 ID 混淆时返回混淆后的形式。`database_type=none` 时此端点直接回答纯文本 `Telemetry is disabled`。隐私开关 `redact_ip_addresses=true` 会用三组正则把 IPv4/IPv6/hostname 从 ispinfo 与 log 里替换成占位符。

### 3.2 GET /results/json?id=<id> —— JSON API

实测一次完整往返：

```text
请求:  ?id=01M0XHTRFPBT37WCW3KTS49H9H
响应:  {"timestamp":"2026-08-26 06:49:36","download":"938",
        "upload":"104","ping":"2.84","jitter":"1.05","ispinfo":"China Unicom, CN"}
```

注意两个隐藏合同：

1. **数字格式化是三档精度的展示层行为**（`json.go:14-25`）：输入我上报的是 `938.4`，返回 `"938"`——因为 ≥100 只保留整数位；`2.8412` 返回 `"2.84"`（<10 两位小数）。注释明言 matching PHP。**拿这个 API 做数据分析的人要知道：它给的是显示值不是原始值**；
2. **ispinfo 不是原样回传**，而是从 processedString 里抽取 ISP 名（剥掉 IP 前缀与括号里的距离）。

错误码：缺 `id` → 400 + `{"error":"missing id parameter"}`；查不到 → 404 + `{"error":"result not found"}`。混淆 ID 在此统一 `ResolveID` 解码，调用方无需关心是否开启混淆。

### 3.3 GET /results?id=<id> —— PNG 结果卡

500×286 画布、内嵌 Noto Sans 字体、freetype 绘制，含 LibreSpeed 水印与时间戳。实测返回 `200, 19,659 B, image/png`。这是"结果分享"功能的全部实现——没有前端截图，服务端就是渲染器。

## 四、管理面：/stats 的会话合同

`stats.go` 的认证流程比表面复杂，逐条列出（全部实测）：

| 场景 | 请求 | 响应 |
| --- | --- | --- |
| 未配置密码（哨兵值 `"PASSWORD"`） | 任意访问 | 200 + 页面提示 "Please set statistics_password"（**等于功能关闭**） |
| 已配置 + 未登录 | 访问 | 200 + 登录表单 |
| 错密码 | `POST ?op=login&password=wrong` | **403**（实测） |
| 对密码 | 同上，password 正确 | **307 重定向** 回 /stats + Set-Cookie `logged`（HttpOnly、SameSite=Strict、Path 限 /stats、MaxAge 1h） |
| 已登录 | `GET ?id=L100` | 最近 100 条记录的 HTML 表格（实测含上报的 ISP 名与速率） |
| 已登录 | `GET ?id=<uuid>` | 单条记录视图 |
| 登出 | `?op=logout` | 清 cookie + 307 |

两个安全相关的观察：会话密钥由 `securecookie.GenerateRandomKey(32)` 在**进程 init 时生成**——重启服务即全员下线，也意味着多实例部署必须换成共享密钥；密码比较是普通 `==` 而非常数时间比较（自托管场景可接受，但值得知道）。

## 五、一次完整会话的 curl 序列

以下十步在 evidence_session.log 中有完整原始输出，可以直接照抄复现：

```sh
BASE=http://127.0.0.1:8915
# T0 身份
curl -s $BASE/getIP
# T1 下行 1MiB
curl -s "$BASE/garbage?ckSize=1" -o /dev/null -w '%{http_code} %{size_download}B\n'
# T2 上行 1MiB
curl -s --data-binary @u.bin -o /dev/null -w '%{http_code}\n' $BASE/backend/empty
# T3 上报
ID=$(curl -s -X POST $BASE/results/telemetry \
     --data-urlencode 'dl=938.4' --data-urlencode 'ul=103.9' \
     --data-urlencode 'ping=2.8412' --data-urlencode 'jitter=1.05' \
     --data-urlencode 'ispinfo={"processedString":"1.2.3.4 - China Unicom, CN (30 km)"}')
# T4 读回 JSON（观察三档精度）
curl -s "$BASE/results/json?id=${ID#id }"
# T7 结果卡
curl -s "$BASE/results?id=${ID#id }" -o card.png
# T9-T10 登录后台看最近百条
curl -s -c cj.txt -X POST "$BASE/stats?op=login" --data-urlencode 'password=secret123'
curl -s -b cj.txt "$BASE/stats?id=L100"
```

## 六、结论：接口手册怎么用

1. **要接自己的客户端**：只需要四个端点——getIP、garbage、empty、telemetry，字段见 §2–§3；
2. **要做结果分享/归档**：results/json 是机器接口，但记住它是三档精度的**展示口径**；要原始精度就直接读数据库后端；
3. **要开放公网自托管**：先改 statistics_password（否则统计台裸奔提示语）、评估 CORS 全开的影响、并意识到 garbage 的 1 GiB 钳制是你唯一的带宽保险丝。

下一篇收尾配置与部署面：viper 默认值的陷阱、TLS/HTTP2 组合矩阵、proxy protocol 监听。

## 参考资料

- 项目仓库 @ commit `59cff12`；完整会话原始输出：`evidence/librespeed-go-series/2026-08-26-local/evidence_session.log`
- 关键文件：`web/web.go`（路由装配）、`results/json.go`、`results/stats.go`
- 站内相关：[一份测速合同的全文](/writing/librespeed-go-04-contract)、[garbage、empty 与被钳制的 1 GiB](/writing/librespeed-go-02-endpoints)
