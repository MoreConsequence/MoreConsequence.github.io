// 错误处理两模型：throw(长臂) vs Result(管道)
// 场景：Agent 工具调用，三个错误源：网络、校验、业务

// ---- throw 模型：错误走调用栈,类型系统不知道谁会拦 ----
const toolCallThrow = async (name: string): Promise<{ data: string }> => {
  if (name === "get_stock") return { data: "price: 100" };
  if (name === "rate_limit") throw new Error("rate limited by provider");
  if (name === "malformed") throw new Error("invalid JSON from model");
  throw new Error("unknown tool");
};

// 调用方不知道可能抛什么；没 catch 就直接崩
const callerThrow = async () => {
  try {
    const r = await toolCallThrow("rate_limit");
    return r.data;
  } catch (e) {
    return `fallback: ${(e as Error).message}`;  // catch 了 Error,但类型系统不知道还有别的
  }
};

// ---- Result 模型：错误是返回值,类型系统强制处理 ----
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const toolCallResult = async (name: string): Promise<Result<{ data: string }>> => {
  if (name === "get_stock") return { ok: true, value: { data: "price: 100" } };
  if (name === "rate_limit") return { ok: false, error: "rate limited" };
  if (name === "malformed") return { ok: false, error: "invalid JSON" };
  return { ok: false, error: "unknown tool" };
};

const callerResult = async () => {
  const r = await toolCallResult("rate_limit");
  if (!r.ok) return `fallback: ${r.error}`;   // 编译器要求处理 !ok
  return r.value.data;                        // 此处 value 被窄化
};

// ---- 没处理的异步异常：进程崩还是静默? ----
const unhandled = async () => {
  setTimeout(() => {
    throw new Error("async 里 throw,没人接");  // 定时器回调的 throw 逃不出 try/catch
  }, 0);
};

const run = async () => {
  console.log("throw 模型:", await callerThrow());
  console.log("Result 模型:", await callerResult());
  console.log("--- 异步异常演示 ---");
  const escaped: string[] = [];
  process.on("uncaughtException", (e) => {
    escaped.push(e.message);
    console.log("uncaughtException 全局兜底:", e.message);
  });
  setTimeout(() => { throw new Error("定时器回调的 throw,外层 try/catch 接不住"); }, 0);
  try {
    await new Promise((r) => setTimeout(r, 10));
  } catch {
    console.log("外层 catch 接住了(不可能到这里)");
  }
  console.log("外层 try/catch 正常结束,异常走全局兜底:", JSON.stringify(escaped));
  console.log("--- 结束(没崩,因为注册了 uncaughtException) ---");
};
run();
