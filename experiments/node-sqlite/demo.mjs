// Node 内置 sqlite：同步 API、参数化防注入、事务原子。
// 只用 node:sqlite（v24 自带）。运行：node demo.mjs
import { DatabaseSync } from "node:sqlite";

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE orders(id INTEGER PRIMARY KEY, sku TEXT, qty INTEGER)");

// Q1：参数化写入 + 查询，注入串当纯文本。
const insert = db.prepare("INSERT INTO orders(sku, qty) VALUES (?, ?)");
insert.run("SKU-42", 2);
insert.run("x'); DROP TABLE orders;--", 1);
const n = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
check("Q1 参数化防注入", n === 2, `count=${n}`);

// Q2：具名参数 + 整行对象读取。
const row = db.prepare("SELECT * FROM orders WHERE sku = :sku").get({ sku: "SKU-42" });
check("Q2 具名参数", row.qty === 2 && typeof row.id === "number", JSON.stringify(row));

// Q3：显式事务原子——BEGIN 后 ROLLBACK，写入全部撤销（本模块无 transaction 助手）。
db.exec("BEGIN");
db.prepare("INSERT INTO orders(sku, qty) VALUES ('A', 1)").run();
db.exec("ROLLBACK");
const n2 = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
check("Q3 事务回滚", n2 === 2, `count=${n2}`);

db.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
