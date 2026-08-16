# typescript-agent-state-machine：本机证据

## 命令

```bash
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node experiments/ts-state-machine/fsm.ts
```

## 结果与口径

- `raw/fsm.txt` 保留完整输出。
- 隐式实现把终态后的事件静默留在旧状态；显式实现走 `transition` 并打印 `非法转移: done x tool_result`。
- 这只验证纯状态转移的本机行为；`requestId` 迟到结果、持久化恢复和跨进程幂等没有在这个 demo 中声称已验证。
