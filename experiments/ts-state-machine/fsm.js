// Agent 状态机：隐式状态(散落 if) vs 显式状态(状态表)
// 场景：工具调用循环——每个工具返回后，下一步去哪由"当前状态 x 事件"决定
const implicitStep = (a, event) => {
    if (event.type === "start")
        return { ...a, toolCalled: false, toolName: "", retries: 0, done: false };
    if (a.done)
        return a;
    if (a.retries >= 3)
        return { ...a, done: true }; // 规则散在分支里
    if (a.toolCalled && a.toolName === "get_stock") {
        return { ...a, done: true };
    }
    if (event.type === "tool_result") {
        return { ...a, toolCalled: true, toolName: String(event.payload ?? "unknown") };
    }
    return { ...a, toolCalled: true, toolName: "get_stock" };
};
const transitions = {
    idle: { start: "calling_tool" },
    calling_tool: { tool_result: "done", tool_error: "retrying" },
    retrying: { tool_result: "done", tool_error: "calling_tool" },
    done: {},
};
// 重试上限在状态外单独计数,不污染转移表
const run = () => {
    // 隐式：测一组事件（tool_result 到了 done 还会被下一个事件碰）
    let imp = { toolCalled: false, toolName: "", retries: 0, done: false };
    const events = ["start", "tool_result", "tool_result"];
    for (const e of events)
        imp = implicitStep(imp, { type: e, payload: "get_stock" });
    console.log("隐式结果(done 后又来 tool_result):", JSON.stringify(imp), "← 没拦截,静默吞掉");
    // 显式：同一组事件——done 后的转移直接被拦
    let s = "idle";
    const trace = [];
    const events2 = ["start", "tool_result"];
    for (const e of events2) {
        const next = transitions[s][e];
        if (!next)
            throw new Error(`非法转移: ${s} x ${e}`);
        trace.push(`${s} --${e}--> ${next}`);
        s = next;
    }
    console.log("显式轨迹:", trace.join(" | "));
    const illegal = transitions.done["tool_result"];
    console.log("done 状态再来 tool_result:", illegal ?? "被拦截(转移表里没有)");
};
run();
export {};
