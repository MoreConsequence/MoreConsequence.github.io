# Embedding 检索几何实验

这份快照只支持 `content/posts/llm-embedding-retrieval.md` 中的合成向量结论，不代表任何真实 embedding 模型、向量数据库或生产召回率。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Python：workspace bundled Python 3.12.13（运行时路径见 `environment.txt`）
- NumPy：2.3.5
- 输入：实验脚本内固定随机种子；实验 1 每个维度 200,000 对随机向量，实验 3 每个设置重复 20 次
- 命令：`/Users/lianghaoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 experiments/llm-embedding-retrieval/retrieval_math.py`

`raw/retrieval_math.txt` 保存 stdout；脚本本身不调用外部 embedding API，也没有测量真实向量库的索引、网络或模型延迟。
