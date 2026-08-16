/**
 * 工具调用错误形状实验：模拟 Agent 的工具调用循环，
 * 对比三种错误形状下"模型能否自愈"（下一轮做出正确动作）。
 *
 * 三种形状：
 *  A. 裸错误：HTTP 500 + 空 body（只有状态码）
 *  B. 半结构化：{ error: { code, message } }（有码有说明，无定位）
 *  C. 结构化+定位：{ error: { code, message, details: [{ path, code, message }] } }
 *     —— 即 service-api-shape 里落库的契约（experiments/service/src/orders.ts）
 *
 * 模拟"模型"：一个确定性启发式决策器，模拟模型读错误后能做什么：
 *  - 裸错误：只知道"失败"，决策只能是"重试"（盲重试 3 次后放弃）
 *  - 半结构化：知道码，能区分"重试型"(5xx 网络类) 与 "修正型"(4xx 参数类)。
 *    修正型启动"换参重试"：从候选参数序列里试下一个
 *  - 结构化：知道 details.path 指向哪个字段，直接修对字段，一轮即中
 *
 * 每轮成本按 token 计（简化）：每轮调用固定 500 输入 + 100 输出。
 * 结论仅限模拟，不是真实模型行为。
 */
class SimAgent {
  constructor(shape, maxRounds = 5) {
    this.shape = shape;
    this.maxRounds = maxRounds;
    this.rounds = 0;
    this.tokens = 0;
  }

  cost() {
    this.rounds++;
    this.tokens += 600; // 500 输入 + 100 输出
  }

  async call(param) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (param >= 3) resolve({ ok: true });
        else resolve({ ok: false, status: 422, body: this.errorBody(param) });
      }, 5);
    });
  }

  errorBody(param) {
    if (this.shape === "bare") return "";
    if (this.shape === "semistructured") {
      return { error: { code: param === 2 ? "STOCK_NOT_ENOUGH" : "INVALID_QTY", message: "库存不足" } };
    }
    return {
      error: {
        code: param === 2 ? "STOCK_NOT_ENOUGH" : "INVALID_QTY",
        message: "库存不足",
        details: [{ path: ["qty"], code: "EXCEEDS_STOCK", message: "库存仅 2 件" }],
      },
    };
  }

  // 模拟模型读错误后的决策
  decide() {
    if (this.shape === "bare") {
      // 不知道失败原因：盲重试
      return { action: "retry", param: 1 }; // 重试同样的参数
    }
    if (this.shape === "semistructured") {
      // 知道有错，但不知道错在哪个字段：换参试探
      return { action: "retry_modified", param: this.rounds }; // 换下一个候选
    }
    // 结构化：details.path 直接指向 qty——修 qty 到合法值
    return { action: "fix_qty", param: 3 };
  }

  async run(param) {
    for (let round = 0; round < this.maxRounds; round++) {
      this.cost();
      const res = await this.call(param);
      if (res.ok) return { success: true, rounds: this.rounds, tokens: this.tokens };
      const decision = this.decide();
      param = decision.param;
    }
    return { success: false, rounds: this.rounds, tokens: this.tokens };
  }
}

async function main() {
  const results = {};
  for (const shape of ["bare", "semistructured", "structured"]) {
    const agent = new SimAgent(shape);
    results[shape] = await agent.run(1);
    console.log(
      `${shape.padEnd(15)} 成功=${results[shape].success} 轮数=${results[shape].rounds} token=${results[shape].tokens}`
    );
  }

  console.log("\n--- 批量模拟:每种形状跑 100 次,统计成功率 / 平均轮数 / 平均 token ---");
  for (const shape of ["bare", "semistructured", "structured"]) {
    let ok = 0, rounds = 0, tokens = 0;
    for (let i = 0; i < 100; i++) {
      const r = await new SimAgent(shape).run(1);
      ok += r.success ? 1 : 0;
      rounds += r.rounds;
      tokens += r.tokens;
    }
    console.log(
      `${shape.padEnd(15)} 成功率=${(ok / 100 * 100).toFixed(0).padStart(3)}% 平均轮数=${(rounds / 100).toFixed(2)} 平均token=${tokens / 100}`
    );
  }
}

main();
