const user = {
    id: 1,
    name: "Ada",
    email: "ada@example.com",
    passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
    internalNotes: ["fraud-review"],
};
// ---- 1. 直接序列化：类型认为你有 User，运行时带出全部字段 ----
const leaked = JSON.stringify(user);
console.log("直接序列化:", leaked);
const asPublic = user; // 合法！结构满足（多余字段被允许）
const leak2 = JSON.stringify(asPublic);
console.log("Omit<> 后序列化:", leak2, "← 运行时还在！");
// ---- 3. 真正的脱敏：显式 pick（DTO 构造） ----
const toPublic = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
});
const safe = JSON.stringify(toPublic(user));
console.log("DTO 构造:", safe);
// ---- 4. 字节对比 ----
console.log("泄露体积:", Buffer.byteLength(leak2), " vs DTO:", Buffer.byteLength(safe));
const orderResult = {
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
const toModel = (r) => {
    const value = r.value;
    return {
        ok: r.ok,
        value: {
            orderId: value.orderId,
            status: value.status,
            customerEmail: value.customer.email,
        },
    };
};
console.log("白名单后进上下文:", JSON.stringify(toModel(orderResult)));
export {};
