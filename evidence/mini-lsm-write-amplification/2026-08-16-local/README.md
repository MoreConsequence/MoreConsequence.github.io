# Mini LSM 放大率 sweep

这是 `experiments/mini-lsm` 的内存教学模拟，不是磁盘延迟 benchmark。写放大、读放大和空间放大按源码中的字节/探测次数定义计算；真实 RocksDB/LevelDB 的 compaction、cache、fsync 和并发不在此证据内。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Go：1.25.1
- 输入：`num=300000`、`writes=400000`、`mem=6000`、bloom `m/n=10`、`k=7`、固定 seed
- 命令：`cd experiments && go run ./mini-lsm -num 300000 -writes 400000 -mem 6000 -sweep -csv`
- 输出：`raw/sweep.csv`

文章表格只抄录该命令的输出；不要把放大率当成 SSD、文件系统或生产引擎的时延比例。
