# typescript-streams-backpressure：本机证据

## 命令

每条命令都会启动独立 Node 进程：

```bash
cd experiments/ts-streams
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node --expose-gc memory.ts --mode=array --count=200000 --payload-bytes=128
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node --expose-gc memory.ts --mode=generator --count=200000 --payload-bytes=128
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node --expose-gc memory.ts --mode=readable --count=200000 --payload-bytes=128 --high-water-mark=16
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node --expose-gc memory.ts --mode=readable --count=50000 --payload-bytes=128 --high-water-mark=1
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node --expose-gc memory.ts --mode=readable --count=50000 --payload-bytes=128 --high-water-mark=64
```

## 解释

`raw/*.json` 是上述命令的一次本机输出。`peak*` 是采样到的运行期峰值，`afterGc*` 是结束后的单次快照；`maxProducerConsumerLag` 是该实验定义的 producer/consumer 差，不是 HTTP socket 或 Writable 的完整队列长度。RSS 和时间相关值会因机器、Node/V8 和采样时机改变。
