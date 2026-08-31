"use client";

import React, { useState } from "react";

type RaftRole = "Follower" | "PreCandidate" | "Candidate" | "Leader";

type RaftNodeState = {
  id: number;
  role: RaftRole;
  term: number;
  votedFor: number | null;
  logLength: number;
  isIsolated: boolean;
};

export function RaftSimulator() {
  const [preVoteEnabled, setPreVoteEnabled] = useState(true);
  const [nodes, setNodes] = useState<RaftNodeState[]>([
    { id: 1, role: "Leader", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
    { id: 2, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
    { id: 3, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
    { id: 4, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
    { id: 5, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
  ]);

  const [logs, setLogs] = useState<string[]>([
    "集群初始化完成：Node 1 成为 Term 1 权威 Leader",
    "心跳广播中：Node 2, 3, 4, 5 持续同步日志，保持 Follower 状态",
  ]);

  const addLog = (msg: string) => {
    setLogs((prev) => [msg, ...prev.slice(0, 7)]);
  };

  // Action 1: Isolate Node 5 (Asymmetric Partition)
  const isolateNode5 = () => {
    setNodes((prev) =>
      prev.map((n) => (n.id === 5 ? { ...n, isIsolated: true } : n))
    );
    addLog("⚠️ [故障注入] Node 5 遭遇非对称网络分区！无法收到 Leader 心跳。");
  };

  // Action 2: Trigger Election Timeout on Node 5
  const triggerTimeoutNode5 = () => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === 5) {
          if (preVoteEnabled) {
            addLog("🛡️ [Pre-Vote 模式] Node 5 超时，进入 PreCandidate 试探阶段 (Term 仍为 1，不污染集群！)");
            return { ...n, role: "PreCandidate" };
          } else {
            const newTerm = n.term + 1;
            addLog(`❌ [经典 Raft 模式] Node 5 超时，盲目递增 Term 至 ${newTerm} 并变为 Candidate！`);
            return { ...n, role: "Candidate", term: newTerm, votedFor: 5 };
          }
        }
        return n;
      })
    );
  };

  // Action 3: Heal Network Partition
  const healPartition = () => {
    setNodes((prev) => {
      const node5 = prev.find((n) => n.id === 5);
      if (!node5) return prev;

      if (!preVoteEnabled && node5.term > 1) {
        addLog(`💥 [脑裂震荡！] 分区自愈后，Node 5 (Term=${node5.term}) 发送 RPC 导致合法 Leader (Node 1) 被迫退位！集群陷入无主震荡！`);
        return prev.map((n) => {
          if (n.id === 1) return { ...n, role: "Follower", term: node5.term };
          if (n.id === 5) return { ...n, isIsolated: false, role: "Follower" };
          return { ...n, isIsolated: false };
        });
      } else {
        addLog("✅ [防御成功！] 分区自愈后，Node 5 重新收到合法 Leader 心跳，静默恢复为 Follower，集群 0 震荡！");
        return prev.map((n) => (n.id === 5 ? { ...n, isIsolated: false, role: "Follower", term: 1 } : { ...n, isIsolated: false }));
      }
    });
  };

  // Reset
  const resetCluster = () => {
    setNodes([
      { id: 1, role: "Leader", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
      { id: 2, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
      { id: 3, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
      { id: 4, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
      { id: 5, role: "Follower", term: 1, votedFor: 1, logLength: 5, isIsolated: false },
    ]);
    addLog("🔄 集群已重置为正常状态 (Node 1 为 Leader, Term 1)");
  };

  const getRoleBadgeStyle = (role: RaftRole, isIsolated: boolean) => {
    if (isIsolated) {
      return { background: "color-mix(in srgb, #ef4444 15%, transparent)", color: "#dc2626", border: "1px solid #ef4444" };
    }
    switch (role) {
      case "Leader":
        return { background: "color-mix(in srgb, #10b981 15%, transparent)", color: "#059669", border: "1px solid #10b981" };
      case "Candidate":
        return { background: "color-mix(in srgb, #f59e0b 15%, transparent)", color: "#d97706", border: "1px solid #f59e0b" };
      case "PreCandidate":
        return { background: "color-mix(in srgb, #8b5cf6 15%, transparent)", color: "#7c3aed", border: "1px solid #8b5cf6" };
      case "Follower":
        return { background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", border: "1px solid var(--accent)" };
    }
  };

  return (
    <div className="sandbox-card">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-wrap">
          <div className="sandbox-icon-badge" style={{ background: "#059669" }}>🏛️</div>
          <div>
            <h3 className="sandbox-title">Raft 分布式集群与网络分区交互式模拟器</h3>
            <p className="sandbox-subtitle">5 节点动态集群状态机，实操检验非对称网络分区下 Pre-Vote 如何防御脑裂震荡</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="sandbox-btn-group">
          <button
            type="button"
            onClick={() => setPreVoteEnabled(false)}
            className={`sandbox-btn ${!preVoteEnabled ? "active" : ""}`}
            style={!preVoteEnabled ? { color: "#dc2626" } : {}}
          >
            ❌ 经典 Raft (易脑裂)
          </button>
          <button
            type="button"
            onClick={() => setPreVoteEnabled(true)}
            className={`sandbox-btn ${preVoteEnabled ? "active" : ""}`}
            style={preVoteEnabled ? { color: "#059669" } : {}}
          >
            🛡️ Pre-Vote 保护模式
          </button>
        </div>
      </div>

      {/* 5-Node Interactive Visual Canvas */}
      <div className="raft-nodes-grid">
        {nodes.map((node) => {
          const cardClass = node.isIsolated
            ? "isolated"
            : node.role === "Leader"
            ? "leader"
            : node.role === "Candidate"
            ? "candidate"
            : node.role === "PreCandidate"
            ? "precandidate"
            : "";

          return (
            <div key={node.id} className={`raft-node-card ${cardClass}`}>
              <div className="raft-node-header">
                <span className="raft-node-id">Node {node.id}</span>
                <span className="raft-role-badge" style={getRoleBadgeStyle(node.role, node.isIsolated)}>
                  {node.isIsolated ? "⚠️ 孤立分区" : node.role}
                </span>
              </div>

              <div className="raft-node-metrics">
                <div className="raft-metric-row">
                  <span>Term:</span>
                  <span className="raft-metric-val">{node.term}</span>
                </div>
                <div className="raft-metric-row">
                  <span>投票给:</span>
                  <span className="raft-metric-val" style={{ color: "var(--accent)" }}>
                    {node.votedFor ? `Node ${node.votedFor}` : "None"}
                  </span>
                </div>
                <div className="raft-metric-row">
                  <span>Commit:</span>
                  <span className="raft-metric-val" style={{ color: "#059669" }}>
                    idx={node.logLength}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border-soft)" }}>
        <button
          type="button"
          onClick={isolateNode5}
          className="sandbox-action-btn danger"
        >
          1. 注入非对称分区 (孤立 Node 5)
        </button>

        <button
          type="button"
          onClick={triggerTimeoutNode5}
          className="sandbox-action-btn warning"
        >
          2. 触发 Node 5 选举超时 (多次点击观察 Term)
        </button>

        <button
          type="button"
          onClick={healPartition}
          className="sandbox-action-btn success"
        >
          3. 恢复网络分区 (观察 Leader 是否被罢免)
        </button>

        <button
          type="button"
          onClick={resetCluster}
          className="sandbox-action-btn"
        >
          🔄 重置集群
        </button>
      </div>

      {/* Realtime Event Log Terminal */}
      <div className="sandbox-terminal">
        <div className="sandbox-terminal-header">
          <span>实时状态机事件流 (EVENT STREAM)</span>
          <span className="sandbox-pulse-dot" />
        </div>
        <div className="sandbox-terminal-body">
          {logs.map((log, idx) => (
            <div key={idx} className={`sandbox-terminal-line ${idx === 0 ? "active" : ""}`}>
              <span className="sandbox-terminal-prompt">&gt;</span>
              <span className="sandbox-terminal-text">{log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
