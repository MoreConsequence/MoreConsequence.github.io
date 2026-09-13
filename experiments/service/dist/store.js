// 冲突判定是两个实现共享的语义合同：仅当双方指纹都存在且不同才算冲突。
// 缺一边就不比——这是当前对外行为，改动它属于合同变更而非重构。
const conflictWith = (existingFingerprint, incomingFingerprint) => incomingFingerprint !== undefined &&
    existingFingerprint !== undefined &&
    existingFingerprint !== incomingFingerprint;
// 事故修复终版(06 篇):orders 与 byKey 双表同驱逐——修一半是事故的延续
export class BoundedInMemoryStore {
    orders = new Map();
    byKey = new Map();
    keyByOrderId = new Map();
    accessOrder = [];
    maxOrders;
    constructor(maxOrders = 10_000) {
        if (!Number.isInteger(maxOrders) || maxOrders < 1) {
            throw new Error("maxOrders must be a positive integer");
        }
        this.maxOrders = maxOrders;
    }
    evict() {
        while (this.orders.size > this.maxOrders) {
            const oldest = this.accessOrder.shift();
            if (!oldest)
                break;
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
    async get(id) {
        return this.orders.get(id);
    }
    async create(order) {
        this.orders.set(order.orderId, order);
        this.accessOrder.push(order.orderId);
        this.evict();
    }
    async findByKey(idempotencyKey) {
        return this.byKey.get(idempotencyKey)?.order;
    }
    async saveByKey(idempotencyKey, order, requestFingerprint) {
        // 这个方法没有 await：在单个 JS 事件循环中，检查和写入不会被另一个
        // handler 插入。它只证明单进程原型的原子性，不能替代数据库唯一约束。
        const existing = this.byKey.get(idempotencyKey);
        if (existing) {
            return {
                order: existing.order,
                created: false,
                conflict: conflictWith(existing.requestFingerprint, requestFingerprint),
            };
        }
        this.writeNew(idempotencyKey, order, requestFingerprint);
        return { order, created: true, conflict: false };
    }
    // 三张表 + 驱逐位次的唯一写入口：新增写入路径时从这里走，避免双表漂移。
    writeNew(idempotencyKey, order, fingerprint) {
        this.byKey.set(idempotencyKey, { order, requestFingerprint: fingerprint });
        this.keyByOrderId.set(order.orderId, idempotencyKey);
        this.orders.set(order.orderId, order);
        this.accessOrder.push(order.orderId);
        this.evict();
    }
    async ready() { return true; }
    get size() { return this.orders.size; }
    get keySize() { return this.byKey.size; }
}
// 事故篇使用的构造基线：故意不驱逐，便于观察“索引只进不出”的增长。
// 它不是生产实现，也不应被业务代码默认使用。
export class UnboundedInMemoryStore {
    orders = new Map();
    byKey = new Map();
    async get(id) { return this.orders.get(id); }
    async create(order) {
        this.orders.set(order.orderId, order);
    }
    async findByKey(idempotencyKey) {
        return this.byKey.get(idempotencyKey)?.order;
    }
    async saveByKey(idempotencyKey, order, requestFingerprint) {
        const existing = this.byKey.get(idempotencyKey);
        if (existing) {
            return {
                order: existing.order,
                created: false,
                conflict: conflictWith(existing.requestFingerprint, requestFingerprint),
            };
        }
        this.byKey.set(idempotencyKey, { order, requestFingerprint });
        this.orders.set(order.orderId, order);
        return { order, created: true, conflict: false };
    }
    get size() { return this.orders.size; }
    get keySize() { return this.byKey.size; }
}
//# sourceMappingURL=store.js.map