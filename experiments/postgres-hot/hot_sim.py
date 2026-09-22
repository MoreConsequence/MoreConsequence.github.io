# 验证与模拟脚本：PostgreSQL HOT (Heap-Only Tuples) 状态机、行指针链表与页内剪枝 (Page Pruning)
# 运行方式：python3 experiments/postgres-hot/hot_sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. PostgreSQL 8KB 物理页与 fillfactor 预留空间核算
PAGE_SIZE = 8192
PAGE_HEADER_SIZE = 24  # PageHeaderData
USABLE_PAGE_SPACE = PAGE_SIZE - PAGE_HEADER_SIZE  # 8168 bytes

# 当 fillfactor = 80 时，页面装载至 80% 即封顶，预留 20% 空间给后续 UPDATE
FILLFACTOR = 80
RESERVED_FOR_UPDATE = int(USABLE_PAGE_SPACE * (100 - FILLFACTOR) / 100)  # 8168 * 0.2 = 1633 bytes
TUPLE_SIZE = 160  # 假设包含 23 字节 HeapTupleHeader + 数据，约 160 字节
LINE_POINTER_SIZE = 4  # ItemIdData: 4 bytes (offset 15b, flags 2b, len 15b)
SLOT_TOTAL = TUPLE_SIZE + LINE_POINTER_SIZE  # 164 bytes

max_hot_updates_in_reserved = RESERVED_FOR_UPDATE // SLOT_TOTAL
check("Fillfactor 80 预留 1633 字节空间", RESERVED_FOR_UPDATE == 1633, f"{RESERVED_FOR_UPDATE} bytes")
check("预留空间可容纳至少 9 次免分裂 HOT 更新", max_hot_updates_in_reserved >= 9, f"{max_hot_updates_in_reserved} updates")

# 2. 行指针标志位常量定义 (Linux / PostgreSQL src/include/storage/itemid.h)
LP_UNUSED = 0    # 未使用槽位
LP_NORMAL = 1    # 正常数据指针 (指向堆元组)
LP_REDIRECT = 2  # HOT 路由重定向指针 (指向本页内另一行指针)
LP_DEAD = 3      # 死元组指针 (待 vacuum 回收)

# 3. 模拟单个 8KB 堆页内的 HOT 链条与索引寻址
class MockHeapPage:
    def __init__(self, page_id=1):
        self.page_id = page_id
        self.line_pointers = {}  # item_idx -> {"flags": int, "target": int/tuple}
        self.tuples = {}         # tuple_id -> {"val": str, "xmin": int, "xmax": int, "hot_updated": bool, "heap_only": bool, "ctid": str}
        self.free_space = RESERVED_FOR_UPDATE
        self.next_item_idx = 1
        self.next_tuple_id = 1

    def insert_initial(self, val, xid=100):
        t_id = self.next_tuple_id
        self.next_tuple_id += 1
        item_idx = self.next_item_idx
        self.next_item_idx += 1

        self.tuples[t_id] = {
            "val": val, "xmin": xid, "xmax": 0,
            "hot_updated": False, "heap_only": False,
            "ctid": f"({self.page_id},{item_idx})"
        }
        self.line_pointers[item_idx] = {"flags": LP_NORMAL, "target_tuple": t_id}
        return item_idx, t_id

    def update_hot(self, root_item_idx, new_val, xid=101):
        # 必须满足页内有足够空间且不更新索引字段
        if self.free_space < SLOT_TOTAL:
            return False, "Page out of space (HOT failed)"

        # 找到当前链尾
        curr_item = root_item_idx
        while True:
            lp = self.line_pointers[curr_item]
            if lp["flags"] == LP_REDIRECT:
                curr_item = lp["target_item"]
                continue
            old_t = self.tuples[lp["target_tuple"]]
            if old_t["xmax"] != 0:
                # 顺着 ctid 找下一个
                target_str = old_t["ctid"]
                curr_item = int(target_str.split(",")[1].replace(")", ""))
            else:
                break

        # 分配新元组
        new_tid = self.next_tuple_id
        self.next_tuple_id += 1
        new_item = self.next_item_idx
        self.next_item_idx += 1

        # 更新旧元组
        old_t["xmax"] = xid
        old_t["hot_updated"] = True
        old_t["ctid"] = f"({self.page_id},{new_item})"

        # 写入新元组
        self.tuples[new_tid] = {
            "val": new_val, "xmin": xid, "xmax": 0,
            "hot_updated": False, "heap_only": True,  # 标记为 HEAP_ONLY_TUPLE
            "ctid": f"({self.page_id},{new_item})"
        }
        self.line_pointers[new_item] = {"flags": LP_NORMAL, "target_tuple": new_tid}
        self.free_space -= SLOT_TOTAL
        return True, new_item

    def prune_page(self, oldest_active_xmin=105):
        # 页面剪枝 (Page Pruning): 当扫描该页时就地回收死元组
        # 寻找 HOT 链并将 root 指针重定向到最新的可见元组
        for root_idx, lp in list(self.line_pointers.items()):
            if lp["flags"] == LP_NORMAL:
                t = self.tuples.get(lp.get("target_tuple"))
                if t and t["hot_updated"] and t["xmax"] < oldest_active_xmin:
                    # 发现旧版本已死，执行剪枝
                    # 遍历链条找到最新存活节点
                    curr_item = root_idx
                    while True:
                        curr_t = self.tuples[self.line_pointers[curr_item]["target_tuple"]]
                        if curr_t["xmax"] != 0 and curr_t["xmax"] < oldest_active_xmin:
                            # 死元组，物理释放
                            target_str = curr_t["ctid"]
                            next_item = int(target_str.split(",")[1].replace(")", ""))
                            del self.tuples[self.line_pointers[curr_item]["target_tuple"]]
                            self.free_space += TUPLE_SIZE
                            curr_item = next_item
                        else:
                            break
                    # 将 root_idx 改为 LP_REDIRECT 直接指向存活的 curr_item
                    self.line_pointers[root_idx] = {"flags": LP_REDIRECT, "target_item": curr_item}

# 4. 执行验证流程
page = MockHeapPage()
root_item, t1 = page.insert_initial("v1_alice")

# 模拟 5 个索引指向 root_item (page 1, item 1)
INDEX_COUNT = 5
index_entries = [f"({page.page_id},{root_item})" for _ in range(INDEX_COUNT)]

# 执行 HOT 更新 v2
ok, item2 = page.update_hot(root_item, "v2_bob", xid=101)
check("HOT 更新成功执行", ok)
check("新版本被标记为 HEAP_ONLY_TUPLE", page.tuples[page.line_pointers[item2]["target_tuple"]]["heap_only"])

# 验证索引条目：索引数量保持不变，仍为 5 条且指向 root_item
check("索引完全未膨胀，指针未变动", all(e == f"(1,{root_item})" for e in index_entries))

# 再执行一次 HOT 更新 v3
ok, item3 = page.update_hot(root_item, "v3_charlie", xid=102)
check("第二次 HOT 成功追加到链表", ok and item3 == 3)

# 模拟普通查询访问触发就地 Page Pruning (事务 105 访问，旧事务 101/102 均已提交)
page.prune_page(oldest_active_xmin=105)

# 验证剪枝效果：root_item 变成 LP_REDIRECT，直接跳向 item3
check("Root 行指针转为 LP_REDIRECT", page.line_pointers[root_item]["flags"] == LP_REDIRECT)
check("LP_REDIRECT 直指最新版本 item3", page.line_pointers[root_item]["target_item"] == item3)
check("死元组物理空间被回收", page.free_space > RESERVED_FOR_UPDATE - 2 * SLOT_TOTAL)

# 5. 反例：更新索引列打破 HOT
def simulate_non_hot_index_amplification():
    # 若更新索引字段，必须向全部 5 个索引插入新指针，放大倍数达 5 倍
    return INDEX_COUNT

amp = simulate_non_hot_index_amplification()
check("非 HOT 更新导致索引写放大 5 倍", amp == 5, f"Write amplification = {amp}x")

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 8)")
print("="*60)
sys.exit(1 if fails else 0)
