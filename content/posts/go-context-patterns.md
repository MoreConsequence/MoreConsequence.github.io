---
title: "理解 Go Context 的边界"
description: "Context 负责传递取消与期限，但它不该变成无类型的参数口袋。"
publishedAt: "2026-07-21"
updatedAt: "2026-07-23"
tags: ["Go", "并发", "工程实践"]
featured: true
series: "Go 的设计边界"
---

`context.Context` 是 Go 服务端代码里最常见、也最容易被滥用的接口之一。它看似能携带任何值，于是常常被当成方便的隐式参数表。

## Context 只回答三个问题

一个函数接收 Context，通常只需要回答：

- 这次工作是否已经取消？
- 最晚应该在什么时候结束？
- 请求链路上有哪些真正属于基础设施的元数据？

业务参数不在这份清单里。订单号、分页大小和权限策略应该以明确的参数或类型出现。

## 取消信号必须向下传播

创建子任务时，继续传入已有的 Context：

```go
func (s *Service) LoadProfile(ctx context.Context, id string) (Profile, error) {
    profile, err := s.repo.Find(ctx, id)
    if err != nil {
        return Profile{}, fmt.Errorf("load profile: %w", err)
    }
    return profile, nil
}
```

不要在调用链中用 `context.Background()` 重新开始。那会切断上游的超时和取消信号，让已经失去意义的工作继续消耗资源。

## 取消不是清理

`ctx.Done()` 告诉协程“可以停了”，却不会替你关闭文件、回滚事务或回收连接。资源清理仍然应该使用清晰的所有权和 `defer`。

```go
select {
case result := <-resultCh:
    return result, nil
case <-ctx.Done():
    return Result{}, ctx.Err()
}
```

## Value 要克制

适合放进 Context 的值通常横跨进程边界，又不属于业务输入，例如 trace ID。即便如此，也应使用私有 key 类型与封装函数，避免键冲突和散落的类型断言。

边界越清楚，函数签名越诚实，代码就越容易测试。
