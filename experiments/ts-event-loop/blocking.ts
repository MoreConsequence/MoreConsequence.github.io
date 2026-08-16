// 只回答一个问题：同步 CPU 工作会不会让 Node 主线程上的 timer 失约？
const t0 = performance.now();
setTimeout(() => console.log(`定时器声明 10ms，实际在 ${(performance.now() - t0).toFixed(1)}ms 执行`), 10);

// 同步忙等 50ms——事件循环无法插队
const until = performance.now() + 50;
while (performance.now() < until) { /* busy loop */ }
console.log(`主线程同步 CPU 工作结束于 ${(performance.now() - t0).toFixed(1)}ms`);
