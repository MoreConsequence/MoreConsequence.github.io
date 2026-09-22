---
title: "百亿级分布式短链系统架构：Base62 发号器、碰撞容灾与 301/302 深度博弈"
description: "深度拆解百亿级分布式短 URL 系统的核心架构与工业级实现。从 RFC 3986 规范与 Base62 编码数学基石，到哈希碰撞容灾与基于分段发号器（Leaf 架构）的双射无碰撞推导，深入剖析 HTTP 301 与 302 重定向在数据埋点与服务器吞吐上的物理权衡，并给出多级缓存击穿、热 Key 倾斜与非对称数字混淆的完整解法。"
publishedAt: "2026-05-13"
tags: ["系统设计", "面试题", "短链系统", "分布式系统", "Base62", "高性能缓存"]
category: "面试深度拆解"
draft: false
featured: false
---

**TL;DR：** 许多工程师认为短链系统（URL Shortener，如 bit.ly 或 t.cn）不过是“哈希一下转 Base62 存数据库”的初级玩具，但在百亿级（$10^{10}$）长远规模与数十万读 QPS 的冲击下，它几乎浓缩了现代分布式系统所有的典型矛盾：**哈希碰撞导致的写时读放大、自增 ID 引发的商业数据泄露、HTTP 301 与 302 重定向在统计埋点与缓存穿透之间的博弈、以及热点短链引发的缓存击穿**。本文从 URI 字符集数学空间推导出 7 位 Base62 编码的最佳容量；对比哈希截断与分布式发号器的本质优劣；基于 Feistel 微型置换密码解决自增 ID 的伪随机离散化；最后剖析多级缓存与分库分表的生产级架构。

---

## 一、系统容量精算与核心设计边界

### 1.1 业务模型与规模假设

- **数据总量**：规划支撑 **100 亿（$10^{10}$）** 条短链，生命周期按 5 年保留。
- **读写比例（Read-to-Write Ratio）**：短链是典型的**极端读多写少**场景。一条营销短信或推特发布的短链，会被成千上万次点击，读写比通常在 **$100 : 1$ 至 $1000 : 1$** 之间。
- **写入吞吐量（Write QPS）**：
  $$\text{Average Write QPS} = \frac{10^{10}}{5 \times 365 \times 86400 \text{ s}} \approx 63.4 \text{ writes/sec}$$
  按 10 倍峰值冗余设计：
  $$\text{Peak Write QPS} \approx 1,000 \text{ writes/sec}$$
- **读取吞吐量（Read QPS，重定向请求）**：
  $$\text{Average Read QPS} = 63.4 \times 100 \approx 6,340 \text{ reads/sec}$$
  峰值读取流量按 15 倍预估（面对突发热点营销推送）：
  $$\text{Peak Read QPS} \approx 100,000 \text{ reads/sec}$$
- **延迟 SLA**：重定向 302 响应的 P99 延迟必须控制在 **$10\text{ ms}$ 以内**。

### 1.2 存储容量精算
一条短链映射记录的核心数据结构包含：
- `short_code`：定长 7 字节字符串；
- `long_url`：平均 100 字节（含长 Query 追踪参数）；
- `created_at`：8 字节时间戳；
- `expired_at`：8 字节时间戳；
- `user_id`：8 字节所有者 ID。

加上数据库行头与 B+ 树索引开销，单行数据按 $200\text{ 字节}$ 估算：
$$\text{Storage Required} = 10^{10} \times 200 \text{ Bytes} = 2 \times 10^{12} \text{ Bytes} \approx \mathbf{2 \text{ TB}}$$
5 年累计 2TB 的存储量对单机磁盘而言并不算大，但由于读取 QPS 高达 100,000，核心瓶颈完全在于**内存缓存命中率、连接数吞吐以及高并发下的 I/O 穿透防护**。

---

## 二、RFC 3986 规范与 Base62 编码数学基石

短链的核心诉求是“尽可能短”，同时必须能够在 HTTP URL 路径中合法安全传输。

### 2.1 字符集选择：Base62 vs Base64
根据 IETF RFC 3986 规范（Uniform Resource Identifier），URL 的路径（Path）部分允许保留字符与非保留字符：
- 如果使用 Base64，包含字符 `0-9`、`a-z`、`A-Z`、`+` 和 `/`。
  - 字符 `/` 是 URL 路径的天然层级分隔符，如果出现在短链短码中，会导致 Web 服务器路由解析错误；
  - 字符 `+` 在 URL Query 参数解析时常被错误转义为空格；
  - 必须进行 URL-Safe 转义（如改用 `-` 和 `_`），增加了客户端与服务端的兼容性负担。
- **Base62 字符集**：仅包含 `0-9`（10 个数字）、`a-z`（26 个小写字母）、`A-Z`（26 个大写字母），共计 **62 个安全字符**：
  $$\Sigma = \{ 0, \dots, 9, a, \dots, z, A, \dots, Z \}$$
  这 62 个字符在任何浏览器、邮件客户端、短信网关以及命令行工具中均可无歧义原生解析。

### 2.2 编码长度的排列组合证明
若短码长度为 $L$，则 Base62 能表达的唯一短链空间为 $62^L$：

| 字符长度 $L$ | 可表达的最大唯一 URL 总量 $62^L$ | 评价与容量冗余 |
| :--- | :--- | :--- |
| $L = 5$ | $62^5 = 916,132,832 \approx 9.16 \text{ 亿}$ | 无法满足百亿级规模 |
| $L = 6$ | $62^6 = 56,800,235,584 \approx 568 \text{ 亿}$ | 能够满足百亿规模（冗余 5.6 倍） |
| **$L = 7$** | **$62^7 = 3,521,614,606,208 \approx 3.52 \text{ 万亿}$** | **工业级标准（冗余 350 倍，抗长期碰撞）** |
| $L = 8$ | $62^8 \approx 2.18 \times 10^{14}$ | 过长，丧失短链精简优势 |

**结论**：选用 **7 位 Base62 编码** 是现代系统设计的黄金分割点。不仅能在长达数十年内提供高达 3.5 万亿的容量空间，而且能维持极佳的视觉紧凑性（例如 `https://t.cn/aB9xK1z`）。

---

## 三、方案选型：哈希截断 vs 分布式发号器

如何将一个长 URL 转换为唯一的 7 位 Base62 字符串？业界存在两条根本不同的设计路线。

```
[ Long URL: https://example.com/item/12345?ref=promo ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
【方案 A：哈希截断 + 碰撞重试】    【方案 B：分布式发号器 + 双射编码】
Hash(URL) -> 64-bit Hash           Distributed ID Generator (Segment)
        │                                 │
        ▼                                 ▼
Base62 Encode -> 7 chars           64-bit Auto-Inc ID (e.g., 100000001)
        │                                 │
        ▼                                 ▼
DB 唯一索引碰撞冲突？               Feistel 对称置换混淆 (防数据泄露)
├── 否：成功写入                    │
└── 是：加盐重新哈希并重试          ▼
                                   Base62 绝对双射无碰撞转换 (数学零冲突)
```

### 3.1 方案 A：哈希截断（Hash-and-Retry）的物理缺陷

该方案对长 URL 计算哈希（如 MurmurHash3 或 MD5 截断 43 位），再编码为 7 位 Base62。
- **碰撞壁垒（Birthday Paradox）**：根据生日悖论，当数据量达到百亿级时，哈希截断发生碰撞的概率显著攀升。
- **致命缺陷：写时读放大**：
  每次生成短链时，必须执行：
  ```sql
  SELECT long_url FROM url_mapping WHERE short_code = ?;
  ```
  如果发现已被占用且 `long_url` 不同，必须在长 URL 后面加盐（Salt）重新哈希、重试校验。
  这导致**每次写操作都捆绑了多次昂贵的数据查询与锁竞争**，在大促营销短信批量生成时，写入延迟急剧恶化。

### 3.2 方案 B：分布式发号器（ID Generator）+ 纯双射编码

#### 核心数学不变式：
**如果能够高效生成一个全局唯一的 64 位自增正整数 $ID$，则该 $ID$ 与 7 位 Base62 字符串之间存在严格的单射与满射（双射 Bijective Mapping）！**

$$\text{Encode}: \mathbb{N} \to \Sigma^7, \quad \text{Decode}: \Sigma^7 \to \mathbb{N}$$

- 编码算法只需连续对 62 取模并除以 62（类似于十进制转二进制）；
- **零碰撞、零回表重试**：只要 $ID_1 \ne ID_2$，则必然 $\text{Encode}(ID_1) \ne \text{Encode}(ID_2)$。写入时只需在内存中拿到一个 ID，直接计算出短码并存盘，彻底消除写前碰撞检查！

#### 工业级发号器：分段式号段分配（Segment Buffer）
传统数据库 `AUTO_INCREMENT` 单点吞吐受限（通常只有几千 TPS）。美团开源的 Leaf-segment 架构给出了优雅解法：

```
[ Central Database / Leaf Allocator ]
Table: allocated_tags (biz_tag, max_id, step)
Update: UPDATE leaf_alloc SET max_id = max_id + 100000 WHERE tag = 'short_url';
                      │
                      ▼ 批量加载号段 [1000001, 1100000]
┌────────────────────────────────────────────────────────┐
│               Short URL Service Node Local Memory      │
│  [ Buffer 1 (Current Active): 1000001 ~ 1100000 ]       │
│  [ Buffer 2 (Pre-loaded Standby): 1100001 ~ 1200000 ]   │
│  * AtomicInteger.incrementAndGet() (纯内存纳秒级分配)   │
└────────────────────────────────────────────────────────┘
```

- 服务节点启动时向中央 DB 申请一个号段（如步长 `step = 100,000`）；
- 节点本地通过 `AtomicLong` 纯内存无锁递增分发；
- **双 Buffer 异步预加载**：当 Buffer 1 使用率超过 10% 时，后台独立线程异步向中央 DB 申请 Buffer 2。即便中央数据库宕机几十分钟，本地缓存的号段依然能够支撑数百万次短链生成！

---

## 四、安全防刺探：Feistel 微型对称密码置换

发号器方案引入了一个致命的**商业安全漏洞**：
如果采用连续自增 ID，生成的短链是按字典序单调递增的（如 `000000a` $\to$ `000000b` $\to$ `000000c`）。
- **后果一：全量爬取遍历**。黑客只需从 `0000000` 循环递增发请求，就可以在几小时内拖走全站所有的长 URL 数据；
- **后果二：商业机密泄露**。竞争对手在每天早上 8 点和晚上 8 点分别生成一个短链，将两个短链还原为数值相减，就能精确推算出平台全天的短链业务订单增量！

### 4.1 解决方案：轻量级 Feistel 可逆置换混淆

我们不能简单使用随机数（会破坏无碰撞性），而是需要一种**确定性的、一一对应的、密码学安全的可逆置换（Permutation）**：
输入一个 43 位的连续整数 $ID$，输出一个完全离散、随机分布的 43 位整数 $ID'$，且满足任意不同的 $ID$ 映射出的 $ID'$ 绝对互不相同。

```
Plain ID (43 bits) --> [ Feistel Cipher: 4 Rounds with Secret Key K ] --> Scrambled ID' (43 bits)
                                                                                  │
                                                                                  ▼
                                                                       Base62 Encode -> 7 chars
```

#### Feistel 变换算法原理：
1. 将 43 位整数拆分为高位 $L_0$（21 bits）与低位 $R_0$（22 bits）；
2. 经过 4 轮简单的非线性置换计算（采用固定密钥 $K$ 与轮函数 $F$）：
   $$L_{i+1} = R_i$$
   $$R_{i+1} = L_i \oplus F(R_i, K_i)$$
3. 最终组合出混淆后的整数 $ID'$。
- **数学属性**：Feistel 结构在数学上天然保证是**单射置换**，绝无冲突可能；
- **效果**：ID 从 `100001` 到 `100002`，置换后输出的数字在 43 位空间内发生剧烈雪崩跳跃，生成的短码看起来如同完全随机的哈希串（如从 `aB9xK1z` 变成 `7kP2mQw`），彻底粉碎外部遍历与业务推断攻击。

---

## 五、HTTP 301 与 302 重定向的深度博弈

在短链系统的面试中，最考察架构深度的一道经典问题就是：**“服务端返回 301 还是 302？为什么？”**

```
Client (Browser)                         Short URL Service                      Origin Web Server
       │                                         │                                      │
       │─── 1. GET /aB9xK1z ────────────────────>│                                      │
       │                                         │                                      │
       │<── 2. HTTP 301 Moved Permanently ───────│                                      │
       │       Location: https://example.com     │                                      │
       │       Cache-Control: (Default Browser)  │                                      │
       │                                         │                                      │
       │ (Browser Caches Mapping: /aB9xK1z -> https://example.com)                              │
       │                                                                                │
       │─── 3. Next Click: Directly Requests Destination (Bypassing Short URL Service!) ───────>│
```

### 5.1 语义与物理行为对比

| 状态码 | 官方定义 | 浏览器行为 | 服务端负载 | 数据埋点与控制力 |
| :--- | :--- | :--- | :--- | :--- |
| **301 Moved Permanently** | 永久重定向 | **永久缓存在客户端本地**。第二次访问不再向短链服务器发请求 | **极低**。后续流量完全不打到短链服务器 | **完全丧失控制力**。无法统计后续点击次数、PV/UV、用户地域，且无法动态修改长链 |
| **302 Found** (或 **307 Temporary**) | 临时重定向 | **默认不缓存**（除非显式指定 Cache-Control）。每次点击都访问短链服务器 | **较高**。短链服务器承载全量重定向 QPS | **绝对掌控**。100% 精确统计每次点击的行为数据，支持随时修改目标地址与安全熔断 |

### 5.2 工业级生产选型决断

1. **商业级短链平台一律采用 302（或 307）**：
   短链系统最大的商业价值在于**营销数据分析（Analytics Attribution）**：记录点击时间戳、用户 IP、设备类型、Referer 来源、转化漏斗。若返回 301，同一个用户的多次点击仅能捕获到首次，后续全部在浏览器本地直连目标页，导致广告主转化数据严重失真。
2. **防钓鱼与安全合规必须依赖 302**：
   如果某个短链指向的长网页被黑客篡改为了恶意钓鱼网站，若之前返回了 301，短链服务哪怕在后台下架了该短链，全球已访问过的数百万客户端在本地缓存清空前依然会直接访问钓鱼页面！采用 302 则可以秒级拦截下线。
3. **折中平衡：显式微缓存（Micro-Caching）**：
   若面对双十一级突发流量，可配置响应头：
   ```http
   HTTP/1.1 302 Found
   Location: https://example.com/target
   Cache-Control: private, max-age=60
   ```
   允许客户端浏览器在 60 秒内复用重定向结果，既削减了秒级高频重复狂点造成的峰值压力，又保证了 60 秒后能重新捕获用户行为与感知目标变更。

---

## 六、多级缓存架构与热点防击穿设计

在 100,000 Read QPS 的冲击下，绝不能让请求直接穿透到 MySQL/PostgreSQL 数据库。系统必须构建三级防御缓冲体系。

```
Client Request (GET /7kP2mQw)
              │
              ▼
[ Global CDN / Edge Gateway ]
  ├── 边缘静态规则 & 恶意 IP 封禁
  └── 缓存 60 秒 302 临时重定向响应 (可选)
              │
              ▼
[ Local Memory Cache (Caffeine / Go FreeCache) ]
  ├── 命中率 ~60% (单机热点极速响应，延迟 < 0.1ms)
  └── SingleFlight 机制 (防止本地并发击穿)
              │
              ├── (未命中)
              ▼
[ Redis Cluster (Distributed Cache) ]
  ├── 命中率 ~38% (内存集群存储全量高频短链)
  └── Bloom Filter (阻断不存在的恶意短码)
              │
              ├── (未命中)
              ▼
[ Database Cluster (MySQL Sharded by Hash(short_code)) ]
  └── 仅承载 < 2% 的冷门长尾查询
```

### 6.1 缓存雪崩与热点 Key 击穿（Hot-Key Breakdown）

某条大 V 发布的营销短链在微博上瞬间爆发，该短链对应的 Redis 缓存 Key 在某一个毫秒突然过期，紧接着 20,000 个并发请求同时发现缓存不存在，瞬间全部扑向数据库执行 `SELECT`，导致数据库连接池瞬间打满崩溃。

#### 解决方案一：互斥锁 / SingleFlight 归并
在应用服务节点本地利用 **SingleFlight（Go 语言标准扩展）** 或分布式锁：
当缓存未命中时，对于相同的 `short_code`，只允许一个工作协程去查询 Redis 或 DB，其余并发请求挂起等待该结果。查询完成后将结果广播给所有等待者，直接将并发回表压力降为 1。

#### 解决方案二：逻辑永不过期 + 后台异步续期
对于超级热点短链，Redis 内部不设置物理 TTL，而是将元数据封装为：
```json
{
  "long_url": "https://example.com",
  "expire_at": 1780000000
}
```
当读取线程发现 `now() > expire_at` 时，异步向消息队列投递一个刷新任务去加载最新数据，而当前请求直接返回旧的长链接。

### 6.2 恶意短码缓存穿透（Cache Penetration）

黑客利用脚本并发生成数百万个随机伪造的 7 位短码（如 `/xxxxxxx`、`/yyyyyyy`）疯狂访问短链服务。由于这些短码根本不存在，Redis 永远未命中，导致海量非法请求全量打穿到底层数据库。

#### 双重阻断防线：
1. **本地/集群布隆过滤器（Bloom Filter）**：
   在内存中维护全量合法 `short_code` 的布隆过滤器。请求到达时先校验布隆过滤器，判定不存在的请求直接在 0.1ms 内就地返回 HTTP 404，绝不回查数据库；
2. **空值缓存（Cache Null Object）**：
   若发生极微小的误判穿透到 DB，查询结果为空时，依然向 Redis 写入空对象标记（`key: NULL`），并设置极短的 TTL（如 30~60 秒），防止相同恶意请求反复冲击存储层。

---

## 七、分库分表与数据归档设计

虽然百亿数据仅占用 2TB 磁盘，但单张 MySQL 表若存储百亿行记录，B+ 树深度将达到 5~6 层，单次磁盘随机读延迟剧增。必须实施水平分表。

### 7.1 分片键（Sharding Key）的抉择

- **核心冲突**：
  - 读请求的入口是 `short_code`；
  - 写请求通常携带 `user_id`（为了支持用户管理其历史生成的短链）。
- **设计决策**：短链系统是典型的**读吞吐极端主导型系统**，分库分表的分片键必须且只能选择 **`short_code`**！
  $$\text{ShardID} = \text{MurmurHash3}(\text{short\_code}) \pmod N$$
  这确保了所有的 302 重定向查询都可以**单点精准路由（Single-Shard Point Query）**，杜绝跨分片的全局广播扫描（Scatter-Gather）。

### 7.2 用户维度反查索引（二级索引表）
如果用户需要查看“我创建的所有短链列表”，如何支持？
- 建立独立的异构索引表（通过 Canal / Debezium 监听主表 binlog 异步同步至 ElasticSearch 或按 `user_id` 分片的从属关系表）；
- 核心读重定向链路与后台运营管理链路在物理上完全隔离，互不干扰。

---

## 八、面试高频追问与 Staff 级应答策略

### Q1：如果用户重复输入同一个长 URL，系统应该返回相同的短链，还是生成新的短链？
> **深度回答**：
> 1. **两难权衡**：
>    - 若返回相同短链：需要支持 `long_url -> short_code` 的反查。如果对长 URL 做唯一索引，长字符串的索引开销极其巨大，且无法区分不同业务方、不同渠道的差异化追踪需求。
>    - 若返回不同短链：同一个长 URL 每次点击“生成”都产生一个新短码，会浪费短码空间，但彻底解除了反查依赖。
> 2. **工业级最佳实践**：**默认允许重复生成，引入业务租户标识隔离**。
>    将长 URL 与业务方 ID（`ClientID`）、渠道标记联合计算签名。同一商户针对同一长链在未指定自建别名的情况下，复用缓存中的短码；不同商户或不同推广批次即使长链完全一致，也分配独立短码，确保后续埋点归因数据的绝对隔离。

### Q2：短链过期删除机制如何设计？百亿级冷数据如何清理才能不引发数据库卡顿？
> **深度回答**：
> 1. **惰性删除（Lazy Deletion）**：读取请求命中缓存或 DB 时，检查 `expired_at` 字段。若已过期，立即就地删除缓存、异步投递删除事件，并直接向客户端返回 404；
> 2. **时间范围轮转归档（Table Partitioning by Month）**：对于百亿规模的历史冷数据，严禁在白天高峰期执行海量 `DELETE FROM table WHERE expired_at < NOW() LIMIT 1000`，这会引发严重的 InnoDB Undo Log 膨胀、锁争用与主从复制延迟。
> 3. **冷热分离与直接 Drop 分区**：按创建月份建立物理分区（Partition）或月度归档表。对于 5 年前到期的过期历史表，直接执行 `ALTER TABLE DROP PARTITION` 或清空整表，利用文件系统级的 `unlink` 瞬间释放空间，实现零锁与零 I/O 抖动。

### Q3：如何支持用户自定义短链（Custom Alias，例如 `bit.ly/my-awesome-sale`）？
> **深度回答**：
> 1. **自定义短码与系统发号的物理隔离**：
>    - 自定义短码长度通常较长（8~20 字符），系统发号严格保持为 7 字符；
>    - 在路由入口处通过长度或前缀快速分流：7 字符走发号器置换路由，非 7 字符或包含特殊连接符的走自定义别名表。
> 2. **原子性占位校验**：
>    自定义短链存在并发抢注问题。必须在数据库层对 `custom_code` 建立唯一性约束（Unique Constraint），并在写入前经过严格的敏感词黑名单、保留系统路径（如 `/api`、`/admin`、`/health`）过滤。

---

## 九、总结与架构精要对照表

百亿级短链系统的设计，看似简单，实则是分布式系统设计中“用数学模型规避物理开销”的典范：

| 核心设计域 | 初级工程师常见方案 | Staff 工程师工业级设计 |
| :--- | :--- | :--- |
| **短码编码** | 朴素 MD5/SHA256 截断，Base64 转码 | RFC 3986 安全规范，7 位 Base62 编码（支撑 3.5 万亿空间） |
| **碰撞处理** | 每次写入回表 `SELECT` 检查碰撞重试 | 分段式分布式发号器（Leaf 架构），双射单向映射，数学零碰撞 |
| **安全防御** | 自增 ID 直接暴露，引发遍历与商业泄密 | 43 位轻量级 Feistel 可逆对称置换密码，输出伪随机雪崩分布 |
| **重定向选型** | 盲目使用 301 试图减轻服务器压力 | 选用 302 Found 保持 100% 埋点掌控与恶意域名动态拦截，配合微缓存 |
| **高频读保护** | 简单的 Redis 单层缓存，遭遇穿透击穿 | 本地 Caffeine (SingleFlight) + Redis Cluster + 布隆过滤器空值阻断 |
| **分库分表** | 按 `user_id` 分片导致重定向查询全局广播 | 严格按 `short_code` 哈希分片保证点查命中，异步构建用户反查视图 |

---

## 参考资料与规范出处

- **IETF RFC 3986** - *Uniform Resource Identifier (URI): Generic Syntax*.
- **IETF RFC 9110** (Replaces RFC 7231) - *HTTP Semantics: Redirection 3xx Status Codes*.
- **Horst Feistel** (IBM Research, 1973) - *Cryptography and Computer Privacy (The Feistel Cipher Structure)*.
- **Meituan Open Source** - *Leaf: Distributed ID Generate Service (Segment Buffer Architecture)*.
- **Burton H. Bloom** (1970) - *Space/Time Trade-offs in Hash Coding with Allowable Errors*.
