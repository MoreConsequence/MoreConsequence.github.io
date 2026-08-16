// microtask 的相对顺序稳定；顶层 timer 与 immediate 的相对顺序要按轮次观察。
const runOnce = () => new Promise<string[]>((resolve) => {
  const events: string[] = ["sync:start"];
  queueMicrotask(() => events.push("queueMicrotask"));
  Promise.resolve().then(() => events.push("Promise.then"));
  setTimeout(() => {
    events.push("setTimeout(0)");
    resolve(events);
  }, 0);
  setImmediate(() => events.push("setImmediate"));
  events.push("sync:end");
});

const run = async () => {
  for (let i = 0; i < 5; i++) console.log(`${i + 1}: ${(await runOnce()).join(" -> ")}`);
};
void run();
