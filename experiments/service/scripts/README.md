# 压测脚本与构造事故演练

- postmany.lua:POST 大量新订单(唯一 sku/key)——观察有界/无界原型的索引增长
  正常服务: `node src/app.ts`，构造无界基线: `node src/app-buggy.ts`
  服务端口分别是 4110 和 4130。
  用法: `wrk -t2 -c30 -d30s -s scripts/postmany.lua http://localhost:4130/`
- mixbody.lua:10% 超长 idempotencyKey + 90% 正常——CPU 炸弹哑弹复现(06 篇)
  用法: `wrk -t2 -c10 -d5s -s scripts/mixbody.lua http://localhost:4130/`

`postmany.lua` 只产生请求，不等于历史事故的原始压测证据。正文引用的旧 RSS、订单数和吞吐数字已经从文章移除；要恢复它们，必须找回原始 commit 与 raw 输出。
