import { BoundedInMemoryStore, UnboundedInMemoryStore } from "../src/store.ts";

const count = Number(process.argv[2] ?? 500);
const boundedLimit = Number(process.argv[3] ?? 100);
const order = (i: number) => ({
  orderId: `A-${i}`,
  sku: `sku-${i}`,
  customerId: 7,
  qty: 1,
  status: "CREATED" as const,
  createdAt: "2026-08-16T00:00:00.000Z",
});

const unbounded = new UnboundedInMemoryStore();
const bounded = new BoundedInMemoryStore(boundedLimit);
for (let i = 0; i < count; i++) {
  const value = order(i);
  await unbounded.saveByKey(`key-${i}`, value, `fingerprint-${i}`);
  await bounded.saveByKey(`key-${i}`, value, `fingerprint-${i}`);
}

console.log(JSON.stringify({
  count,
  boundedLimit,
  unbounded: { orders: unbounded.size, keys: unbounded.keySize },
  bounded: { orders: bounded.size, keys: bounded.keySize },
}));
