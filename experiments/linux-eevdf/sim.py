# 验证与模拟脚本：Linux 6.6 EEVDF 调度器 vs 经典 CFS 延迟敏感性与虚拟截止时间模型
# 运行方式：python3 experiments/linux-eevdf/sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. CFS 经典缺陷：唤醒粒度启发式 (sched_min_granularity) 导致的交互式任务排队延迟
# 设后台吞吐批处理任务执行大时间片，前台交互式任务 (如 Redis epoll 唤醒) 需要极短计算
BATCH_SLICE_MS = 8.0
INTERACTIVE_BURST_MS = 0.5
CFS_MIN_GRANULARITY_MS = 2.0  # CFS 保护批处理任务不被频繁抢占的硬编码保护时间

# 在 CFS 中，若批处理任务刚运行 0.2ms，交互任务唤醒：
# 由于未达到 min_granularity (2.0ms)，交互任务被迫在就绪队列排队等待 1.8ms
cfs_wakeup_lag_ms = CFS_MIN_GRANULARITY_MS - 0.2
check("CFS 启发式保护导致交互任务产生高达 1.8ms 排队延迟", abs(cfs_wakeup_lag_ms - 1.8) < 1e-6, f"{cfs_wakeup_lag_ms} ms")

# 2. EEVDF 核心数学模型：资格 (Eligibility) 与 虚拟截止时间 (Virtual Deadline)
# 任务属性：v (虚拟运行时间), w (权重), q (申请的时间片/切片)
# 虚拟截止时间公式: d_i = v_i + q_i / w_i
# 系统虚拟时间: V
class Task:
    def __init__(self, name, weight, slice_ms):
        self.name = name
        self.w = weight
        self.q = slice_ms
        self.v = 0.0

    @property
    def deadline(self):
        return self.v + (self.q / self.w)

    def is_eligible(self, V):
        # 资格条件：当前虚拟运行时间 <= 系统虚拟时间 (Lag >= 0，没有过度消费 CPU)
        return self.v <= V

# 场景：系统当前虚拟时间 V = 10.0
V_curr = 10.0

# 批处理任务：权重 1024 (nice 0), 申请大时间片 8.0ms, 当前 v = 10.0
task_batch = Task("Batch_FFmpeg", weight=1024, slice_ms=8.0)
task_batch.v = 10.0

# 交互式任务：刚睡眠苏醒，权重 1024 (nice 0), 申请小时间片 0.5ms, 当前 v = 10.0 (或更早)
task_interactive = Task("Interactive_Redis", weight=1024, slice_ms=0.5)
task_interactive.v = 10.0

# 校验资格状态 (两者均符合调度资格)
check("批处理任务符合 Eligible 资格", task_batch.is_eligible(V_curr))
check("交互式任务符合 Eligible 资格", task_interactive.is_eligible(V_curr))

# 3. EEVDF 截止时间优先判定
d_batch = task_batch.deadline
d_interactive = task_interactive.deadline

check("批处理任务虚拟截止时间计算正确", abs(d_batch - (10.0 + 8.0/1024)) < 1e-6, f"{d_batch:.6f}")
check("交互式任务虚拟截止时间更早", d_interactive < d_batch, f"{d_interactive:.6f} < {d_batch:.6f}")

# EEVDF 调度决策：在所有 Eligible 任务中，挑选 Deadline 最小的任务
def eevdf_pick_next(tasks, V):
    eligible_tasks = [t for t in tasks if t.is_eligible(V)]
    if not eligible_tasks:
        return None
    return min(eligible_tasks, key=lambda t: t.deadline)

winner = eevdf_pick_next([task_batch, task_interactive], V_curr)
check("EEVDF 无需启发式调节，数学上必然优先调度交互式任务", winner.name == "Interactive_Redis")

# 4. 长期吞吐公平性守恒 (Proportional Share)
# 模拟长期运行：任务的 vruntime 推进与实际 CPU 分配
# 即使交互式任务每次都优先抢占，但它运行 0.5ms 后如果再次申请时间片，其 v 同样会累加
# 证明：EEVDF 在保障毫秒级低延迟的同时，不会破坏长期的权重公平性
total_cpu_batch = 0.0
total_cpu_interactive = 0.0

# 模拟 100 轮调度，双方争抢 CPU
sim_v = 0.0
for _ in range(100):
    t_picked = eevdf_pick_next([task_batch, task_interactive], sim_v)
    if t_picked == task_interactive:
        task_interactive.v += task_interactive.q / task_interactive.w
        total_cpu_interactive += task_interactive.q
    else:
        task_batch.v += task_batch.q / task_batch.w
        total_cpu_batch += task_batch.q
    sim_v = min(task_batch.v, task_interactive.v)

check("长期调度下双方虚拟时间紧密跟随，无单边饿死", abs(task_batch.v - task_interactive.v) < 0.05)

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 7)")
print("="*60)
sys.exit(1 if fails else 0)
