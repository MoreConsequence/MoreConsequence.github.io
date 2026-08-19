// RSS / heapUsed / heapTotal / GC 后保留量各回答什么:
// 阶段 1: 分配 200MB 并被引用 (RSS 与 heapUsed 同步涨)
// 阶段 2: 释放引用, 不触发 GC (RSS 不降, heapUsed 不降 — 垃圾在堆里)
// 阶段 3: 显式 GC (heapUsed 跌回, RSS 不降 — 堆高水位)
// 阶段 4: 换页活动 (把死内存重新分配, 观察 OS 侧)
let keep = [];
function snap(label) {
  const m = process.memoryUsage();
  const rssMB = (m.rss / 1048576).toFixed(1);
  const heapUsedMB = (m.heapUsed / 1048576).toFixed(1);
  const heapTotalMB = (m.heapTotal / 1048576).toFixed(1);
  // 内存采样: heapUsed vs RSS 告诉自己"这两者是不同层"
  console.log(`${label.padEnd(22)} rss=${rssMB.padStart(7)}MB heapUsed=${heapUsedMB.padStart(7)}MB heapTotal=${heapTotalMB.padStart(7)}MB`);
}
snap("启动后");
// 阶段 1: 分配 200MB 且保持引用
for (let i = 0; i < 200; i++) keep.push(Buffer.alloc(1024 * 1024, 1));
snap("分配 200MB(引用中)");
// 阶段 2: 释放引用(垃圾)但不 GC
keep = [];
snap("释放引用, 未 GC");
// 阶段 3: 显式 GC
global.gc();
snap("GC 之后");
// 阶段 4: 再分配 100MB (复用堆)
for (let i = 0; i < 100; i++) keep.push(Buffer.alloc(1024 * 1024, 2));
snap("再分配 100MB");
