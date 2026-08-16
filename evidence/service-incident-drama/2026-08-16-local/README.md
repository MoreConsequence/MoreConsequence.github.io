# service-incident-drama：本机构造演练证据

这不是历史事故的 raw dump。它是当前 checkout 中 `UnboundedInMemoryStore` 与 `BoundedInMemoryStore` 的构造性对照，用来验证文章保留的“两个索引必须一起有界”反例。历史 RSS、heap 和 wrk 数字仍然不能从这次运行倒推；原始缺失证据保留在 `review.md` 的 P0-04。

## 命令

```bash
cd experiments/service
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node scripts/store-growth.ts 500 100
```

## 结果

见 `raw/store-growth.json`：无界实现的 orders/keys 都增长到 500；有界实现的两张表都停在 100。这个程序没有网络、GC、数据库或部署，因此只证明容量不变量，不证明线上内存曲线。
