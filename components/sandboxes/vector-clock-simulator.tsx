"use client";

import React, { useState } from "react";

type Vector = [number, number, number]; // [A, B, C]

type ClockEvent = {
  id: string;
  node: "A" | "B" | "C";
  vector: Vector;
  desc: string;
  timestamp: number;
};

export function VectorClockSimulator() {
  const [clocks, setClocks] = useState<{ A: Vector; B: Vector; C: Vector }>({
    A: [0, 0, 0],
    B: [0, 0, 0],
    C: [0, 0, 0],
  });

  const [history, setHistory] = useState<ClockEvent[]>([]);

  // Local Event on Node
  const triggerLocalEvent = (node: "A" | "B" | "C") => {
    setClocks((prev) => {
      const idx = node === "A" ? 0 : node === "B" ? 1 : 2;
      const newVec: Vector = [...prev[node]];
      newVec[idx] += 1;

      const event: ClockEvent = {
        id: `e-${Date.now()}-${node}`,
        node,
        vector: newVec,
        desc: `节点 ${node} 发生本地事件 (分量 [${node}]++ ──► [${newVec.join(",")}])`,
        timestamp: Date.now(),
      };

      setHistory((h) => [event, ...h.slice(0, 7)]);

      return {
        ...prev,
        [node]: newVec,
      };
    });
  };

  // Send message from src to dst
  const sendMessage = (src: "A" | "B" | "C", dst: "A" | "B" | "C") => {
    if (src === dst) return;

    setClocks((prev) => {
      const srcVec = prev[src];
      const dstIdx = dst === "A" ? 0 : dst === "B" ? 1 : 2;

      // Merge vectors: max each component, then increment dst's own component
      const mergedVec: Vector = [
        Math.max(srcVec[0], prev[dst][0]),
        Math.max(srcVec[1], prev[dst][1]),
        Math.max(srcVec[2], prev[dst][2]),
      ];
      mergedVec[dstIdx] += 1;

      const event: ClockEvent = {
        id: `msg-${Date.now()}`,
        node: dst,
        vector: mergedVec,
        desc: `节点 ${src} ──► 节点 ${dst} 消息合并 (取 max + [${dst}]++ ──► [${mergedVec.join(",")}])`,
        timestamp: Date.now(),
      };

      setHistory((h) => [event, ...h.slice(0, 7)]);

      return {
        ...prev,
        [dst]: mergedVec,
      };
    });
  };

  // Reset
  const resetAll = () => {
    setClocks({
      A: [0, 0, 0],
      B: [0, 0, 0],
      C: [0, 0, 0],
    });
    setHistory([]);
  };

  // Compare A and B vectors
  const compareRelation = (v1: Vector, v2: Vector) => {
    const v1LeV2 = v1.every((val, i) => val <= v2[i]);
    const v2LeV1 = v2.every((val, i) => val <= v1[i]);

    if (v1LeV2 && v2LeV1) return { text: "完全相同 (Identical)", color: "text-slate-600" };
    if (v1LeV2) return { text: "因果先后 (V_A 先于 V_B 发生, V_A < V_B)", color: "text-blue-600 font-bold" };
    if (v2LeV1) return { text: "因果先后 (V_B 先于 V_A 发生, V_B < V_A)", color: "text-blue-600 font-bold" };
    return { text: "⚡ 并发分叉冲突！(V_A ∥ V_B，无绝对因果先后)", color: "text-orange-600 font-bold" };
  };

  const abRelation = compareRelation(clocks.A, clocks.B);

  return (
    <div className="not-prose my-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm">
              🧭
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              向量时钟（Vector Clock）因果分叉与冲突判定沙盒
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            三节点分布式时序生命线，交互式演示 Happens-Before 因果先后与并发冲突分支判定
          </p>
        </div>

        <button
          onClick={resetAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          🔄 重置时钟
        </button>
      </div>

      {/* 3 Nodes Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["A", "B", "C"] as const).map((node) => (
          <div
            key={node}
            className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200">节点 {node}</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                维度 [{node}]
              </span>
            </div>

            {/* Current Vector */}
            <div className="mt-3 rounded-lg bg-white p-3 text-center border border-slate-200/80 shadow-sm dark:bg-slate-900 dark:border-slate-700">
              <div className="text-[11px] text-slate-400">当前向量值 [A, B, C]</div>
              <div className="mt-1 font-mono text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                [{clocks[node].join(", ")}]
              </div>
            </div>

            {/* Actions for this node */}
            <div className="mt-4 space-y-2">
              <button
                onClick={() => triggerLocalEvent(node)}
                className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                + 产生本地事件 (分量 [{node}]++)
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                {(["A", "B", "C"] as const)
                  .filter((target) => target !== node)
                  .map((target) => (
                    <button
                      key={target}
                      onClick={() => sendMessage(node, target)}
                      className="rounded-md border border-slate-300 bg-white py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      发消息给 {target} ──►
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Causality Relation Matrix */}
      <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50/40 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
        <div className="text-xs font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
          🎯 实时因果偏序与冲突判定 (Node A vs Node B)
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-sm">
          <div>
            $V_A = [{clocks.A.join(", ")}]$ vs $V_B = [{clocks.B.join(", ")}]$
          </div>
          <div className={`text-xs ${abRelation.color}`}>{abRelation.text}</div>
        </div>
      </div>

      {/* Event History */}
      <div className="mt-5 rounded-lg bg-slate-950 p-3.5 font-mono text-xs text-slate-300 shadow-inner">
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
          <span>事件与因果演进轨迹 (TIMELINE)</span>
          <span className="text-[10px] text-slate-500">共 {history.length} 个历史事件</span>
        </div>
        <div className="space-y-1">
          {history.length === 0 ? (
            <div className="text-slate-600">点击上方按钮产生本地事件或发送消息...</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex gap-2">
                <span className="text-blue-500 font-bold">&gt;</span>
                <span className="text-slate-300">{h.desc}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
