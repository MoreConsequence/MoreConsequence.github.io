# Go slice growth probe

这份快照只证明当前 Go 版本、`[]int`、从零开始逐个 `append` 到指定长度时观察到的容量变化和累计搬运计数。`copied_elements` 是每次扩容前旧长度之和，不等于 allocator 的 B/op、GC 成本或真实服务延迟。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Go：go1.25.1 darwin/arm64
- 输入：`[]int`，初始容量 0，逐个追加；分别运行 `-limit=1000000` 和 `-limit=65536`
- 命令：

  ```bash
  cd experiments
  go run ./go-runtime-boundary/cmd/slice-growth -limit=1000000
  go run ./go-runtime-boundary/cmd/slice-growth -limit=65536
  ```

- 原始输出：`raw/slice-growth.txt`
