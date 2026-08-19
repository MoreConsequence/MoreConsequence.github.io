// 堆内对象版本: 展示 heapUsed 与 RSS 的分层
function snap(label) {
  const m = process.memoryUsage();
  console.log(`${label.padEnd(24)} rss=${(m.rss/1048576).toFixed(1).padStart(7)}MB heapUsed=${(m.heapUsed/1048576).toFixed(1).padStart(7)}MB heapTotal=${(m.heapTotal/1048576).toFixed(1).padStart(7)}MB`);
}
let keep = [];
snap("启动后");
// 堆内 200MB: 用两百万个 24 字节左右的 double 数组元素近似
for (let i = 0; i < 200; i++) {
  const arr = new Array(100000).fill(i);
  keep.push(arr);
}
snap("堆内 200MB(引用中)");
keep = [];
snap("释放引用, 未 GC");
if (typeof global.gc === "function") global.gc();
snap("GC 之后");
// 再分配 100MB
for (let i = 0; i < 100; i++) {
  const arr = new Array(100000).fill(i);
  keep.push(arr);
}
snap("再分配 100MB(复用堆)");
