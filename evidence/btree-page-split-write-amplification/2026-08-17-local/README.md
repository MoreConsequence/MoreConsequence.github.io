# B+Tree 页分裂模型：本机证据

## 目的

为 `content/posts/btree-page-split-write-amplification.md` 提供可复现的叶页分裂与填充率输出。该实验是标准库 Python 写的教学模型，不是 InnoDB、磁盘、redo、fsync 或并发 benchmark。

## 输入与模型

- 运行脚本：`experiments/btree-page-split/sim.py`
- 命令：`python3 experiments/btree-page-split/sim.py --rows 200000 --row-bytes 128 --seed 20260817`
- 页大小：4096、8192、16384 字节
- 行大小：固定 128 字节；每页容量为 `page_size // row_bytes`
- `sequential`：按递增键追加到最右叶页
- `random`：先用固定 seed 打乱唯一整数键，再定位叶页并在中点分裂满页
- 内部页：按叶页数和 `3/4` 叶容量估算 fanout；不是逐次内部节点分裂的实现

## 如何解读

在 16KB、128B、20 万行的这次输入中，顺序模型叶填充率为 99.968%、总页数为 1581；随机模型叶填充率为 69.661%、总页数为 2268，后者多 43.5%。这证明的是该模型中的空间差异，不证明目标数据库的物理文件大小、写放大、吞吐、延迟或恢复语义。

## 未覆盖项

模型没有实现数据库记录格式、页目录、压缩、聚簇/二级索引、buffer pool、redo/undo、checkpoint、doublewrite、fsync、并发锁、删除复用、更新迁移、真实设备缓存与故障恢复。要升级为数据库结论，需在固定数据库版本、行格式、索引、并发和存储设备上另做实验。
