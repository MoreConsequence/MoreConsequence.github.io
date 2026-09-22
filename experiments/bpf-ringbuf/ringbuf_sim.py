# 验证与模拟脚本：BPF Ring Buffer MPSC 无锁队列状态机、内存开销与跨 CPU 乱序提交
# 运行方式：python3 experiments/bpf-ringbuf/ringbuf_sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. 内存膨胀对比 (Per-CPU vs Shared MPSC)
# 在现代服务器 (例如 128 核 AMD EPYC 或 Intel Xeon) 上
CPUS = 128
BUF_SIZE_MB = 16

perf_buffer_total_mb = CPUS * BUF_SIZE_MB  # 128 * 16 = 2048 MB = 2 GB
ringbuf_total_mb = BUF_SIZE_MB             # 16 MB 共享

ratio = perf_buffer_total_mb / ringbuf_total_mb
check("Per-CPU Perf Buffer 内存开销为 128 倍膨胀", ratio == 128, f"Perf Buffer={perf_buffer_total_mb}MB vs RingBuf={ringbuf_total_mb}MB")

# 2. BPF Ringbuf 头部常数与掩码核对 (Linux 内核 kernel/bpf/ringbuf.c 源码)
BPF_RINGBUF_BUSY_BIT = 1 << 31     # 0x80000000 最高位表示写入中
BPF_RINGBUF_DISCARD_BIT = 1 << 30  # 0x40000000 次高位表示已废弃
LEN_MASK = 0x3FFFFFFF              # 低 30 位表示真实有效载荷长度

check("Busy 位掩码定义", BPF_RINGBUF_BUSY_BIT == 0x80000000)
check("Discard 位掩码定义", BPF_RINGBUF_DISCARD_BIT == 0x40000000)

# 3. 模拟并发 MPSC 环形队列状态机
class MockRingBuf:
    def __init__(self, size=4096):
        self.size = size
        self.mask = size - 1
        self.prod_pos = 0  # 64 位生产者游标 (全局单调递增)
        self.cons_pos = 0  # 64 位消费者游标 (用户态只读推进)
        self.data = bytearray(size)
        self.headers = {}  # pos -> (len_with_flags, payload)

    def reserve(self, length):
        # 对齐到 8 字节边界
        rounded_len = (length + 7) & ~7
        total_len = 8 + rounded_len  # 8 字节 header + payload
        
        # 检查是否环形溢出 (Prod - Cons > size)
        if self.prod_pos + total_len - self.cons_pos > self.size:
            return None  # 缓冲区满，触发丢弃计数 (Dropped events)
        
        pos = self.prod_pos
        self.prod_pos += total_len  # atomic64_add 推进生产者游标
        
        # 写入 busy 标志位
        len_with_flags = length | BPF_RINGBUF_BUSY_BIT
        self.headers[pos] = {"flags": len_with_flags, "payload": None, "total_len": total_len}
        return pos

    def submit(self, pos, payload):
        entry = self.headers[pos]
        entry["payload"] = payload
        # 模拟 smp_store_release: 清除 BUSY 位，使其对消费者立即可见
        entry["flags"] &= ~BPF_RINGBUF_BUSY_BIT

    def discard(self, pos):
        entry = self.headers[pos]
        # 设置 DISCARD 标志位，并清除 BUSY 位
        entry["flags"] = (entry["flags"] & ~BPF_RINGBUF_BUSY_BIT) | BPF_RINGBUF_DISCARD_BIT

    def consume(self):
        read_events = []
        while self.cons_pos < self.prod_pos:
            entry = self.headers.get(self.cons_pos)
            if not entry:
                break
            
            # 模拟 smp_load_acquire 检查 header
            flags = entry["flags"]
            if flags & BPF_RINGBUF_BUSY_BIT:
                # 关键机理：遇到了先 reserve 但未完成 submit 的快照！
                # 消费者必须在此暂停等待，禁止跳过，保证严格因果序
                break
            
            total_len = entry["total_len"]
            if not (flags & BPF_RINGBUF_DISCARD_BIT):
                # 正常提交事件
                read_events.append(entry["payload"])
            
            # 推进消费者游标
            self.cons_pos += total_len
        return read_events

rb = MockRingBuf()

# 4. 测试场景 A: CPU 0 先 reserve，CPU 1 后 reserve 但先 submit (乱序提交)
pos_cpu0 = rb.reserve(32)  # CPU 0 预留 0..48
pos_cpu1 = rb.reserve(48)  # CPU 1 预留 48..104

# 此时 CPU 1 先写完并提交
rb.submit(pos_cpu1, "CPU1_DATA")

# 用户态消费者尝试消费
events_mid = rb.consume()
# 此时由于 pos_cpu0 还是 BUSY 状态，消费者不能越过 CPU 0 读 CPU 1！
check("CPU 0 未提交时，消费者被 BUSY 位阻断，读取 0 条", len(events_mid) == 0, f"read={len(events_mid)}")

# 随后 CPU 0 完成写入并提交
rb.submit(pos_cpu0, "CPU0_DATA")

# 用户态再次消费
events_final = rb.consume()
check("CPU 0 提交后，消费者严格按预留顺序消费两条数据", events_final == ["CPU0_DATA", "CPU1_DATA"], f"read={events_final}")

# 5. 测试场景 B: 异常分支丢弃 (Discard)
pos_err = rb.reserve(16)
rb.discard(pos_err)
pos_ok = rb.reserve(16)
rb.submit(pos_ok, "NORMAL_DATA")

events_discard = rb.consume()
check("Discard 记录被消费者自动跳过，仅返回有效数据", events_discard == ["NORMAL_DATA"], f"read={events_discard}")

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 6)")
print("="*60)
sys.exit(1 if fails else 0)
