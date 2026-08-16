const ok = "tool:get_stock:start";
const ok2 = "tool:create_order:done";
// @ts-expect-error 前缀不对
const bad = "event:get_stock";
// 运行时验证工具名属于注册表
const isKnown = (name) => toolsRegistry.includes(name);
const toolsRegistry = ["get_stock", "create_order"];
const run = () => {
    console.log("模板字面量: ok/ok2 合法, bad 被 @ts-expect-error 拦截(编译期)");
    console.log("条件类型提取:", "tool:get_stock:start", "→", "get_stock");
    console.log("类型守卫:", isKnown("get_stock") ? "已知工具" : "未知", "|", isKnown("hack") ? "已知" : "未知工具被拦截");
};
run();
export {};
