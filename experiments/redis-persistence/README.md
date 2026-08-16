# redis-persistence：三档 appendfsync 的吞吐与崩溃丢失窗口

对应博客《Redis 的持久化不是备份：RDB 点备份与 AOF 重放的两张表》的实验入口。
正文里的【本机实测待补】用这两个脚本的本机输出回填。

前置条件：本机有 docker，能拉到 `redis:7` 镜像。

## bench.sh —— 三种 appendfsync 的 SET 吞吐

三个独立容器（干净数据、`--save ''` 关掉 RDB，只留 `appendfsync` 一个变量），
分别用 `no / everysec / always` 启动，各跑同一份 `redis-benchmark SET` 负载：

```bash
bash experiments/redis-persistence/bench.sh
```

期望：`always` 明显低于另两档（每写必 fsync，吞吐被磁盘 fsync 延迟钉死，
对应 fsync 篇的"1/fsync"模型）；`everysec` 与 `no` 接近（fsync 摊到每秒一次 / 交给 OS）。
注意：这是"本机 + 容器文件系统/磁盘"下的一次对比，绝对值随磁盘变化，
相对排序比绝对数字更有意义；单次跑只能算"本机一次结果"，想当结论请多跑几次取中位数。

## crash-loss.sh —— kill -9 模拟崩溃，各档位剩多少

四种配置各起一个容器，逐条写 100 个 key（每次写后随机睡 0~150ms，制造"落在两次
fsync 之间"的写入），`docker kill --signal KILL`（不经过正常关闭，模拟进程被强制杀死，非断电；断电窗口需宿主机重启才能测出），
`docker start` 重启触发持久化加载，`--scan` 数剩余 key：

```bash
bash experiments/redis-persistence/crash-loss.sh
```

**结果怎么读（重要）**：本脚本只在"进程被杀"这一层模拟崩溃，宿主内核页缓存仍然活着。
AOF `everysec` / `no` 写入即便还没 fsync，也还留在宿主页缓存里、之后会被写回，
所以重启后几乎一条不丢——"≤1 秒 / ≤30 秒"是**断电窗口**（页缓存整体蒸发），
同一台还活着的机器上用 kill -9 复现不出来。这正是正文第三部分想讲的
"1 秒窗口与操作系统页缓存的关系"：你能在进程级测到的是
- 仅 RDB：丢"上一次 SAVE 之后"写入的全部（点备份的代价）；
- AOF `always`：不丢；
- AOF `everysec` / `no`：进程级窗口≈0。

想看到真正的 1 秒 / 30 秒断电窗口，需要让页缓存失效（宿主机重启，或对 Linux 虚拟机
做快照后回滚），本地单机做不到；把 `appendfsync everysec` 的理解停在
"断电上限约 1 秒"即可。

## 进阶：手动放大 `no` 档的进程级窗口

`no` 档 Redis 连 fsync 都不调用，脏页完全由内核写回。把脚本里 `N` 调大、
`sleep` 上限调高（例如 1.5s），再配合低 `vm.dirty_writeback_centisecs` 的主机，
能在进程级观察到少数丢页。这依赖内核写回时机，不是稳定的演示，正文不依赖它。
