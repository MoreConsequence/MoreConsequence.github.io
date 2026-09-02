---
title: "一个测速点的最小闭环：从 main.go 到三个测量端点"
description: "把 LibreSpeed Go 的服务端骨架、garbage/empty/getIP 三个测量端点和结果写入路径放进一条因果链，解释一个单二进制测速点真正负责什么。"
publishedAt: "2026-08-26"
updatedAt: "2026-08-31"
tags: ["Go", "测速", "源码阅读", "架构"]
draft: false
featured: false
series: "LibreSpeed Go 源码行纪"
---

**TL;DR：** LibreSpeed Go 的核心不是一个“计算速度”的函数，而是一条很短的服务链：`main.go` 读取配置并装配 `web`、`results`、`database`，HTTP 层再把请求分给三个测量原语——`garbage` 发随机字节、`empty` 接收并丢弃请求体、`getIP` 解释请求来源。客户端负责计量，服务端负责提供可重复的字节路径和结果接口；本文的数字来自 `59cff12` 的 Darwin/arm64 loopback 取证，不代表公网容量或生产部署能力。

## 一、先看请求如何穿过这个服务

这个项目在指定 commit 上只有 21 个 Go 文件、2,371 行。数字本身不是结论，重要的是它把职责压在四个边界内：启动装配、HTTP 测量、结果处理、可替换存储。一次典型请求可以这样追：

```text
config.Load
  → web.ListenAndServe
  → chi 路由
  → garbage / empty / getIP
  → （需要保存结果时）results.Record
  → database.DB
```

![LibreSpeed Go 单二进制架构：main.go 连接 config、web、results 与 database 的职责路径](../../../public/images/librespeed-go-architecture-overview-pipeline.svg)

图里的“单二进制”只说明发布形态：默认 assets 可以嵌入，服务仍然可以选择外部配置和数据库。它没有目录调度，也没有把多个测速节点组织成一个全球控制面；客户端连到哪个实例，测量就发生在哪个实例。

## 二、`main.go` 只装配，不替客户端计量

入口代码很短：

```go
func main() {
	flag.Parse()
	conf := config.Load(*optConfig)
	web.SetServerLocation(&conf)
	results.Initialize(&conf)
	database.SetDBInfo(&conf)
	log.Fatal(web.ListenAndServe(&conf))
}
```

顺序表达的是依赖关系，而不是形式上的初始化清单：

| 步骤 | 作用 | 后续使用者 |
| --- | --- | --- |
| `config.Load` | 读取配置文件、环境变量和默认值 | 所有模块 |
| `SetServerLocation` | 准备距离计算所需的服务端坐标 | `getIP` |
| `results.Initialize` | 准备结果卡片绘制所需的资源 | 结果接口 |
| `SetDBInfo` | 根据 `database_type` 选择存储实现 | `Record` |
| `ListenAndServe` | 装配中间件和路由并开始监听 | HTTP 请求 |

因此，读这个入口时不应该寻找“测速算法”。真正的计量循环在内嵌的浏览器 Worker；Go 进程提供的是稳定的 HTTP 输入、输出和存储边界。

## 三、三个端点各回答一个测量问题

三个端点的共同点是：服务端不替客户端把结果算出来，而是尽量不要改变被测路径。

![三个测速端点：garbage 下行载荷、empty 上行接收与 getIP 身份查询](../../../public/images/librespeed-go-endpoints-garbage-empty-backend.svg)

| 端点 | 客户端测量什么 | 服务端实际做什么 | 关键边界 |
| --- | --- | --- | --- |
| `GET /garbage` | 收到多少下行字节 | 循环写出启动时生成的随机数据 | 默认 4 chunks；`ckSize > 1024` 时钳到 1024 |
| `GET/POST /empty` | 小请求的 RTT，或已经发出的上行字节 | 把 body 读到 `ioutil.Discard`，返回 200 | 不保存 body，也不替客户端计算上行速率 |
| `GET /getIP` | 得到可展示的来源、ISP 和距离 | 读取候选地址、分类特殊地址，必要时查询 GeoIP | 代理头是展示输入，不是访问控制凭据 |

`garbage` 的包级 `randomData` 用 `crypto/rand` 生成 1 MiB，进程启动时完成；请求路径只重复写这块数据。随机内容减少缓存和压缩改变测量的机会，预生成则把随机数生成成本移出请求路径。`ckSize=1` 的 loopback 取证返回 1,048,576 字节，默认返回 4,194,304 字节，超大请求被限制为 1 GiB；客户端断开时写循环在错误处停止。

`empty` 的代码更接近测量夹具：

```go
func empty(w http.ResponseWriter, r *http.Request) {
	if _, err := io.Copy(ioutil.Discard, r.Body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	_ = r.Body.Close()
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
}
```

小 GET 和大 POST 共用这个 Handler。前者让 Worker 反复测 RTT，后者让 Worker 观察上传进度；`Discard` 的存在正是为了不把磁盘或数据库写入时间混入测量。

## 四、结果路径是另一条边界

测速完成后，Worker 才把 `dl`、`ul`、`ping`、`jitter`、`ispinfo` 和可选日志提交给 `/results/telemetry`。`results.Record` 生成 ID 并调用窄接口 `database.DataAccess`；之后 JSON、PNG 和 `/stats` 只是不同的读取面。

```text
POST /results/telemetry
  → Record
  → ULID
  → database.DB.Insert
  → id <result-id>
```

`database_type=none` 时，写入直接关闭；`memory` 适合本机取证，但不能当作持久化。把结果处理和字节端点分开，意味着数据库变慢不会改变 `garbage` 和 `empty` 的基本职责，但会影响“测完后能不能读回结果”。

## 五、这个小服务真正保证什么

它保证的是一组清晰的 HTTP 行为：下行有随机载荷和服务端上限，上行有只读不存的接收汇，身份查询有固定的候选和分类路径，结果有写入与读取接口。它不保证公网吞吐、跨地域延迟、多实例一致性或生产容量；这些问题不在当前 loopback 证据覆盖范围内。

读源码时可以先问一句：这一层是在装配、提供字节、解释身份，还是保存结果？如果一个新需求无法落进其中一个边界，就不应该只在 `main.go` 里继续堆初始化调用。

## 参考资料

- [librespeed/speedtest-go](https://github.com/librespeed/speedtest-go)，commit `59cff12`
- 本机取证：`evidence/librespeed-go-series/2026-08-26-local/`
- 系列后续：[身份、隐私与存储](/writing/librespeed-go-03-client-ip)、[Worker 合同与计量算法](/writing/librespeed-go-04-contract)、[接口兼容与部署边界](/writing/librespeed-go-05-interface)
- 理论背景：[你的带宽是怎么被算出来的](/writing/speedtest-service-architecture)
