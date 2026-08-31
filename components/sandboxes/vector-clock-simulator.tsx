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

    if (v1LeV2 && v2LeV1) return { text: "完全相同 (Identical)", color: "var(--muted)" };
    if (v1LeV2) return { text: "因果先后 (V_A 先于 V_B 发生, V_A < V_B)", color: "var(--accent)" };
    if (v2LeV1) return { text: "因果先后 (V_B 先于 V_A 发生, V_B < V_A)", color: "var(--accent)" };
    return { text: "⚡ 并发分叉冲突！(V_A ∥ V_B，无因果先后)", color: "#ea580c" };
  };

  const abRelation = compareRelation(clocks.A, clocks.B);

  return (
    <div className="sandbox-card">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-wrap">
          <div className="sandbox-icon-badge">🧭</div>
          <div>
            <h3 className="sandbox-title">向量时钟（Vector Clock）因果分叉与冲突判定沙盒</h3>
            <p className="sandbox-subtitle">三节点分布式时序生命线，交互式演示 Happens-Before 因果先后与并发冲突分支判定</p>
          </div>
        </div>

        <button
          type="button"
          onClick={resetAll}
          className="sandbox-action-btn"
        >
          🔄 重置时钟
        </button>
      </div>

      {/* 3 Nodes Cards */}
      <div className="vc-nodes-grid">
        {(["A", "B", "C"] as const).map((node) => (
          <div key={node} className="vc-node-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: "var(--foreground)" }}>节点 {node}</span>
              <span className="sandbox-pill accent">维度 [{node}]</span>
            </div>

            {/* Current Vector */}
            <div className="vc-vector-display">
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>当前向量值 [A, B, C]</div>
              <div className="vc-vector-text">
                [{clocks[node].join(", ")}]
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => triggerLocalEvent(node)}
                className="sandbox-action-btn primary"
                style={{ justifyContent: "center", width: "100%" }}
              >
                + 产生本地事件 (分量 [{node}]++)
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
                {(["A", "B", "C"] as const)
                  .filter((target) => target !== node)
                  .map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => sendMessage(node, target)}
                      className="sandbox-action-btn"
                      style={{ justifyContent: "center", fontSize: "0.7rem" }}
                    >
                      发给 {target} ──►
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Causality Relation Matrix */}
      <div className="vc-relation-box">
        <div className="vc-relation-title">
          🎯 实时因果偏序与冲突判定 (Node A vs Node B)
        </div>
        <div className="vc-relation-content">
          <div>
            V_A = [{clocks.A.join(", ")}] vs V_B = [{clocks.B.join(", ")}]
          </div>
          <div style={{ fontWeight: 700, color: abRelation.color }}>
            {abRelation.text}
          </div>
        </div>
      </div>

      {/* Event History Terminal */}
      <div className="sandbox-terminal">
        <div className="sandbox-terminal-header">
          <span>事件与因果演进轨迹 (TIMELINE)</span>
          <span style={{ fontSize: "0.65rem", color: "#64748b" }}>共 {history.length} 个事件</span>
        </div>
        <div className="sandbox-terminal-body">
          {history.length === 0 ? (
            <div style={{ color: "#64748b" }}>点击上方按钮产生本地事件或跨节点发送消息...</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="sandbox-terminal-line active">
                <span className="sandbox-terminal-prompt">&gt;</span>
                <span className="sandbox-terminal-text">{h.desc}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
