#!/usr/bin/env node
// 2PC / SAGA / Outbox 在同一组故障注入下的行为对照。
// 模型：订单服务(O) + 支付服务(P)。目标一致性：订单创建 ⇔ 扣款。
// 确定性模拟，无随机数；每个故障点是显式注入的崩溃位置。

// ---------- 2PC：协调者日志驱动的两阶段 ----------
function twoPC(crashAfter) {
  // steps: 0 prepare-O, 1 prepare-P, 2 commit-O, 3 commit-P
  const state = { oPrepared: false, pPrepared: false, oCommitted: false, pCommitted: false };
  const steps = [
    () => { state.oPrepared = true; },
    () => { state.pPrepared = true; },
    () => { state.oCommitted = true; },
    () => { state.pCommitted = true; },
  ];
  let crashed = false;
  for (let i = 0; i < steps.length; i++) {
    if (i === crashAfter) { crashed = true; break; }
    steps[i]();
  }
  if (!crashed) return { instant: "全部完成", final: "一致", who: "—" };
  if (!state.oPrepared && !state.pPrepared) return { instant: "无人行动", final: "一致", who: "—" };
  if (state.oPrepared && state.pPrepared && !state.oCommitted && !state.pCommitted)
    return { instant: "双方已准备、未提交(in-doubt)", final: "一致(恢复后统一裁决)", who: "协调者日志" };
  if (state.oPrepared !== state.pPrepared)
    return { instant: "单边已锁资源(in-doubt)", final: "一致(协调者恢复后裁决)", who: "协调者日志" };
  if (state.oCommitted !== state.pCommitted)
    return { instant: "单边已提交", final: "一致(协调者恢复后补齐)", who: "协调者日志" };
  return { instant: "?", final: "?", who: "?" };
}

// ---------- SAGA：顺序本地事务 + 补偿 ----------
function saga(crashAfter, compFails = false) {
  const state = { orderCreated: false, charged: false, compensated: false, manual: false };
  const fwd = [
    () => { state.orderCreated = true; },          // 本地事务 1
    () => { state.charged = true; },               // 本地事务 2
  ];
  for (let i = 0; i < fwd.length; i++) {
    if (i === crashAfter) break;
    fwd[i]();
  }
  if (!state.orderCreated && !state.charged) return { instant: "无人行动", final: "一致", who: "—" };
  if (state.orderCreated && !state.charged && crashAfter === 1) {
    // 恢复流程：执行补偿 cancelOrder
    if (compFails) { state.manual = true; }
    else state.compensated = true;
  }
  if (state.charged) return { instant: "两步都完成", final: "一致", who: "—" };
  if (state.compensated) return { instant: "中间态可见(订单存在未扣款)", final: "一致(补偿撤销订单)", who: "SAGA 编排器" };
  if (state.manual) return { instant: "补偿失败", final: "不一致→人工对账", who: "人工" };
  return { instant: "?", final: "?", who: "?" };
}

// ---------- Outbox：本库事务 + 至少一次投递 + 幂等消费 ----------
function outbox(failAt) {
  // failAt: 'relay-crash-before-ack'(已发布未标记) | 'consumer-crash-after-charge'(已扣款未确认)
  const state = { orderAndEvent: false, published: 0, charged: 0, marked: false, acked: false };
  state.orderAndEvent = true;            // 同一本地事务：订单+事件原子落库
  if (failAt === null) {
    state.published = 1; state.charged = 1; state.marked = true; state.acked = true;
    return { instant: "全链完成", final: "一致", who: "—" };
  }
  if (failAt === "relay-crash-before-ack") {
    state.published = 1;                 // 已投递但未标记 → relay 重发
    state.charged = 1;                   // 消费端幂等键去重：只扣一次
    state.marked = true;
    return { instant: "事件可能重复投递", final: "一致(幂等消费去重)", who: "relay 重试" };
  }
  if (failAt === "consumer-crash-after-charge") {
    state.published = 1; state.charged = 1; // 扣款成功但 ACK 丢失 → 再投递
    state.published += 1;                    // 重投
    return { instant: "重复投递中", final: "一致(幂等键拒绝二次扣款)", who: "relay 重试" };
  }
  return { instant: "?", final: "?", who: "?" };
}

const row = (pattern, fault, r) =>
  `| ${pattern} | ${fault} | ${r.instant} | ${r.final} | ${r.who} |`;

console.log("确定性故障注入 · 订单⇔扣款一致性 · 无随机数");
console.log("");
console.log("| 模式 | 故障注入点 | 崩溃瞬间 | 恢复后终态 | 恢复者 |");
console.log("| --- | --- | --- | --- | --- |");
console.log(row("2PC", "prepare 前", twoPC(0)));
console.log(row("2PC", "O 已准备/P 未准备", twoPC(1)));
console.log(row("2PC", "双方已备、未提交时崩溃", twoPC(2)));
console.log(row("2PC", "commit-O 已执行/P 未执行", twoPC(3)));
console.log(row("SAGA", "第一步前", saga(0)));
console.log(row("SAGA", "订单已建/未扣款", saga(1)));
console.log(row("SAGA", "同上且补偿也失败", saga(1, true)));
console.log(row("Outbox", "无故障", outbox(null)));
console.log(row("Outbox", "relay 已投递未标记", outbox("relay-crash-before-ack")));
console.log(row("Outbox", "消费端已扣款丢 ACK", outbox("consumer-crash-after-charge")));
