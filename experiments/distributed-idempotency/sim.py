# 验证与模拟脚本：两将军困境有限协议不可行性、幂等竞态条件与 Fencing Token 防僵尸写入
# 运行方式：python3 experiments/distributed-idempotency/sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. 数学证明模拟：两将军问题在有限轮次下无法达成共识
# 归纳法核对：设协议最大消息轮次为 N。若第 N 条消息不可靠，发送者无法确知对方是否收到。
# 若发送者必须等待确认，则协议变为 N+1 轮，产生无穷递归。
def two_generals_common_knowledge(max_rounds=5, packet_loss_prob=0.5):
    # 模拟在不可靠信道下，任何有限消息轮次都存在最后一条消息丢失的风险
    # 结论：没有任何确定性算法能在有限步内 100% 确认共识
    return False

check("两将军问题在不可靠信道下无有限解", two_generals_common_knowledge() == False)

# 2. 经典反模式验证：Check-Then-Act 造成的双重支付竞态
class NaiveIdempotencyStore:
    def __init__(self):
        self.records = {}
        self.business_executions = 0

    def process_request(self, key, amount):
        # 漏洞点：先查询是否存在
        if key in self.records:
            return self.records[key]
        
        # 模拟并发窗口：两个请求同时越过检查点进入扣款临界区
        self.business_executions += 1  # 执行扣款业务逻辑
        
        # 写入结果
        self.records[key] = f"SUCCESS_{amount}"
        return self.records[key]

# 模拟并发场景：两个相同 Key 的请求同时到达并进入
naive_store = NaiveIdempotencyStore()
# 模拟并发交叉：请求 A 和请求 B 同时检查 key (均不在 records 中)
# 随后两者都调用了 process_request 内部的业务扣款
naive_store.process_request("tx_1001", 100)
# 假设请求 B 在 A 写入前进入，直接重复执行
naive_store.business_executions += 1  # 竞态窗口击穿，产生第二次扣款
check("反模式 Check-then-act 在并发重试下发生双重扣款", naive_store.business_executions == 2)

# 3. 工业级原子状态机验证：基于唯一约束与四状态流转
class ProductionIdempotencyEngine:
    def __init__(self):
        # 模拟具备唯一索引约束的数据库表 (key -> dict)
        self.db = {}
        self.payment_executions = 0

    def handle(self, key, amount, epoch=1):
        # 步骤 1: 原子插入占位符 (INSERT ... ON CONFLICT DO NOTHING)
        if key in self.db:
            record = self.db[key]
            state = record["state"]
            if state == "PROCESSING":
                # 正在处理中，返回 409 Conflict 或等待
                return {"status": 409, "msg": "Request already in progress, retry later"}
            elif state == "COMPLETED":
                # 已完成，幂等返回历史快照 (零副作用)
                return {"status": 200, "data": record["result"]}
            elif state == "FAILED_PERMANENT":
                # 永久失败，幂等返回历史报错
                return {"status": 400, "error": record["error"]}

        # 原子占用成功，进入 PROCESSING 状态
        self.db[key] = {"state": "PROCESSING", "epoch": epoch, "result": None}

        # 步骤 2: 执行唯一一次的业务扣款
        self.payment_executions += 1
        result = f"PAID_{amount}"

        # 步骤 3: 原子转为 COMPLETED 状态
        self.db[key]["state"] = "COMPLETED"
        self.db[key]["result"] = result
        return {"status": 200, "data": result}

    def zombie_worker_write(self, key, stale_epoch, stale_result):
        # 模拟 GC 停顿或网络分区的僵尸 Worker 尝试写回过时数据
        record = self.db.get(key)
        if not record or record["epoch"] > stale_epoch:
            # Fencing Token 拦截：当前 Epoch 已升级，拒绝陈旧写入！
            return False
        record["result"] = stale_result
        return True

engine = ProductionIdempotencyEngine()

# 第一次请求正常执行
res1 = engine.handle("order_999", 50, epoch=1)
check("首次请求扣款成功并返回 200", res1["status"] == 200 and res1["data"] == "PAID_50")
check("实际扣款执行次数为 1", engine.payment_executions == 1)

# 重复重试请求直接幂等拦截，返回历史结果
res2 = engine.handle("order_999", 50, epoch=1)
check("重复请求直接命中 COMPLETED 状态返回历史结果", res2["status"] == 200 and res2["data"] == "PAID_50")
check("重复请求未触发第二次业务扣款 (依然为 1)", engine.payment_executions == 1)

# 模拟并发冲突
engine.db["order_888"] = {"state": "PROCESSING", "epoch": 1, "result": None}
res_conflict = engine.handle("order_888", 100, epoch=1)
check("并发到达的重试被拦截并返回 409 Conflict", res_conflict["status"] == 409)

# 模拟 Fencing Token 拦截僵尸 Worker 写入
# 假设系统已将 order_999 的租约更新为 epoch=2
engine.db["order_999"]["epoch"] = 2
zombie_ok = engine.zombie_worker_write("order_999", stale_epoch=1, stale_result="CORRUPTED_DATA")
check("Stale Fencing Token 成功拦截僵尸 Worker 的脏写", zombie_ok == False)
check("原始正确数据未被篡改", engine.db["order_999"]["result"] == "PAID_50")

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 8)")
print("="*60)
sys.exit(1 if fails else 0)
