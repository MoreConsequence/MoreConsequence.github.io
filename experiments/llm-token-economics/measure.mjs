import pkg from "tiktoken";
const { get_encoding: getEncoding } = pkg;

const enc = getEncoding("o200k_base");

const samples = {
  中文: "语言的边界就是世界的边界。模型把这句话编码成多少个 token,取决于子词切分而不是字符数量。",
  英文: "The limits of my language mean the limits of my world. How LLMs tokenize this sentence depends on subword splitting, not character count.",
  代码: "export async function createOrder(userId: string, items: Item[]): Promise<Order> {\n  const total = items.reduce((sum, i) => sum + i.price, 0);\n  return await store.save({ userId, items, total });\n}",
  JSON: '{"orderId":"ord_20260816_001","status":"pending","total":199.9,"items":["n1","n2"],"userId":"u_42"}',
  混合: "使用 GPT-4.1 处理订单:retry 3 次,timeout 15s,cache 命中率 90%,qps 峰值 1200。",
};

for (const [name, text] of Object.entries(samples)) {
  const tokens = enc.encode(text).length;
  const chars = text.length;
  console.log(
    `${name.padEnd(4)} 字符=${String(chars).padStart(4)} tokens=${String(tokens).padStart(4)} 字符/token=${(chars / tokens).toFixed(2)}`
  );
}

const zh = enc.encode(samples.中文);
console.log("\n--- 编码稳定性(同一文本重复调用) ---");
for (let i = 0; i < 3; i++) {
  const again = enc.encode(samples.中文);
  console.log(`第${i + 1}次: ${again.length} tokens | id 序列一致: ${JSON.stringify(zh) === JSON.stringify(again)}`);
}

const zh100 = "这是连续一百个中文字符的测试段落用于估算中文在 o200k 分词器下的真实 token 密度,重复的内容不算数,我们只看这一段到底切成了多少个子词单位,以便把以字计数的需求换算成以 token 计数的 API 账单,实际数字会比人脑的直觉高不少,这就是本实验要测量的东西,请继续数。";
console.log(`\n--- 中文 token 密度精确测量 ---`);
console.log(`100 字中文段落: ${zh100.length} 字 → ${enc.encode(zh100).length} tokens (${(enc.encode(zh100).length / 100).toFixed(2)} token/字)`);
console.log(`1M token ≈ ${Math.round(1_000_000 / (enc.encode(zh100).length / 100))} 个汉字`);