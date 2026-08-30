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
            // Pre-Vote Enabled: Do NOT increment physical term!
            addLog("🛡️ [Pre-Vote 模式] Node 5 超时，进入 PreCandidate 试探阶段 (Term 仍为 1，不污染集群！)");
            return { ...n, role: "PreCandidate" };
          } else {
            // Classic Raft: Blindly increment term!
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
        // Classic Raft: Node 5 with Term > 1 enters, Leader gets deposed!
        addLog(`💥 [脑裂震荡！] 分区自愈后，Node 5 (Term=${node5.term}) 发送 RPC 导致合法 Leader (Node 1) 被迫退位！集群陷入无主震荡！`);
        return prev.map((n) => {
          if (n.id === 1) return { ...n, role: "Follower", term: node5.term };
          if (n.id === 5) return { ...n, isIsolated: false, role: "Follower" };
          return { ...n, isIsolated: false };
        });
      } else {
        // Pre-Vote Enabled: Node 5 quietly rejoins
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

  const getRoleBadge = (role: RaftRole, isIsolated: boolean) => {
    if (isIsolated) {
      return "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800";
    }
    switch (role) {
      case "Leader":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
      case "Candidate":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
      case "PreCandidate":
        return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800";
      case "Follower":
        return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
    }
  };

  return (
    <div className="not-prose my-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white shadow-sm">
              🏛️
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Raft 分布式集群与网络分区交互式模拟器
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            5 节点动态集群状态机，实操检验非对称网络分区下 Pre-Vote 如何防御脑裂震荡
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setPreVoteEnabled(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              !preVoteEnabled
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            ❌ 经典 Raft (易脑裂)
          </button>
          <button
            onClick={() => setPreVoteEnabled(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              preVoteEnabled
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            🛡️ Pre-Vote 保护模式
          </button>
        </div>
      </div>

      {/* 5-Node Interactive Visual Canvas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`relative rounded-xl border p-4 transition-all ${
              node.isIsolated
                ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20 shadow-sm"
                : node.role === "Leader"
                ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 shadow-sm"
                : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40"
            }`}
          >
            {/* Top Node Header */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">
                Node {node.id}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getRoleBadge(
                  node.role,
                  node.isIsolated
                )}`}
              >
                {node.isIsolated ? "⚠️ 孤立分区" : node.role}
              </span>
            </div>

            {/* Metrics */}
            <div className="mt-3 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>当前 Term:</span>
                <span className="font-bold text-slate-900 dark:text-white">{node.term}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>投票给 (votedFor):</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {node.votedFor ? `Node ${node.votedFor}` : "None"}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Commit 日志:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Index={node.logLength}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Controls */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-5 dark:border-slate-800">
        <button
          onClick={isolateNode5}
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          1. 注入非对称分区 (孤立 Node 5)
        </button>

        <button
          onClick={triggerTimeoutNode5}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
        >
          2. 触发 Node 5 选举超时 (多次点击观察 Term)
        </button>

        <button
          onClick={healPartition}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          3. 恢复网络分区 (观察 Leader 是否被罢免)
        </button>

        <button
          onClick={resetCluster}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          🔄 重置集群
        </button>
      </div>

      {/* Realtime Event Log Terminal */}
      <div className="mt-5 rounded-lg bg-slate-950 p-3.5 font-mono text-xs text-slate-300 shadow-inner">
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
          <span>实时状态机事件流 (EVENT STREAM)</span>
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="space-y-1">
          {logs.map((log, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-slate-600 select-none">&gt;</span>
              <span className={idx === 0 ? "text-white font-semibold" : "text-slate-400"}>
                {log}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
