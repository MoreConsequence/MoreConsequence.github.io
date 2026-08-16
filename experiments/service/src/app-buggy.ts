// 构造事故基线：使用无界 Map 观察订单与幂等索引只进不出的增长。
// 这是可复现的教学演练，不是历史事故的源码快照。
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { UnboundedInMemoryStore } from "./store.ts";

const store = new UnboundedInMemoryStore();
const app = createApp(store);

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: 4130 }, () => console.log("constructed unbounded baseline on 4130"));
}
