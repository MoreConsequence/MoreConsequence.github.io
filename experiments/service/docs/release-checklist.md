# 订单服务发布检查清单

> 这是当前本地教学原型的证据清单。勾选“本地”不等于可以发布到生产；“外部”项目必须有 run URL、环境版本或原始记录。

## 代码与边界

- [ ] 本地：所有 body/query 经过 schema 校验，错误统一为 `{ error: { code, message, details? } }`
- [ ] 本地：同 key 同 body 重放权威结果，同 key 不同 body 明确 409
- [ ] 外部：认证、授权、tenant 与敏感字段脱敏已由独立测试和审计记录支持

## 数据与存储

- [x] 本地：内存原型的 `orders` 与 `byKey` 都有容量上限，并通过反向索引同步驱逐
- [ ] 外部：权威数据进入持久化存储，唯一约束、迁移、备份和恢复有运行记录
- [ ] 外部：重启、两实例竞争、TTL/保留期和未知结果重试已验证

## 测试与 CI

- [x] 本地：`npm ci && npm run typecheck && npm test && npm run build` 可重跑
- [x] 本地：3 个测试文件、18 个 service 测试覆盖并发幂等、冲突、指标失败路径和容量不变量
- [ ] 外部：根 workflow 的 Node 20/22/24 Actions run、artifact 下载和失败 job 日志已保存

## 可观测性

- [x] 本地：404、400、500 和成功响应进入按 operation/outcome 分组的延迟样本
- [ ] 外部：SLI 的 good event、分母、28/30 天窗口和 error budget 已在监控系统落地
- [ ] 外部：Prometheus/OTel 标签基数、告警噪声、告警响应和一次故障注入有证据

## 发布与恢复

- [x] 本地：`/healthz` 只表示进程存活，`/readyz` 单独表示依赖准备状态
- [ ] 外部：staging 使用本次 commit 的版本回显，并通过业务 smoke test
- [ ] 外部：deploy、迁移回滚、旧 artifact 重放和流量恢复各有演练记录
