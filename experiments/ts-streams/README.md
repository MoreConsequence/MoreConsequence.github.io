# Streams 实验

`memory.ts` 每种模式都在一个新进程中运行。输入规模、记录大小和消费者延迟固定时，才把 `array`、直接 async generator 和 `Readable.from` 放在同一张表里比较：

直接运行 TypeScript 源文件需要 Node 22.13.0 以上；本文的本机记录使用 Node 24.19.0。

```bash
NODE=/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node
$NODE --expose-gc memory.ts --mode=array --count=200000 --payload-bytes=128
$NODE --expose-gc memory.ts --mode=generator --count=200000 --payload-bytes=128
$NODE --expose-gc memory.ts --mode=readable --count=200000 --payload-bytes=128 --high-water-mark=16
```

输出中的 `peakHeapUsedMb`/`peakRssMb` 是运行期峰值，`afterGc*` 是结束后快照，不能互换。`maxProducerConsumerLag` 只表示这个实验中 producer 已 yield 与 consumer 已完成之间的最大差，不等于所有下游（HTTP socket、SSE、Writable）的队列长度。
