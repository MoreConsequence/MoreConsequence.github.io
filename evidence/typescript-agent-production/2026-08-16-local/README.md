# typescript-agent-production：本机证据

## 命令

```bash
cd experiments/ts-agent-prod
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node prod.ts
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node --test prod.test.mjs
```

## 结果

`raw/demo.txt` 保存演示程序输出；测试摘要保存在 `raw/test.txt`。并发合并、失败后重试、整数微美元换算和预算拒绝均在当前单进程实现中通过。这里没有 PostgreSQL 唯一约束、重启恢复、多实例竞争或真实模型账单证据。
