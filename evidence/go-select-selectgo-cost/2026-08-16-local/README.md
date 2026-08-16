# go-select-selectgo-cost：本机证据

## 命令

```bash
cd experiments
go test ./go-runtime-boundary -run '^$' -bench '^BenchmarkSelect(1|2|4|8)CaseDefault$' -benchmem -benchtime=1s -cpu=8
go run ./go-runtime-boundary/cmd/select-fairness -n=1000000
```

## 口径

- 多 case 基准使用已经创建但没有 ready value 的 channel，并带 `default`；它测的是非阻塞扫描与仲裁，不是阻塞等待或 channel 往返。
- `select-fairness` 每轮让两个 buffered channel 都保持一个 ready value，统计 Go runtime 在该输入下的选择比例。
- `ns/op` 与比例都绑定 Go 版本、架构、`GOMAXPROCS`、编译器和迭代次数；公平性 smoke 不是形式化随机性证明，也不替代源码阅读。
