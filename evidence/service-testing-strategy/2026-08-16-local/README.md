# service-testing-strategy：本机证据

## 命令

```bash
cd experiments/service
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node node_modules/vitest/vitest.mjs run --coverage
```

## 结果

- 3 个 test files、18 个 tests 通过。
- Statements：80%（120/150）。
- Branches：71.62%（53/74）。
- Functions：67.56%（25/37）。
- Lines：81.48%（110/135）。

完整终端摘要保存在 `raw/vitest-coverage.txt`。覆盖率只描述当前 service 源码被这些本地测试执行的比例，不代表 PostgreSQL、网络、多实例、重启或线上故障覆盖。
