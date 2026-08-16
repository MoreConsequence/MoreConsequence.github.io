const tools = {
    get_stock: {
        name: "get_stock",
        run: ({ symbol }) => `price(${symbol})=100`,
    },
    create_order: {
        name: "create_order",
        run: ({ userId, items }) => `order ${userId}:${items.join("+")}`,
    },
};
const callTool = (name, args) => {
    const t = tools[name];
    return t.run(args);
};
const run = () => {
    console.log("正确调用:", callTool("get_stock", { symbol: "TSLA" }));
    console.log("正确调用:", callTool("create_order", { userId: 1, items: [3] }));
    // @ts-expect-error 参数类型必须是该工具声明的形状
    callTool("get_stock", { symbol: 42 });
    console.log("编译期拦截了: get_stock 传了 number 而不是 string");
};
run();
export {};
