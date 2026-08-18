# JavaScript Promise / async 时序证据

这份快照只验证当前 Node 进程中的微任务顺序、thenable 交接和未处理 rejection 行为。`serial_critical_path_ms=240` 与 `parallel_critical_path_ms=80` 是固定 3 个任务、每个 80ms 的关键路径模型，不是网络吞吐或稳定延迟 benchmark。

## 命令

```bash
node experiments/js-async-promise-timing/main.mjs
node experiments/js-async-promise-timing/assert-unhandled.mjs
```

`assert-unhandled.mjs` 会启动一个子进程，要求它因未处理 rejection 以非零状态退出，并确认定时器没有运行；它本身在断言通过时以 0 退出。

## 边界

- 顺序结果绑定到记录的 Node 版本；浏览器和其他 JavaScript runtime 需单独验证。
- 时序 smoke 没有证明外部 I/O 的取消、网络延迟或 Promise 组合子的吞吐。
- 文章中的 240ms/80ms 是由输入延迟直接推导的串行/并行关键路径，不应当写成每次运行的 wall-clock 数字。
