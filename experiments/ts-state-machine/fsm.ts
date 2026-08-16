// Agent 状态机：隐式状态(散落 if) vs 显式状态(状态表)
// 这个实验只演示状态转移，不模拟真实网络；requestId/重试守卫见文章中的生产边界。

type ImplicitAgent = {
  toolCalled: boolean;
  toolName: string;
  retries: number;
  done: boolean;
};

const implicitStep = (
  agent: ImplicitAgent,
  event: { type: string; payload?: unknown },
): ImplicitAgent => {
  if (event.type === "start") {
    return { ...agent, toolCalled: false, toolName: "", retries: 0, done: false };
  }
  if (agent.done) return agent;
  if (agent.retries >= 3) return { ...agent, done: true };
  if (agent.toolCalled && agent.toolName === "get_stock") {
    return { ...agent, done: true };
  }
  if (event.type === "tool_result") {
    return { ...agent, toolCalled: true, toolName: String(event.payload ?? "unknown") };
  }
  return { ...agent, toolCalled: true, toolName: "get_stock" };
};

export type State =
  | "idle"
  | "calling_tool"
  | "awaiting_result"
  | "retrying"
  | "processing"
  | "done"
  | "failed";

export type Event =
  | { type: "start" }
  | { type: "tool_dispatched" }
  | { type: "tool_result" }
  | { type: "tool_error" }
  | { type: "retry" }
  | { type: "exhausted" }
  | { type: "complete" };

const transitions: Readonly<Record<State, Partial<Record<Event["type"], State>>>> = {
  idle: { start: "calling_tool" },
  calling_tool: { tool_dispatched: "awaiting_result" },
  awaiting_result: { tool_result: "processing", tool_error: "retrying" },
  retrying: { retry: "calling_tool", exhausted: "failed" },
  processing: { complete: "done" },
  done: {},
  failed: {},
};

export const transition = (state: State, event: Event): State => {
  const next = transitions[state][event.type];
  if (!next) throw new Error(`非法转移: ${state} x ${event.type}`);
  return next;
};

const run = () => {
  let implicit: ImplicitAgent = {
    toolCalled: false,
    toolName: "",
    retries: 0,
    done: false,
  };
  for (const event of ["start", "tool_result", "tool_result"] as const) {
    implicit = implicitStep(implicit, { type: event, payload: "get_stock" });
  }
  console.log("隐式结果(done 后又来 tool_result):", JSON.stringify(implicit), "← 静默保留旧状态");

  let state: State = "idle";
  const trace: string[] = [];
  const events: Event[] = [
    { type: "start" },
    { type: "tool_dispatched" },
    { type: "tool_result" },
    { type: "complete" },
  ];
  for (const event of events) {
    const next = transition(state, event);
    trace.push(`${state} --${event.type}--> ${next}`);
    state = next;
  }
  console.log("显式轨迹:", trace.join(" | "));

  try {
    transition(state, { type: "tool_result" });
  } catch (error) {
    console.log("done 状态再来 tool_result:", (error as Error).message);
  }
};

run();
