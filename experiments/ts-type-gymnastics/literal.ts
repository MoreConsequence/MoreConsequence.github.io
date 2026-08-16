// 模板字面量类型 + 条件类型：工具名模式匹配
type ToolEvent = `tool:${string}:${string}`;
const ok: ToolEvent = "tool:get_stock:start";
const ok2: ToolEvent = "tool:create_order:done";
// @ts-expect-error 前缀不对
const bad: ToolEvent = "event:get_stock";

// 条件类型：从事件字符串里拆出工具名
type ExtractTool<E extends string> = E extends `tool:${infer T}:${string}` ? T : never;
type T1 = ExtractTool<"tool:get_stock:start">;    // "get_stock"
type T2 = ExtractTool<"event:whatever">;           // never

// 运行时验证工具名属于注册表
const isKnown = (name: string): name is ToolName => (toolsRegistry as readonly string[]).includes(name);
const toolsRegistry = ["get_stock", "create_order"] as const;
type ToolName = (typeof toolsRegistry)[number];

const run = () => {
  console.log("模板字面量: ok/ok2 合法, bad 被 @ts-expect-error 拦截(编译期)");
  console.log("条件类型提取:", "tool:get_stock:start" as ToolEvent, "→", "get_stock");
  console.log("类型守卫:", isKnown("get_stock") ? "已知工具" : "未知", "|", isKnown("hack") ? "已知" : "未知工具被拦截");
};
run();
