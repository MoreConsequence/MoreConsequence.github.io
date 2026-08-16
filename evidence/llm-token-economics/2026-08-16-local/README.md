# llm-token-economics evidence

这是一组 2026-08-16 在本机运行的 token 与成本模型 evidence snapshot，基线为 dirty checkout `HEAD=9dde22f`。

## Commands

从仓库根目录运行：

```bash
cd experiments/llm-token-economics
node measure.mjs
node cost-model.mjs
```

`measure.mjs` 使用 `tiktoken` 的 `o200k_base`，只证明给定文本在当前 tokenizer 下的切分结果和重复调用稳定性；不能把五个样本外推成所有中文、英文或代码的固定字符/token 比例。

`cost-model.mjs` 使用 GPT-4.1 价格快照：输入 $2/M、缓存命中 $0.5/M、输出 $8/M；场景固定为 30 天、每天 10,000 请求、每次输出 300 token。稳定前缀按命中率拆成普通输入与缓存命中输入，动态的每请求 40 token 始终按普通输入计费。价格、命中率和请求量变化时应重新运行。

## Files

- `raw/tokenizer.txt`：tokenizer 原始输出。
- `raw/cost-model.txt`：成本模型原始输出。
- `environment.txt`：Node/npm/checkout 信息。
