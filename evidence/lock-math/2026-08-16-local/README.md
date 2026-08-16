# lock-math：本机证据

## 覆盖范围

本快照对应 `experiments/lock-math/main.go`，为「乐观锁不是免费的：冲突重试税 vs FOR UPDATE 排队税」一文提供两种对照：

- `sweep`：冲突率 `p` 为自变量的受控对照，验证 `E[attempts]=1/(1-p)`、`E[retries]=p/(1-p)`，并给出并发度 N 下乐观/悲观胜者网格与交叉点曲线。
- `storm`：热行秒杀的事件交错模拟，展示乐观锁总尝试次数随并发度超线性放大（重试风暴）vs 悲观锁恒为 K 次（零浪费）。

## 命令

```bash
cd experiments/lock-math
go run .                  # sweep: 公式验证 + 网格 + crossover_N{20,100}.svg
go run . -mode storm      # storm: 热行重试风暴对照 + storm.svg
```

## 口径

- 所有延迟是**模拟成本单位**（`a=100µs` 乐观单次尝试、`s=200µs` 悲观持锁），不是真实 MySQL 延迟；真实 DB 数字需压测后回填正文【本机实测待补】。
- `raw/` 保存本机一次运行原始输出与生成图；重跑因随机种子固定（`20260816`）与 FIFO 确定性，sweep 结果可复现；storm 的 goroutine 交错使数值有轻微抖动（重试放大趋势稳定）。
- 该目录只证明模型的相对形状（交叉点存在、重试放大超线性），不证明生产 DB 的尾延迟、锁调度或连接池行为。

## 环境

Go 1.25.1 darwin/arm64，checkout `9dde22f`（worktree 未提交）。
