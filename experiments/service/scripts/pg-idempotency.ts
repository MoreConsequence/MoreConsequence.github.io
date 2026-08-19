// P0-02 验收实验：PostgreSQL 唯一约束做并发幂等原子 claim。
// 三幕：
//   1) 100 个并发同 key POST：恰好 1 个 created，99 个重放，总 1 行；
//   2) 同 key 不同 fingerprint：409 语义（conflict=true，不创建新行）；
//   3) 进程重连/重启后同 key 重放仍返回原订单（持久化幂等）。
import { randomUUID } from "node:crypto";
import net from "node:net";
import { PostgresOrderStore } from "../src/store-pg.ts";
import type { Order } from "../src/orders.ts";

const DSN = process.env.PG_DSN ?? "postgres://postgres:root@localhost:15432/postgres";

// gate 模式：容器不在时跳过而不是让 verify:experiments 失败。
const skipIfUnreachable = process.argv.includes("--skip-if-unreachable");
if (skipIfUnreachable) {
  const host = new URL(DSN).hostname;
  const port = Number(new URL(DSN).port || "5432");
  await new Promise<void>((resolve) => {
    const socket = net.connect({ host, port });
    socket.on("connect", () => { socket.destroy(); resolve(); });
    socket.on("error", () => {
      console.log(`PG ${host}:${port} unreachable, skipping PG idempotency smoke`);
      process.exit(0);
    });
  });
}

const mkOrder = (orderId: string, key: string): Order => ({
  orderId,
  sku: "SKU-42",
  customerId: 7,
  qty: 2,
  status: "CREATED",
  createdAt: new Date().toISOString(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const store = await PostgresOrderStore.create(DSN, "idem");
  await store.reset();
  console.log(`PostgreSQL ${await version(store)} · 并发幂等实验`);

  // 幕 1：100 个并发同 key
  const key = `k-${randomUUID()}`;
  const fpA = "body:{qty:2}";
  const fpB = "body:{qty:99}";
  const before = Date.now();
  const results = await Promise.all(
    Array.from({ length: 100 }, () => store.saveByKey(key, mkOrder(randomUUID(), key), fpA)),
  );
  const ms = Date.now() - before;
  const created = results.filter((r) => r.created).length;
  const replayed = results.filter((r) => !r.created && !r.conflict).length;
  const conflicts = results.filter((r) => r.conflict).length;
  const rows = await countRows(store, key);
  const winner = results.find((r) => r.created)!.order;
  console.log(`幕1 并发100同key: created=${created} replayed=${replayed} conflict=${conflicts} 表内行数=${rows} 耗时=${ms}ms`);
  console.log(`    权威订单 id=${winner.orderId} sku=${winner.sku} customerId=${winner.customerId} qty=${winner.qty}`);

  // 幕 2：同 key 不同 fingerprint → 409，不创建新行
  const again = await store.saveByKey(key, mkOrder(randomUUID(), key), fpA);
  const conflict = await store.saveByKey(key, mkOrder(randomUUID(), key), fpB);
  console.log(`幕2 同key重放: created=${again.created} conflict=${again.conflict} id不变=${again.order.orderId === winner.orderId}`);
  console.log(`幕2 同key异指纹: conflict=${conflict.conflict} created=${conflict.created} 表内行数=${await countRows(store, key)}`);

  // 幕 3：模拟"进程重启"——断开连接重建池，重放仍应命中同一行
  const beforeId = winner.orderId;
  await store.close();
  await sleep(200);
  const store2 = await PostgresOrderStore.create(DSN, "idem");
  const replayed3 = await store2.saveByKey(key, mkOrder(randomUUID(), key), fpA);
  const rows3 = await countRows(store2, key);
  console.log(`幕3 重建连接后重放: created=${replayed3.created} id不变=${replayed3.order.orderId === beforeId} 表内行数=${rows3}`);
  await store2.close();
}

async function version(store: PostgresOrderStore) {
  const data = (await store.query<{ data: string }>("SELECT version() AS data")) as {
    rows: { data: string }[];
  };
  return data.rows[0].data.split(",")[0];
}

async function countRows(store: PostgresOrderStore, key: string): Promise<number> {
  const rows = (await store.query<{ n: string }>(
    "SELECT count(*) AS n FROM idem.orders WHERE idempotency_key = $1",
    [key],
  )) as { rows: { n: string }[] };
  return Number(rows.rows[0].n);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });