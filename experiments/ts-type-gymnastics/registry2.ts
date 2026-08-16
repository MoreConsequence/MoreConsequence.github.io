// 工具注册表：用类型注解宽化 + 泛型推导参数
type ToolDef<N extends string, Args> = {
  name: N;
  args: Args;
  run: (args: Args) => string;
};

const tools = {
  get_stock: {
    name: "get_stock",
    run: ({ symbol }: { symbol: string }) => `price(${symbol})=100`,
  },
  create_order: {
    name: "create_order",
    run: ({ userId, items }: { userId: number; items: number[] }) =>
      `order ${userId}:${items.join("+")}`,
  },
} satisfies Record<string, { name: string; run: (args: never) => string }>;

type Tools = typeof tools;
type ToolName = keyof Tools;
type ArgsOf<N extends ToolName> = Parameters<Tools[N]["run"]>[0];

const callTool = <N extends ToolName>(name: N, args: ArgsOf<N>) => {
  const t = tools[name];
  return t.run(args as never);
};

const run = () => {
  console.log("正确调用:", callTool("get_stock", { symbol: "TSLA" }));
  console.log("正确调用:", callTool("create_order", { userId: 1, items: [3] }));

  // @ts-expect-error 参数类型必须是该工具声明的形状
  callTool("get_stock", { symbol: 42 });
  console.log("编译期拦截了: get_stock 传了 number 而不是 string");
};

run();
