// P0-06 验收实验：完整下游链路——同一 producer 经过三种路径进入慢 Writable。
// 前一轮实验只测到消费方（for-await / push 计数），没有覆盖 Readable→Writable
// 的 pipe/drain 语义。本轮把"慢下游"（每条处理 20ms 的 Writable）接到链路末尾：
//   A) 直接 async generator → for-await → 慢 Writable（应用层逐条等待）
//   B) Readable.from(HWM=16) → .pipe() → 慢 Writable（Node pipe 等待 drain）
//   C) Readable.from(HWM=2)  → .pipe() → 慢 Writable（更小队列）
// 观测：maxProducerConsumerLag、readable 端 bufferLength 峰值、drain 次数、耗时。
import { Readable, Writable } from "node:stream";

const count = 2000;
const delayMs = 20; // 慢下游：每条 20ms

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* producer() {
  for (let i = 0; i < count; i++) yield JSON.stringify({ id: i, payload: "x".repeat(128) });
}

async function run(label: string, viaReadable: boolean, hwm: number) {
  let produced = 0;
  let consumed = 0;
  let maxLag = 0;
  let maxBuffered = 0;
  let drains = 0;

  const writable = new Writable({
    highWaterMark: 16,
    async write(chunk, _enc, cb) {
      consumed++;
      maxLag = Math.max(maxLag, produced - consumed);
      await sleep(delayMs);
      cb();
    },
  });
  writable.on("drain", () => drains++);

  const t0 = performance.now();
  if (!viaReadable) {
    // 路径 A：应用层 for-await + 手动 write，生产者被消费循环直接拉拽
    for await (const record of producer()) {
      produced++;
      const ok = writable.write(record);
      if (!ok) await new Promise((r) => writable.once("drain", r));
    }
    writable.end();
  } else {
    // 路径 B/C：Readable.from + pipe，由 Node 的 pipe 协议负责背压
    const source = Readable.from(producer(), { highWaterMark: hwm });
    source.on("data", (chunk) => {
      produced++;
      maxBuffered = Math.max(maxBuffered, source.readableLength);
      maxLag = Math.max(maxLag, produced - consumed);
    });
    source.pipe(writable);
  }
  await new Promise((r) => writable.once("finish", r));
  const ms = performance.now() - t0;

  // 完成后再写一次，观察 write 返回值（false = 内部缓冲已满，需等 drain）
  console.log(
    `${label}: 耗时=${ms.toFixed(0)}ms produced=${produced} consumed=${consumed} maxLag=${maxLag} maxBuffered=${maxBuffered}B drain=${drains}`,
  );
}

const main = async () => {
  await run("A 直接 for-await → 慢 Writable (每步等 drain)", false, 0);
  await run("B Readable.from HWM=16 → pipe → 慢 Writable", true, 16);
  await run("C Readable.from HWM=2  → pipe → 慢 Writable", true, 2);
};
void main();