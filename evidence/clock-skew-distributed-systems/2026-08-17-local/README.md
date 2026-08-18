# clock-skew-distributed-systems evidence

这是 `experiments/snowflake/main.go` 的确定性本机模拟，不是对操作系统 NTP、Redis、数据库租约或多节点时钟的验证。

## 命令

从仓库根目录运行：

```bash
cd experiments
go run ./snowflake
```

程序把墙上时间模拟为毫秒整数：回拨 2ms 时在 50ms 预算内等待追平，回拨 100ms 时拒绝生成 ID。它只证明这个教学模型的分支与输出。

## 原始输出

见 `raw/snowflake.txt`。
