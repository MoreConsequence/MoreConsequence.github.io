# HTTP 缓存协议证据

这份快照用仓库内 Node HTTP server 固定返回 `ETag: "v1"` 和 `Cache-Control: public, max-age=60`，再发一个普通请求和一个带匹配 `If-None-Match` 的条件请求。它验证的是 origin 的 200/304 响应合同，不是浏览器是否已经把资源放进缓存，也不是 CDN 命中率或真实网络延迟。

## 命令

```bash
node experiments/http-cache-contract/probe.mjs
```

## 边界

- `fetch` 默认不模拟浏览器 HTTP cache；`max-age` 的“强缓存不发请求”需要在浏览器或真实客户端缓存层验证。
- 304 不包含响应体，但仍可以携带缓存相关响应头；不能把它简化成“只有一行头”。
- 19 字节 body 是教学 fixture，不代表图片、JSON 或生产资源大小。
