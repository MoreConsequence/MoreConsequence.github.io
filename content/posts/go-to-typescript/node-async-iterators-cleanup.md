---
title: "async 生成器的 cleanup：break 会跑，弃置不会"
description: "for-await 提前 break 会调 return()（finally 照跑），但手动 next() 两次后丢弃引用，cleanup 静默不跑。4 断言实测：A/C/D 的 finally 全触发，B 的 flags 保持 {}。"
publishedAt: "2026-09-20"
tags: ["TypeScript", "async", "生成器", "工程实践"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** 纠正一个流传的误解：`for await...of` 提前 `break` **会**调用迭代器的 `return()`，`finally` 照跑——规范保证的。真正的坑是手动驱动：调了两次 `.next()` 然后丢弃引用走人，`return()` 永远没人调，`finally` 里的连接释放/文件关闭静默不跑（顶多等 GC，心跳不定）。实测（`experiments/node-async-iterators/demo.mjs`，4 断言全过）：break 退出 `flags={"A":true}`，显式 `return()` 同样触发，异常退出同样触发；唯独弃置引用 `flags={}`。

## 一、四种退出的真相

| 退出方式 | `return()` 被调？ | `finally` 跑？ |
| --- | --- | --- |
| `for await` + `break` | 是（规范） | 是 |
| `for await` + 异常 | 是（`throw()` 进生成器） | 是 |
| 手动 `.next()` + 显式 `.return()` | 是（你调的） | 是 |
| 手动 `.next()` 后弃置引用 | **否** | 否（等 GC，不确定） |

## 二、生产 bug 长什么样

```ts
// ❌ 分页游标：出错就return，连接泄漏
const iter = queryPages(db);
await iter.next();
await iter.next();
return res.json(cached); // 迭代器被弃置，游标连接不释放
```

```ts
// ✅ 二选一：要么 for-await 包起来，要么显式 return()
const iter = queryPages(db);
try {
  await iter.next();
  await iter.next();
  return res.json(cached);
} finally {
  await iter.return(); // 无论如何释放
}
```

`for await` 是带自动 `return()` 的语法糖；一旦你手动 `.next()`，cleanup 的责任就回到你手里——和 Go 里 `resp.Body.Close()` 必须显式调是同一条规则。

## 三、Agent 循环的对应

[Agent 状态机](/writing/typescript-agent-state-machine)的工具循环如果用 async 生成器实现"流式产出中间步骤"，调用方提前取消（见 [AbortSignal 取消边界](/writing/abort-signal-tool-side-effects)）时：`for await` + `break` 能保证工具持有的资源释放；手动驱动就必须在取消路径上补 `.return()`。取消只停后续工作，cleanup 还是要有人调——两篇讲的是同一件事的两面。

## 四、证据卡与边界

原始输出：`evidence/node-async-iterators/`（2026-09-20-local）。不支持：GC 最终回收弃置生成器的时延分布——只验证了 50ms 窗口内不跑，未验证"永不跑"。

## 参考资料

- TC39 async iteration proposal（`for-await` 调用 `return()` 语义，ES2018）；MDN AsyncGenerator.return()，<https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/return>（2026-09-20 核对）
- 前篇：Agent 状态机，`/writing/typescript-agent-state-machine`
- 前篇：streams 与背压，`/writing/typescript-streams-backpressure`
