# 定窗 vs 滑窗：窗口边界那 2ms 到底能进多少请求。
# 纯标准库、确定性输入、无随机。运行：python3 sim.py
LIMIT = 100  # 100/秒
WINDOW = 1.0


class FixedWindow:
    def __init__(self):
        self.window_start = 0.0
        self.count = 0

    def allow(self, t):
        if t - self.window_start >= WINDOW:
            self.window_start = t
            self.count = 0
        if self.count < LIMIT:
            self.count += 1
            return True
        return False


class SlidingLog:
    def __init__(self):
        self.hits = []

    def allow(self, t):
        self.hits = [h for h in self.hits if h > t - WINDOW]
        if len(self.hits) < LIMIT:
            self.hits.append(t)
            return True
        return False


class SlidingCounter:
    def __init__(self):
        self.prev = 0
        self.cur = 0
        self.window_start = 0.0

    def allow(self, t):
        if t - self.window_start >= WINDOW:
            self.prev, self.cur = self.cur, 0
            self.window_start = t
        elapsed = (t - self.window_start) / WINDOW
        estimate = self.prev * (1 - elapsed) + self.cur
        if estimate < LIMIT:
            self.cur += 1
            return True
        return False


def run(limiter, arrivals):
    return sum(1 for t in arrivals for _ in [limiter.allow(t)] if _)


# 攻击形状：窗口1末尾 100 个（t=0.999），窗口2开头 100 个（t=1.001）
burst = [0.999] * 100 + [1.001] * 100
# 对照形状：均匀到达 200 个（10ms 间隔，2 秒）
uniform = [i * 0.01 for i in range(200)]

print("攻击：窗口边界 ±1ms 各 100 请求（2ms 内 200 请求）")
for name, cls in [("定窗      ", FixedWindow), ("滑窗日志  ", SlidingLog), ("滑窗计数  ", SlidingCounter)]:
    admitted = run(cls(), burst)
    print(f"{name} 放行 {admitted}/200（峰值倍数 {admitted / LIMIT:.2f}x）")

print("\n对照：均匀 100/s × 2s（200 请求）")
for name, cls in [("定窗      ", FixedWindow), ("滑窗日志  ", SlidingLog), ("滑窗计数  ", SlidingCounter)]:
    admitted = run(cls(), uniform)
    print(f"{name} 放行 {admitted}/200")

print("\n内存代价（100/s 稳态，窗口内需记多少）：")
print("定窗 2 个整数；滑窗计数 3 个数；滑窗日志 100 个时间戳（随 LIMIT 线性增长）")
