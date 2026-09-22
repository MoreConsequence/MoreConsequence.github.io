# 验证与模拟脚本：Linux Page Cache 脏页限流、balance_dirty_pages 阻塞时延与内存阈值模型
# 运行方式：python3 experiments/linux-dirty-writeback/sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. 默认比例设置下的内存陷阱 (大内存服务器的灾难)
# 内核默认值: dirty_background_ratio = 10%, dirty_ratio = 20%
DEFAULT_BG_RATIO = 0.10
DEFAULT_HARD_RATIO = 0.20

RAM_512G_BYTES = 512 * 1024 * 1024 * 1024  # 512 GB

dirty_bg_512g_gb = (RAM_512G_BYTES * DEFAULT_BG_RATIO) / (1024**3)
dirty_hard_512g_gb = (RAM_512G_BYTES * DEFAULT_HARD_RATIO) / (1024**3)

check("512GB 机器下默认异步回写线为 51.2GB", abs(dirty_bg_512g_gb - 51.2) < 1e-6, f"{dirty_bg_512g_gb:.1f} GB")
check("512GB 机器下默认同步阻塞线高达 102.4GB", abs(dirty_hard_512g_gb - 102.4) < 1e-6, f"{dirty_hard_512g_gb:.1f} GB")

# 2. 脏页击穿后的不可中断睡眠 (D 状态) 耗时推算
# 磁盘持续写入能力 (MB/s)
SPEED_HDD_MB = 150.0       # 传统机械盘或普通云盘
SPEED_SATA_SSD_MB = 500.0  # SATA 企业级 SSD
SPEED_NVME_MB = 2500.0     # 企业级 NVMe SSD

# 当 dirty_ratio 击穿，系统积累了 102.4GB 脏页时，刷盘所需排空耗时 (秒)
drain_time_hdd_s = (dirty_hard_512g_gb * 1024) / SPEED_HDD_MB
drain_time_sata_s = (dirty_hard_512g_gb * 1024) / SPEED_SATA_SSD_MB
drain_time_nvme_s = (dirty_hard_512g_gb * 1024) / SPEED_NVME_MB

check("HDD 下回写排空耗时超 600 秒 (全盘假死)", drain_time_hdd_s > 600, f"{drain_time_hdd_s:.1f} s")
check("SATA SSD 下回写排空耗时超 200 秒 (服务必然超时死锁)", drain_time_sata_s > 200, f"{drain_time_sata_s:.1f} s")
check("即便是 NVMe SSD，排空也需要长达 40 秒的全局卡顿", drain_time_nvme_s > 40, f"{drain_time_nvme_s:.1f} s")

# 3. 生产级优化方案：改用绝对字节数 (dirty_bytes / dirty_background_bytes)
# 推荐生产配置：dirty_background_bytes = 256MB, dirty_bytes = 512MB
OPT_BG_BYTES_MB = 256.0
OPT_HARD_BYTES_MB = 512.0

opt_drain_time_nvme_s = OPT_HARD_BYTES_MB / SPEED_NVME_MB  # 512 / 2500 = 0.2048 秒
opt_drain_time_sata_s = OPT_HARD_BYTES_MB / SPEED_SATA_SSD_MB  # 512 / 500 = 1.024 秒

check("采用 dirty_bytes=512MB 后，NVMe 卡顿压缩至 0.2 秒级", opt_drain_time_nvme_s < 0.3, f"{opt_drain_time_nvme_s:.3f} s")
check("采用 dirty_bytes=512MB 后，SATA SSD 卡顿压缩至 1 秒级", opt_drain_time_sata_s < 1.5, f"{opt_drain_time_sata_s:.3f} s")

# 4. 模拟 balance_dirty_pages 三区间状态机
def classify_write_behavior(dirty_mb, total_ram_mb=512*1024):
    bg_mb = total_ram_mb * DEFAULT_BG_RATIO      # 52428.8 MB
    hard_mb = total_ram_mb * DEFAULT_HARD_RATIO  # 104857.6 MB
    
    if dirty_mb < bg_mb:
        return "FAST_ASYNC"        # 纯内存写入，微秒级立即返回
    elif dirty_mb < hard_mb:
        return "BACKGROUND_FLUSH"  # 唤醒 kworker/wb 异步刷盘，写入进程仍放行但开始软限流
    else:
        return "STALL_SYNC_BLOCK"  # 强制进入 TASK_UNINTERRUPTIBLE 睡眠，业务挂起

check("轻载时走 FAST_ASYNC", classify_write_behavior(1000) == "FAST_ASYNC")
check("突破 10% 唤醒后台异步刷盘", classify_write_behavior(60000) == "BACKGROUND_FLUSH")
check("突破 20% 业务进程陷入 D 状态", classify_write_behavior(120000) == "STALL_SYNC_BLOCK")

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 8)")
print("="*60)
sys.exit(1 if fails else 0)
