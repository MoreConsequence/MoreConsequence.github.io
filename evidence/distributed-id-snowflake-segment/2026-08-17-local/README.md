# Snowflake 时钟回拨证据

这份快照运行 `experiments/snowflake/main.go` 的教学实现，验证三个状态：正常生成、2ms 回拨时等待追平并继续保持单调、100ms 回拨超过 50ms 预算后拒绝发号。它不证明生产实现的线程安全、跨进程 worker 分配、NTP 行为或数据库号段的原子更新。

## 命令

```bash
cd experiments
go run ./snowflake
```

## 边界

- `wallTime` 是模拟时钟；`time.Sleep` 只是演示等待策略，不是生产时钟校正机制。
- 这段实现没有并发保护、worker ID 注册、持久化状态和序列耗尽恢复；只能作为状态机示例。
- 64 位 Snowflake 位布局、号段原子预留和 UUID 的排序/隐私属性仍应按各自协议与存储实现验证。
