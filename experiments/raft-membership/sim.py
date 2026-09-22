# 验证与模拟脚本：Raft 成员变更多数派断层、脑裂重现与联合一致性 (Joint Consensus) 鸽巢证明
# 运行方式：python3 experiments/raft-membership/sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. 朴素直接切换导致“无交集多数派”与脑裂重现
# 设老配置 3 节点，新配置 5 节点
C_old = {"A", "B", "C"}
C_new = {"A", "B", "C", "D", "E"}

majority_old_size = len(C_old) // 2 + 1  # 2
majority_new_size = len(C_new) // 2 + 1  # 3

# 在直接切换窗口中，假设 A、B 尚未收到配置变更消息 (处于 C_old)，而 C、D、E 已应用 C_new
Q_old = {"A", "B"}        # 满足 C_old 的多数派 (2 >= 2)
Q_new = {"C", "D", "E"}  # 满足 C_new 的多数派 (3 >= 3)

intersection = Q_old.intersection(Q_new)
check("直接切换时存在互相隔离的无交集多数派", len(intersection) == 0, f"Q_old={Q_old}, Q_new={Q_new}, 交集={intersection}")

# 证明双 Leader 脑裂发生：A 和 B 选出 Leader_1，C/D/E 选出 Leader_2
split_brain_possible = len(intersection) == 0 and len(Q_old) >= majority_old_size and len(Q_new) >= majority_new_size
check("系统在无交集多数派下必然发生双主脑裂", split_brain_possible == True)

# 2. 联合一致性 (Joint Consensus, C_old,new) 鸽巢原理证明
# 联合一致性要求：任何决策必须同时获得 C_old 的多数派 AND C_new 的多数派确认！
def is_joint_consensus_majority(voters):
    old_votes = voters.intersection(C_old)
    new_votes = voters.intersection(C_new)
    return len(old_votes) >= majority_old_size and len(new_votes) >= majority_new_size

# 遍历所有可能的投票子集，验证任意两个联合多数派必定存在非空交集
all_nodes = list(C_new)
from itertools import combinations

all_subsets = []
for r in range(1, len(all_nodes) + 1):
    for s in combinations(all_nodes, r):
        all_subsets.append(set(s))

joint_majorities = [s for s in all_subsets if is_joint_consensus_majority(s)]

all_joint_pairs_intersect = True
for q1 in joint_majorities:
    for q2 in joint_majorities:
        if len(q1.intersection(q2)) == 0:
            all_joint_pairs_intersect = False
            break

check("联合多数派数量非零", len(joint_majorities) > 0, f"共 {len(joint_majorities)} 组")
check("任意两个联合一致性多数派必定存在非空交集 (零脑裂保证)", all_joint_pairs_intersect == True)

# 3. 单节点变更约束 (Single-Server Changes)
# 只要每次仅增删 1 个节点，任意多数派必有交集
def single_server_intersection_proof():
    # 场景: 3 节点 -> 4 节点 (增加 D)
    C1 = {"A", "B", "C"}
    C2 = {"A", "B", "C", "D"}
    # 寻找是否存在 Q1 in C1 (size >= 2) 和 Q2 in C2 (size >= 3) 使得交集为空
    q1_list = [set(c) for c in combinations(C1, 2)]
    q2_list = [set(c) for c in combinations(C2, 3)]
    disjoint_found = False
    for q1 in q1_list:
        for q2 in q2_list:
            if len(q1.intersection(q2)) == 0:
                disjoint_found = True
    return not disjoint_found

check("单节点变更保证任意相邻配置多数派必有交集", single_server_intersection_proof() == True)

# 4. 单节点变更的流水线陷阱 (Pipelining Hazard)
# 若连续发起增删节点且不等待前一条日志 Commit，等价于多节点变更，重新退化为脑裂风险
# 验证：若同时流水线加入 D 和 E，再次退化为 C_old(3) 和 C_new(5)，交集为空
pipelining_risk_exists = len({"A", "B"}.intersection({"C", "D", "E"})) == 0
check("未提交即流水线发起下一次变更将重新引发无交集断层", pipelining_risk_exists == True)

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 6)")
print("="*60)
sys.exit(1 if fails else 0)
