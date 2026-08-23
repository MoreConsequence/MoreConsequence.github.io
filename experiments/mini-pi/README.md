# Mini-Pi: A Modular, Lightweight AI Coding Agent Harness

`mini-pi` 是一个自包含、模块化、零冗余外部框架依赖的 Coding Agent 最小工业级参考实现。它是博客专栏《Pi Agent 全景通才教程》的配套可运行开源工程。

## 模块分层与职责

- `src/types.ts`：统一消息模型与工具调用契约；
- `src/agent-loop.ts`：外层 Turn 循环 + 内层 Tool 自旋的双层 While 状态机；
- `src/tools.ts`：4 大基础内建工具（`read`, `write`, `edit` 模糊替换, `bash` 50KB缓冲）；
- `src/session.ts`：单 JSONL 文件树状持久化与崩溃自愈；
- `src/gateway.ts`：统一多厂商模型网关，支持 Full Jitter 指数退避与可取消休眠；
- `src/telemetry.ts`：跨厂商 Token 消耗与耗时毫秒级追踪；
- `src/index.ts`：交互式 TUI CLI 入口。

## 快速开始

```bash
# 1. 编译 TypeScript
npm run build

# 2. 配置模型 API Key (兼容 OpenAI / DeepSeek / Qwen 格式)
export OPENAI_API_KEY="sk-..."
# 可选：指定自定义模型与 baseURL
# export OPENAI_BASE_URL="https://api.deepseek.com/v1"
# export MINI_PI_MODEL="deepseek-chat"

# 3. 启动交互式 Agent
npm start
```
