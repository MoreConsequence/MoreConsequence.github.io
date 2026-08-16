# service-observability-slo：本机证据

## 问题

验证订单服务是否把命中、404、400、201、200、409 和 500 分别记录到对应的 operation/outcome 延迟样本中。

## 命令

在仓库根目录执行：

```bash
cd experiments/service
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node node_modules/vitest/vitest.mjs run
```

随后用 `src/app.ts` 的 Hono `app.request()` 依次发送命中、404、非法 body、首次创建、幂等重放和指纹冲突请求；原始 JSON 在 `raw/metrics.json`。另用会抛错的替身 store 验证 500 路径，原始 JSON 在 `raw/error-metrics.json`。

## 结果

| 路径 | HTTP 结果 | 延迟样本 |
| --- | ---: | --- |
| `GET /orders/A-100` | 200 | `orders_get.ok.n = 1` |
| `GET /orders/ghost` | 404 | `orders_get.not_found.n = 1` |
| 非法 `POST /orders` | 400 | `orders_create.validation_failed.n = 1` |
| 首次创建 | 201 | `orders_create.ok.n` 增加 |
| 幂等重放 | 200 | 同一 `ok` 桶 |
| 指纹冲突 | 409 | `orders_create.conflict.n = 1` |
| store 抛错 | 500 | `orders_get.error.n = 1` |

这些是 `app.request()` 的 handler 级样本，不是经过 socket、代理、数据库和网络的生产 API p99；它们只能证明当前指标数据形状和退出路径覆盖。
