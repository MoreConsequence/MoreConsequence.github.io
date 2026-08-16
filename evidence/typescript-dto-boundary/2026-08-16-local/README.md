# typescript-dto-boundary：本机证据

## 命令

```bash
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node experiments/ts-dto-boundary/main.ts
```

## 结果与口径

- `raw/main.txt` 保留完整输出。
- 固定输入下，直接序列化与 `Omit<>` 视图都是 127B，显式 DTO 是 47B；实验还断言敏感字段只出现在泄露视图中。
- 127B/47B 是固定字符串、Node JSON 序列化和 UTF-8 字节口径的一次本机结果，不是通用吞吐或安全风险评分。
