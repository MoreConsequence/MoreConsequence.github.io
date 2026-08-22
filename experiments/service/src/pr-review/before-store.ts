import type { Order } from "../orders.ts";
import type { OrderStore, SaveByKeyResult } from "../store.ts";

type Entry = { order: Order; fingerprint?: string };

// 评审工件：模拟一个典型的"幂等 PR"。查一次、写一次，中间隔着数据库往返。
// 它在顺序用例里表现完全正确——问题只在并发下出现。
export class RacyIdempotencyStore implements OrderStore {
  private orders = new Map<string, Order>();
  private byKey = new Map<string, Entry>();

  // 模拟一次异步存储往返：让出事件循环，给并发请求插入的机会。
  // 这不是故意埋雷：任何真实 DB 驱动的实现都长这样。
  private roundTrip<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), 0));
  }

  async get(id: string): Promise<Order | undefined> {
    return await this.roundTrip(this.orders.get(id));
  }

  async create(order: Order): Promise<void> {
    this.orders.set(order.orderId, order);
  }

  async findByKey(idempotencyKey: string): Promise<Order | undefined> {
    return await this.roundTrip(this.byKey.get(idempotencyKey)?.order);
  }

  async saveByKey(
    idempotencyKey: string,
    order: Order,
    requestFingerprint?: string,
  ): Promise<SaveByKeyResult> {
    // check 与 act 之间隔着两次 await：检查时"没有"，不代表写入时仍然没有。
    const existing = await this.roundTrip(this.byKey.get(idempotencyKey));
    if (existing) {
      return {
        order: existing.order,
        created: false,
        conflict:
          requestFingerprint !== undefined &&
          existing.fingerprint !== undefined &&
          existing.fingerprint !== requestFingerprint,
      };
    }
    await this.roundTrip(undefined); // 写入前的第二次往返：竞争窗口
    this.byKey.set(idempotencyKey, { order, fingerprint: requestFingerprint });
    this.orders.set(order.orderId, order);
    return { order, created: true, conflict: false };
  }

  ready(): Promise<boolean> {
    return Promise.resolve(true);
  }

  get size() {
    return this.orders.size;
  }

  get keySize() {
    return this.byKey.size;
  }
}
