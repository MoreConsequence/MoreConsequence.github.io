// 独立进程内比较三种消费模式。
// 运行期间同时记录 rss/heap 峰值，结束后再记录一次 GC 后快照；两者回答不同问题。
import { Readable } from "node:stream";

type Mode = "array" | "generator" | "readable";
type RecordValue = { id: number; name: string; score: number; payload: string };

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
};

const mode = arg("mode", "generator") as Mode;
const count = Number(arg("count", "200000"));
const payloadBytes = Number(arg("payload-bytes", "128"));
const highWaterMark = Number(arg("high-water-mark", "16"));
const delayMs = Number(arg("delay-ms", "0"));

if (!["array", "generator", "readable"].includes(mode)) throw new Error(`unknown mode: ${mode}`);
if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");

const payload = "x".repeat(payloadBytes);
const makeRecord = (i: number): RecordValue => ({ id: i, name: `user-${i}`, score: i * 0.5, payload });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let produced = 0;
let consumed = 0;
let maxProducerConsumerLag = 0;
let peakRss = 0;
let peakHeapUsed = 0;
let sum = 0;

const sample = () => {
  const memory = process.memoryUsage();
  peakRss = Math.max(peakRss, memory.rss);
  peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed);
  maxProducerConsumerLag = Math.max(maxProducerConsumerLag, produced - consumed);
};

async function* producer() {
  for (let i = 0; i < count; i++) {
    produced++;
    sample();
    yield makeRecord(i);
  }
}

const consume = async (record: RecordValue) => {
  sum += record.score;
  consumed++;
  if (delayMs > 0) await sleep(delayMs);
  sample();
};

const run = async () => {
  if (mode === "array") {
    let all: RecordValue[] | undefined = [];
    for (let i = 0; i < count; i++) {
      all.push(makeRecord(i));
      produced++;
      if (i % 10_000 === 0) sample();
    }
    sample();
    for (const record of all) await consume(record);
    all = undefined;
  } else if (mode === "generator") {
    for await (const record of producer()) await consume(record);
  } else {
    const stream = Readable.from(producer(), { objectMode: true, highWaterMark });
    for await (const record of stream) await consume(record as RecordValue);
  }

  sample();
  if (global.gc) global.gc();
  const afterGc = process.memoryUsage();
  console.log(JSON.stringify({
    mode,
    count,
    payloadBytes,
    highWaterMark: mode === "readable" ? highWaterMark : null,
    delayMs,
    produced,
    consumed,
    maxProducerConsumerLag,
    sum,
    peakRssMb: Number((peakRss / 1024 / 1024).toFixed(1)),
    peakHeapUsedMb: Number((peakHeapUsed / 1024 / 1024).toFixed(1)),
    afterGcHeapUsedMb: Number((afterGc.heapUsed / 1024 / 1024).toFixed(1)),
    afterGcRssMb: Number((afterGc.rss / 1024 / 1024).toFixed(1)),
  }));
};

void run();
