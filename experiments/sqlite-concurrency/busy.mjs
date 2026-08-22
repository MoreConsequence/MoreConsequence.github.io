#!/usr/bin/env node
// SQLite 双连接并发：写-写冲突与读-写并发的真实行为。
// 同一线程内用两个连接按显式顺序交错——同步驱动恰好让"谁持锁"完全确定。
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sqlite-busy-"));
const dbPath = join(dir, "t.db");
const now = () => performance.now();

function open(timeoutMs) {
  const db = new DatabaseSync(dbPath);
  if (timeoutMs !== undefined) {
    db.exec(`PRAGMA busy_timeout = ${timeoutMs}`);
  }
  return db;
}

const results = [];
function record(scenario, outcome, elapsedMs) {
  results.push({ scenario, outcome, elapsedMs });
}

// ---- 场景 1：journal 模式(默认) —— A 持写锁，B 立刻写、读者立刻读 ----
{
  const a = open(0), b = open(0), r = open(0);
  const mode = a.prepare("PRAGMA journal_mode").get();
  a.exec("CREATE TABLE IF NOT EXISTS t (x)");
  a.exec("BEGIN IMMEDIATE"); a.exec("INSERT INTO t VALUES (1)");
  let t = now(); let out;
  try { b.exec("INSERT INTO t VALUES (2)"); out = "成功(不应发生)"; }
  catch (e) { out = `${e.code ?? ""} ${e.message.slice(0, 40)}`; }
  record(`S1 journal: B 抢写(A持锁, busy_timeout=0) [mode=${mode.journal_mode}]`, out, now() - t);
  t = now();
  try { r.prepare("SELECT count(*) c FROM t").get(); out = "读成功"; }
  catch (e) { out = `${e.code ?? ""} ${e.message.slice(0, 40)}`; }
  record("S1 journal: C 读(A持写锁)", out, now() - t);
  a.exec("COMMIT");
  [a, b, r].forEach((d) => d.close());
}

// ---- 场景 2：WAL 模式 —— 写仍互斥，但读不再被写阻塞 ----
{
  const a = open(0), b = open(0), r = open(0);
  a.exec("PRAGMA journal_mode = WAL");
  a.exec("CREATE TABLE IF NOT EXISTS t (x)"); // WAL 建表后生效
  a.exec("INSERT INTO t VALUES (9)");
  a.exec("BEGIN IMMEDIATE"); a.exec("INSERT INTO t VALUES (1)");
  let t = now(); let out;
  try { b.exec("INSERT INTO t VALUES (2)"); out = "成功(不应发生)"; }
  catch (e) { out = `${e.code ?? ""} ${e.message.slice(0, 40)}`; }
  record("S2 WAL: B 抢写(A持锁)", out, now() - t);
  t = now();
  try { const row = r.prepare("SELECT count(*) c FROM t").get(); out = `读成功(${row.c} 行快照)`; }
  catch (e) { out = `${e.code ?? ""} ${e.message.slice(0, 40)}`; }
  record("S2 WAL: C 读(A持写锁)", out, now() - t);
  a.exec("COMMIT");
  [a, b, r].forEach((d) => d.close());
}

// ---- 场景 3：busy_timeout 的真实含义——等满配置时长再失败 ----
{
  const a = open(0);
  a.exec("PRAGMA journal_mode = WAL");
  a.exec("BEGIN IMMEDIATE"); a.exec("INSERT INTO t VALUES (1)");
  const b = open(200); // 给 200ms 耐心；A 在本线程里不会提交，所以必然等到超时
  const t = now(); let out;
  try { b.exec("INSERT INTO t VALUES (2)"); out = "成功(不应发生)"; }
  catch (e) { out = `${e.code ?? ""} ${e.message.slice(0, 40)}`; }
  record("S3 WAL: B busy_timeout=200 且 A 不释放", out, now() - t);
  a.exec("ROLLBACK");
  [a, b].forEach((d) => d.close());
}

console.log(`Node ${process.version} · node:sqlite · db=${dbPath}`);
console.log("| 场景 | 结果 | 实测耗时(ms) |");
console.log("| --- | --- | --- |");
for (const r of results) console.log(`| ${r.scenario} | ${r.outcome} | ${r.elapsedMs.toFixed(2)} |`);
rmSync(dir, { recursive: true, force: true });
