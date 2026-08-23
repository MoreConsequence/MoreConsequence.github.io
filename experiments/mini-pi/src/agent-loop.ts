import { Message, Tool } from "./types.js";
import { TreeSessionStorage } from "./session.js";
import { RobustModelGateway } from "./gateway.js";
import { TelemetryCollector } from "./telemetry.js";

export class MiniAgentHarness {
  private toolMap: Map<string, Tool>;
  private static readonly MAX_TOOL_STEPS = 20;

  constructor(
    private tools: Tool[],
    private gateway: RobustModelGateway,
    private session: TreeSessionStorage,
    private telemetry: TelemetryCollector
  ) {
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
  }

  public async runTurn(userPrompt: string): Promise<string> {
    this.telemetry.incrementTurn();

    // 1. 记录用户消息并持久化
    const userMsg: Message = { role: "user", content: userPrompt };
    this.session.appendMessage(userMsg);

    let stepCount = 0;

    // 内层 While 工具自旋循环
    while (stepCount < MiniAgentHarness.MAX_TOOL_STEPS) {
      stepCount++;

      // 提取当前活跃历史路径
      const history = this.session.getActivePath();

      // 调用模型网关
      const resp = await this.gateway.chatCompletion(history, this.tools);
      if (resp.usage) {
        this.telemetry.recordUsage(resp.usage.promptTokens, resp.usage.completionTokens);
      }

      // 记录助手消息
      this.session.appendMessage(resp.message);

      // 收敛判定：若模型没有请求调用任何工具，退出内循环
      if (!resp.message.tool_calls || resp.message.tool_calls.length === 0) {
        return resp.message.content ?? "(No response text)";
      }

      // 执行工具调用批次
      for (const call of resp.message.tool_calls) {
        console.log(`\x1b[33m⚡ Tool Call: ${call.name}(${JSON.stringify(call.arguments)})\x1b[0m`);
        const tool = this.toolMap.get(call.name);

        let resultStr = "";
        if (!tool) {
          resultStr = `Error: Tool '${call.name}' not found.`;
        } else {
          try {
            resultStr = await tool.execute(call.arguments);
          } catch (err: any) {
            resultStr = `Error executing '${call.name}': ${err.message}`;
          }
        }

        // 回填工具执行结果
        const toolMsg: Message = {
          role: "tool",
          tool_call_id: call.id,
          content: resultStr,
        };
        this.session.appendMessage(toolMsg);
      }
    }

    throw new Error(`Max tool execution steps (${MiniAgentHarness.MAX_TOOL_STEPS}) exceeded.`);
  }
}
