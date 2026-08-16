// 记录 timer lateness，而不是把一次输出当成运行时常数。
const t0 = performance.now();
setTimeout(() => {
  const actualMs = performance.now() - t0;
  console.log(`定时器声明 10ms，实际执行于 ${actualMs.toFixed(1)}ms，lateness ${(actualMs - 10).toFixed(1)}ms`);
}, 10);

const until = performance.now() + 50;
while (performance.now() < until) {}
console.log(`主线程同步 CPU 工作结束于 ${(performance.now() - t0).toFixed(1)}ms`);
