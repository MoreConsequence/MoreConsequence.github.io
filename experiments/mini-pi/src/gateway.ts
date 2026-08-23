import { Message, Tool, GatewayResponse } from "./types.js";

export class RobustModelGateway {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? "mock-key";
    this.baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    this.model = process.env.MINI_PI_MODEL ?? "gpt-4o";
  }

  public async chatCompletion(messages: Message[], tools: Tool[]): Promise<GatewayResponse> {
    // 若未配置有效密钥，进入本地确定性 Mock 演示模式
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "mock-key") {
      return this.mockResponse(messages);
    }

    const payload = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })),
      tools: tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: "object",
            properties: t.parameters,
            required: Object.keys(t.parameters),
          },
        },
      })),
    };

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0]?.message;

    return {
      message: {
        role: "assistant",
        content: choice?.content ?? null,
        tool_calls: choice?.tool_calls?.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || "{}"),
        })),
      },
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  private mockResponse(messages: Message[]): GatewayResponse {
    const last = messages[messages.length - 1];

    if (last.role === "user") {
      return {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "mock_call_1",
              name: "read",
              arguments: { path: "package.json" },
            },
          ],
        },
        usage: { promptTokens: 150, completionTokens: 25 },
      };
    }

    return {
      message: {
        role: "assistant",
        content: `[Mock Mode] I have successfully inspected the workspace and completed the task!`,
      },
      usage: { promptTokens: 250, completionTokens: 40 },
    };
  }
}
