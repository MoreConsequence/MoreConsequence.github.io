// DTO 边界：类型不裁剪对象，序列化才是真相
// 演示：passwordHash 泄漏 + Omit<> 只在编译期 + 手写 pick 脱敏的字节对比
export type User = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  internalNotes: string[];
};

const user: User = {
  id: 1,
  name: "Ada",
  email: "ada@example.com",
  passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
  internalNotes: ["fraud-review"],
};

// ---- 1. 直接序列化：类型认为你有 User，运行时带出全部字段 ----
const leaked = JSON.stringify(user);
console.log("直接序列化:", leaked);

// ---- 2. Omit<> 编译期裁剪：类型上没了，运行时还在 ----
type PublicUser = Omit<User, "passwordHash" | "internalNotes">;
const asPublic: PublicUser = user; // 合法！结构满足（多余字段被允许）
const leak2 = JSON.stringify(asPublic);
console.log("Omit<> 后序列化:", leak2, "← 运行时还在！");

// ---- 3. 真正的脱敏：显式 pick（DTO 构造） ----
const toPublic = (u: User): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
});
const safe = JSON.stringify(toPublic(user));
console.log("DTO 构造:", safe);

// ---- 4. 字节对比 ----
console.log("泄露体积:", Buffer.byteLength(leak2), " vs DTO:", Buffer.byteLength(safe));
if (Buffer.byteLength(leak2) !== 127 || Buffer.byteLength(safe) !== 47) {
  throw new Error("固定输入的 DTO 字节证据发生变化");
}
if (!leak2.includes("passwordHash") || safe.includes("passwordHash")) {
  throw new Error("DTO 字段断言失败");
}

// ---- 5. Agent 场景：工具返回值直接喂给模型 = 内部字段进上下文 ----
type ToolValue = {
  orderId: string;
  status: string;
  customer: { id: number; email: string; passwordHash: string };
  internal: { riskScore: number; flagged: boolean };
};
type ToolResult = { ok: true; value: ToolValue };
const orderResult: ToolResult = {
  ok: true,
  value: {
    orderId: "A-100",
    status: "PROCESSING",
    customer: { id: 7, email: "ada@example.com", passwordHash: "x" },
    internal: { riskScore: 0.99, flagged: true },
  },
};
// 直接序列化给模型：内部风险评分泄露进 prompt
console.log("工具结果直接进上下文:", JSON.stringify(orderResult));
// 显式白名单：只给模型需要看的
type ModelToolResult = {
  ok: true;
  value: { orderId: string; status: string; customerEmail: string };
};
const toModel = (r: ToolResult): ModelToolResult => ({
  ok: r.ok,
  value: {
    orderId: r.value.orderId,
    status: r.value.status,
    customerEmail: r.value.customer.email,
  },
});
const modelView = JSON.stringify(toModel(orderResult));
console.log("白名单后进上下文:", modelView);
if (modelView.includes("riskScore") || modelView.includes("passwordHash")) {
  throw new Error("模型 DTO 包含内部字段");
}
