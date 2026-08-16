# typescript-errors-result-throw：本机证据

## 命令

```bash
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node experiments/ts-errors/result-vs-throw.ts
```

## 结果与口径

- `raw/main.txt` 保留完整输出。
- 外层 `try/catch` 没有接住定时器回调中的 throw；演示注册了 `uncaughtException`，所以进程没有在本次 demo 中退出。
- 这不是生产恢复证据。Node 进程在未捕获异常后是否可继续服务，必须按进程监督、优雅关闭和任务恢复方案另行验收。
