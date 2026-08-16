import type { Order } from "./orders.ts";

export interface OrderStore {
  get(id: string): Promise<Order | undefined>;
  create(order: Order): Promise<void>;
  findByKey(idempotencyKey: string): Promise<Order | undefined>;
  saveByKey(
    idempotencyKey: string,
    order: Order,
    requestFingerprint?: string,
  ): Promise<SaveByKeyResult>;
  ready?(): Promise<boolean>;
}

export type SaveByKeyResult = {
  order: Order;
  created: boolean;
  conflict: boolean;
};

type IdempotencyEntry = {
  order: Order;
  requestFingerprint?: string;
};

// 事故修复终版(06 篇):orders 与 byKey 双表同驱逐——修一半是事故的延续
export class BoundedInMemoryStore implements OrderStore {
  private orders = new Map<string, Order>();
  private byKey = new Map<string, IdempotencyEntry>();
  private keyByOrderId = new Map<string, string>();
  private accessOrder: string[] = [];
  private readonly maxOrders: number;

  constructor(maxOrders = 10_000) {
    if (!Number.isInteger(maxOrders) || maxOrders < 1) {
      throw new Error("maxOrders must be a positive integer");
    }
    this.maxOrders = maxOrders;
  }

  private evict() {
    while (this.orders.size > this.maxOrders) {
      const oldest = this.accessOrder.shift();
      if (!oldest) break;
      const evicted = this.orders.get(oldest);
      this.orders.delete(oldest);
      if (evicted) {
        // 通过反向索引同步清理幂等键；否则两个有界表仍会漂移。
        const key = this.keyByOrderId.get(oldest);
        if (key) {
          this.byKey.delete(key);
          this.keyByOrderId.delete(oldest);
        }
      }
    }
  }

  async get(id: string) {
    return this.orders.get(id);
  }
  async create(order: Order) {
    this.orders.set(order.orderId, order);
    this.accessOrder.push(order.orderId);
    this.evict();
  }
  async findByKey(idempotencyKey: string) {
    return this.byKey.get(idempotencyKey)?.order;
  }

  async saveByKey(idempotencyKey: string, order: Order, requestFingerprint?: string): Promise<SaveByKeyResult> {
    // 这个方法没有 await：在单个 JS 事件循环中，检查和写入不会被另一个
    // handler 插入。它只证明单进程原型的原子性，不能替代数据库唯一约束。
    const existing = this.byKey.get(idempotencyKey);
    if (existing) {
      return {
        order: existing.order,
        created: false,
        conflict: requestFingerprint !== undefined
          && existing.requestFingerprint !== undefined
          && existing.requestFingerprint !== requestFingerprint,
      };
    }

    this.byKey.set(idempotencyKey, { order, requestFingerprint });
    this.keyByOrderId.set(order.orderId, idempotencyKey);
    this.orders.set(order.orderId, order);
    this.accessOrder.push(order.orderId);
    this.evict();
    return { order, created: true, conflict: false };
  }

  async ready() { return true; }

  get size() { return this.orders.size; }
  get keySize() { return this.byKey.size; }
}

// 事故篇使用的构造基线：故意不驱逐，便于观察“索引只进不出”的增长。
// 它不是生产实现，也不应被业务代码默认使用。
export class UnboundedInMemoryStore implements OrderStore {
  private orders = new Map<string, Order>();
  private byKey = new Map<string, IdempotencyEntry>();

  async get(id: string) { return this.orders.get(id); }

  async create(order: Order) {
    this.orders.set(order.orderId, order);
  }

  async findByKey(idempotencyKey: string) {
    return this.byKey.get(idempotencyKey)?.order;
  }

  async saveByKey(idempotencyKey: string, order: Order, requestFingerprint?: string): Promise<SaveByKeyResult> {
    const existing = this.byKey.get(idempotencyKey);
    if (existing) {
      return {
        order: existing.order,
        created: false,
        conflict: requestFingerprint !== undefined
          && existing.requestFingerprint !== undefined
          && existing.requestFingerprint !== requestFingerprint,
      };
    }
    this.byKey.set(idempotencyKey, { order, requestFingerprint });
    this.orders.set(order.orderId, order);
    return { order, created: true, conflict: false };
  }

  get size() { return this.orders.size; }
  get keySize() { return this.byKey.size; }
}
