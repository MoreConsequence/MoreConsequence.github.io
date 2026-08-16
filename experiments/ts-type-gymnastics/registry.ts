// 类型体操的真实用例：工具注册表——类型系统从注册表推导参数类型
// 编译期错误演示 + 运行期行为对比

// ---- 泛型注册表：每个工具的名字映射到它的参数/返回类型 ----
type ToolDef<Name extends string, Args, Out> = {
  name: Name;
  args: Args;
  run: (args: Args) => Out;
};

const tools = {
  get_stock: {
    name: "get_stock",
    args: { symbol: "AAPL" },
    run: ({ symbol }: { symbol: string }) => `price(${symbol})=100`,
  },
  create_order: {
    name: "create_order",
    args: { userId: 7, items: [1, 2] },
    run: ({ userId, items }: { userId: number; items: number[] }) =>
      `order ${userId}:${items.join("+")}`,
  },
} as const;

// ---- 从注册表推导：工具名 → 参数类型的映射 ----
type Tools = typeof tools;
type ToolName = keyof Tools;
type ArgsOf<N extends ToolName> = Tools[N]["args"];

const callTool = <N extends ToolName>(name: N, args: ArgsOf<N>) => {
  const t = tools[name];
  return t.run(args);
};

const run = () => {
  console.log("正确调用:", callTool("get_stock", { symbol: "TSLA" }));
  console.log("正确调用:", callTool("create_order", { userId: 1, items: [3] }));

  // 编译期错误：类型不匹配
  // @ts-expect-error 参数类型必须是该工具声明的形状
  callTool("get_stock", { symbol: 42 });
  console.log("编译期拦截了: get_stock 传了 number 而不是 string");
};

run();
