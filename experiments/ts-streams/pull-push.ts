// async generator 是 pull 模型。每个消费者使用独立 producer，避免上一轮
// 的全局计数污染下一轮观察。
async function* producer(label: string) {
  for (let i = 0; i < 5; i++) {
    console.log(`${label} 生产 ${i}`);
    yield i;
  }
}

// ---- 消费者 A：每收一条 sleep 100ms，看生产是否被拉——被拉 = 背压生效
async function slowConsumer() {
  console.log("=== 慢消费者 (每条处理 100ms) ===");
  for await (const item of producer("slow")) {
    await new Promise((r) => setTimeout(r, 100));
    console.log(`  消费 ${item}`);
  }
}

// ---- 消费者 B：一次性收集到数组再处理——生产者全速跑完
async function eagerConsumer() {
  console.log("=== 贪婪消费者 (先全部收集) ===");
  const all: number[] = [];
  for await (const item of producer("eager")) all.push(item);
  await new Promise((r) => setTimeout(r, 100));
  console.log(`  收集到 ${all.length} 条后统一处理`);
}

const run = async () => {
  await slowConsumer();
  console.log("---");
  await eagerConsumer();
};
run();
