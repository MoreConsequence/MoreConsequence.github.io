# 秒杀库存扣减：三种方案的超卖对照实验

对应文章：`content/posts/seckill-inventory-atomic-gates.md`。

模拟 N 个并发用户抢购 stock 件商品，对比三种扣减方案的正确性（超卖次数）与吞吐：

1. `naive`：check-then-update（先读库存、检查、再扣减），非原子；
2. `cas`：原子条件扣减，等价于 `UPDATE stock = stock - 1 WHERE id=? AND stock > 0`；
3. `luascript`：Redis EVAL 原子脚本（单线程内读-判-扣不可被打断）；连不上 Redis 时退化为互斥锁串行化（语义等价）。

## 运行

```bash
go run .                                  # 默认：stock=100, 1000 并发
go run . -stock 100 -n 1000 -gap 50us -runs 3
go run . -addr localhost:6379             # 连上 Redis 后真实执行 EVAL
go run . -race                            # 全部为原子操作,无数据竞争
```

| flag | 默认 | 说明 |
| :--- | :--- | :--- |
| `-stock` | 100 | 商品库存 |
| `-n` | 1000 | 并发抢购人数 |
| `-qty` | 1 | 每人购买件数 |
| `-gap` | 50µs | naive 方案"检查通过 → 扣减"之间的模拟窗口 |
| `-runs` | 3 | 重复次数 |
| `-addr` | localhost:6379 | Redis 地址；留空则跳过真实 Redis |

## 阅读输出

- `oversell = sold - stock`。naive 方案 sold 会超过库存（超卖），cas 与 luascript 恰好 sold == stock。
- naive 的 `gap` 是把"读到值 → 写回值"之间的窗口放大。真实系统的这个窗口是两条独立 SQL（或一次网络往返），只大不小。
- `ops/s` 是进程内模拟吞吐，不代表真实 DB/Redis 延迟。延迟对比需作者用真实 MySQL / Redis 压测后回填正文【本机实测待补】。

## 环境记录

- Go 1.25.1 darwin/arm64
- 运行日期与原始输出：正文「实验入口」一节 / 提交时一并回填
