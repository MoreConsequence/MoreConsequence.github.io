---
title: "RSS、heapUsed 与 GC 后保留量：三张表各回答一个问题"
description: "本机 Node 实验：200MB 堆内对象下 RSS 与 heapUsed 在分配、释放、GC、再分配四个阶段的行为，以及 Buffer 大对象为什么 heapUsed 永远看不到——内存监控要多路，不能只看一张表。"
publishedAt: "2026-08-19"
tags: ["性能", "Node.js", "观测", "内存"]
draft: false
featured: false
updatedAt: "2026-08-19"
---

**TL;DR：** 内存监控不能只看一个数。本机 Node 实验（堆内 200MB 数组）四阶段实测：分配时 RSS 211.3MB / heapUsed 156.3MB 同步涨；**释放引用但不 GC，两层都不降**（垃圾还留在堆里，RSS 和 heapUsed 同时骗你）；**GC 后 RSS 59.4MB、heapUsed 4.4MB——都降了 70%+**（V8 会把空闲页还给 OS）；再分配时从归还后的水位重新申请。另一组实验暴露更隐蔽的坑：分配 200MB `Buffer` 时 RSS 涨到 247.4MB，**heapUsed 却几乎不动（3.6→3.7MB）**——Buffer/TypedArray 主体在 V8 堆外。结论：**RSS 回答"进程吃了多少"、heapUsed 回答"V8 堆里有多少活对象"、GC 后保留量回答"还有多少没法还"**——三张表各有一个主人，只盯一张必然漏。

## 一、三张表各回答什么问题

| 指标 | 回答的问题 | 看不见的 |
| :--- | :--- | :--- |
| RSS（常驻内存） | 这个进程现在从 OS 手里占了多少物理内存 | 页缓存/共享库的归属、堆内细节 |
| heapUsed（V8 堆内活对象） | JS 对象占了多大 | Buffer/TypedArray 主体、原生模块、JIT 代码页 |
| GC 后保留量（gc 后 heapUsed） | 把垃圾清掉后还剩多少——即"必须常驻"的下界 | 被持有的资源（文件描述符、worker）不算堆 |

追问一句就能抓住区别：你想证明"内存泄漏"，该看哪张？——GC 后保留量的增长。你想证明"Node 进程吃掉了机器"，看 RSS。你想证明"这段 JS 代码本身分配了多少"，看 heapUsed。三张表各有一个主人，一份监控面板至少要两路（RSS + heapUsed），只盯 heapUsed 会漏掉最大的一块内存。

## 二、本机四阶段实验：堆内对象

同进程、显式 GC、固定负载，四阶段快照（完整输出见证据目录）：

| 阶段 | RSS | heapUsed | heapTotal |
| :--- | ---: | ---: | ---: |
| 启动后 | 44.3MB | 3.6MB | 5.3MB |
| 堆内 200MB（引用中） | 211.3MB | 156.3MB | 285.9MB |
| **释放引用，未 GC** | 211.3MB | 156.3MB | 285.9MB |
| **GC 之后** | **59.4MB** | **4.4MB** | 133.3MB |
| 再分配 100MB（复用堆） | 136.1MB | 80.7MB | 209.9MB |

三个必然注意的点：

1. **"释放引用"不是释放内存。** 阶段 2→3 两层都不动。堆里的垃圾只有 GC 才搬走；RSS 也只有 GC+归还才降。这在监控里意味着：heapUsed 平稳增长 ≠ 泄漏（可能是垃圾堆积且 GC 还没跑），把问题留到 GC 后校验。
2. **GC 之后才能测"保留量"。** 本实验 GC 后 heapUsed 4.4MB（活跃对象本身极小）而 RSS 59.4MB——heapTotal 133.3MB 这个"已经圈了但没用完"的部分，正是"GC 后保留量"的另一种表述：V8 宁可留着 133MB 的堆空间（下次分配免了向 OS 要）也不马上还。**监控里真正代表"增长趋势"的是 GC 后的 heapUsed，而不是任意时刻的 heapUsed**。
3. **再分配从归还水位起步。** 100MB 分配后 RSS 136.1MB，比 211.3MB 少了约 75MB——堆高水位没有复现。如果监控只记"峰值 RSS"，会误以为一次 200MB 峰值是常驻。

## 三、对照实验：Buffer 大对象为什么 heapUsed 看不见

同样是"分配 200MB"，这次用 `Buffer.alloc(1MB × 200)`：

| 阶段 | RSS | heapUsed |
| :--- | ---: | ---: |
| 启动后 | 44.4MB | 3.6MB |
| 分配 Buffer 200MB | 247.4MB | **3.7MB** |

heapUsed 几乎不动。原因：Node 的 `Buffer` / `TypedArray` 底层数据块分配在 V8 堆外（ArrayBuffer 外部内存区），heapUsed 只统计 V8 堆内的 JS 对象外壳。**这个反例的价值：服务里凡是用 Buffer/流/原生模块（zlib、crypto、gRPC C++ 层）的，heapUsed 会系统性低估内存**——真实案例里"heapUsed 才 200MB 却 OOM"的通常就是这个原因。RSS 才有资格回答"进程吃了多少"。

## 四、监控姿势：至少两路 + 采样时机

* **至少 RSS + heapUsed 两路**，GC 后保留量作为第三个可选项（`global.gc()` 显式触发，或监控框架中的 gc 后快照）。
* **heapUsed 按"GC 后"采样**，而不是任意时刻：任意时刻的 heapUsed 混着"将要回收的垃圾 + 圈了未用的 heapTotal 冗余"，趋势被噪声掩盖。
* **只看平均值的直觉在这里也失效**：峰值 RSS 是"瞬间水位"，增长斜率才是"趋势"。两个都放面板。分位数与斜率的关系见 [p99 的一次测量不可信](/writing/p99-sample-size-confidence)。
* **RSS 短期上升不用慌，长期不降才要查**：分配→GC 往返的正常模式是 RSS 阶梯式上升又回落；如果只有上升没有回落，再看 GC 后保留量是否同步增长——那是泄漏的判别式。

复现：`experiments/memory-metrics/mem_probe.mjs`（Buffer 版）与 `mem_probe2.mjs`（堆内版），运行 `node --expose-gc`，原始输出与运行环境见 `evidence/memory-metrics-rss-heapused/2026-08-19-local/`。本机一次结果，绝对数字随 Node/引擎版本浮动；**四阶段相对行为（释放不降、GC 骤降、再分配从低水位开始）在同类负载上稳定**。

## 五、结论：内存监控的三张表各有一个主人

回到问题：内存指标不是"看哪个准"，而是"每个指标回答哪一层的问题"。RSS 回答 OS 视角的"吃了多少"，heapUsed 回答 V8 视角的"活对象多少"，GC 后保留量回答"没法还的下界"。一次 OOM 排查的正确起点是三路并读：RSS 高而 heapUsed 低 → 查 Buffer/原生模块/外部内存；heapUsed 高而 GC 后也高 → 查真泄漏；两者都低但进程被 OOM → 查堆外（线程栈、JIT、磁盘缓存）。**把三张表放一个面板，比任何单指标的告警规则都早发现失血。**

下一步可执行：给服务内存面板加 RSS、heapUsed、gc 后保留量三路，heapUsed 采样对齐 GC 后；下一次"heapUsed 涨了"的告警，先回答它是垃圾、保留量还是 Buffer——再决定是否动手。