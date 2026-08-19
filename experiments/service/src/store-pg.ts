import { Pool } from "pg";
import type { Order } from "../src/orders.ts";
import type { OrderStore, SaveByKeyResult } from "../src/store.ts";

// P0-02 验收工件：把进程内幂等升级为 PostgreSQL 原子 claim。
// 原子性来源：orders_by_key(idempotency_key) 的唯一约束。并发 INSERT 同 key
// 时数据库保证恰好一个事务成功，其余全部命中冲突分支，不存在 check-then-act。
export class PostgresOrderStore implements OrderStore {
  private pool: Pool;
  readonly schema: string;

  constructor(pool: Pool, schema = "idem") {
    this.pool = pool;
    this.schema = schema;
  }

  async ready(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }

  static async create(dsn: string, schema = "idem"): Promise<PostgresOrderStore> {
    const pool = new Pool({ connectionString: dsn });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.orders (
        id              TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        fingerprint     TEXT,
        sku             TEXT NOT NULL,
        customer_id     INTEGER NOT NULL,
        qty             INTEGER NOT NULL,
        status          TEXT NOT NULL,
        created_at      TEXT NOT NULL
      )
    `);
    return new PostgresOrderStore(pool, schema);
  }

  async get(id: string): Promise<Order | undefined> {
    const r = await this.pool.query(
      `SELECT * FROM ${this.schema}.orders WHERE id = $1`,
      [id],
    );
    if (r.rowCount === 0) return undefined;
    return toOrder(r.rows[0]);
  }

  async create(order: Order): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.schema}.orders
         (id, idempotency_key, sku, customer_id, qty, status, created_at)
       VALUES ($1, $1, $2, $3, $4, $5, $6)`,
      [order.orderId, order.sku, order.customerId, order.qty, order.status, order.createdAt],
    );
  }

  async findByKey(idempotencyKey: string): Promise<Order | undefined> {
    const r = await this.pool.query(
      `SELECT * FROM ${this.schema}.orders WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (r.rowCount === 0) return undefined;
    return toOrder(r.rows[0]);
  }

  async saveByKey(
    idempotencyKey: string,
    order: Order,
    requestFingerprint?: string,
  ): Promise<SaveByKeyResult> {
    // 单条 INSERT + 唯一约束是原子的：并发同 key 只有一个事务成功，
    // 失败者回读已提交的权威行。fingerprint 冲突与重放共用同一条路径。
    const inserted = await this.pool.query(
      `INSERT INTO ${this.schema}.orders
         (id, idempotency_key, fingerprint, sku, customer_id, qty, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [order.orderId, idempotencyKey, requestFingerprint ?? null, order.sku,
        order.customerId, order.qty, order.status, order.createdAt],
    );
    if (inserted.rowCount === 1) {
      return { order, created: true, conflict: false };
    }
    const r = await this.pool.query(
      `SELECT * FROM ${this.schema}.orders WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    const existing = r.rows[0];
    const conflict =
      requestFingerprint !== undefined &&
      existing.fingerprint !== null &&
      existing.fingerprint !== requestFingerprint;
    return {
      order: toOrder(existing),
      created: false,
      conflict,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // 实验脚本专用：暴露只读查询，避免直接翻私有 pool 字段。
  async query<T = { [k: string]: unknown }>(
    text: string,
    params?: unknown[],
  ): Promise<T[] | { rows: T[] }> {
    const r = await this.pool.query(text, params as never[]);
    return { rows: r.rows as T[] };
  }

  async reset(): Promise<void> {
    await this.pool.query(`TRUNCATE ${this.schema}.orders`);
  }
}

type OrderRow = {
  id: string;
  sku: string;
  customer_id: number;
  qty: number;
  status: Order["status"];
  created_at: string;
};

function toOrder(row: OrderRow): Order {
  return {
    orderId: row.id,
    sku: row.sku,
    customerId: row.customer_id,
    qty: row.qty,
    status: row.status,
    createdAt: row.created_at,
  };
}