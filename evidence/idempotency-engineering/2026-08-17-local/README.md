# idempotency-engineering evidence

这是 `experiments/idempotency/main.go` 的本机教学模型输出，不是数据库、Redis、支付方或多实例证据。

## 命令

从仓库根目录运行：

```bash
cd experiments
go run ./idempotency
```

程序用一个 `sync.Mutex` 把“占位、执行、回填”串行化，模拟单进程内的唯一 claim 与结果重放。它没有模拟进程崩溃、重启、事务回滚、lease/fencing、外部支付或数据库唯一约束，因此只能支持文章中对教学模型的描述。

## 原始输出

见 `raw/idempotency.txt`。
