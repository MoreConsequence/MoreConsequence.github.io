"use client";

import React, { useState } from "react";
import Link from "next/link";

const BLOCK_SIZE = 16; // 每个 Block 容纳 16 个 Token
const TOTAL_PHYSICAL_BLOCKS = 12;

type PhysicalBlock = {
  id: number;
  tokensCount: number;
  refCount: number;
  dataSummary: string;
  isPinned: boolean;
  isSwappedToCpu: boolean;
  lastAction?: "alloc" | "cow" | "share" | "swap";
};

type Sequence = {
  id: string;
  name: string;
  color: string;
  logicalBlocks: number[]; // 指向 physical block id
  totalTokens: number;
  isSwapped: boolean;
};

export function PagedAttentionSimulator() {
  const [physicalBlocks, setPhysicalBlocks] = useState<PhysicalBlock[]>([
    { id: 0, tokensCount: 16, refCount: 2, dataSummary: "SysPrompt [0..15]", isPinned: true, isSwappedToCpu: false },
    { id: 1, tokensCount: 16, refCount: 2, dataSummary: "SysPrompt [16..31]", isPinned: true, isSwappedToCpu: false },
    { id: 2, tokensCount: 12, refCount: 1, dataSummary: "SeqA-Prompt [32..43]", isPinned: false, isSwappedToCpu: false },
    { id: 3, tokensCount: 8,  refCount: 1, dataSummary: "SeqB-Prompt [32..39]", isPinned: false, isSwappedToCpu: false },
    { id: 4, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 5, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 6, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 7, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 8, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 9, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 10, tokensCount: 0, refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    { id: 11, tokensCount: 0, refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
  ]);

  const [sequences, setSequences] = useState<Sequence[]>([
    { id: "seq-a", name: "请求 A (Chat)", color: "var(--accent)", logicalBlocks: [0, 1, 2], totalTokens: 44, isSwapped: false },
    { id: "seq-b", name: "请求 B (Agent)", color: "var(--primary, #0ea5e9)", logicalBlocks: [0, 1, 3], totalTokens: 40, isSwapped: false },
  ]);

  const [logs, setLogs] = useState<string[]>([
    "🚀 [初始化] vLLM 块分配器启动：物理块大小 B=16 Token，全局可用块数 N=12",
    "🔗 [前缀共享] 请求 A 与请求 B 共享 System Prompt (Block 0 & 1)，物理引用计数 ref_count=2",
    "💡 [零拷贝] 传统架构需占用 4 个连续 Block (64 Tokens 显存)，PagedAttention 仅占用 2 个物理 Block，节约 50% 显存！",
  ]);

  const [viewMode, setViewMode] = useState<"paged" | "contiguous">("paged");

  const addLog = (msg: string) => {
    setLogs((prev) => [msg, ...prev.slice(0, 8)]);
  };

  // 1. 生成 4 个新 Token (Append Tokens to Sequence A)
  const appendTokensSeqA = () => {
    setSequences((prevSeqs) => {
      const seqA = prevSeqs.find((s) => s.id === "seq-a");
      if (!seqA || seqA.isSwapped) {
        addLog("⚠️ 请求 A 当前处于换出状态或不存在，无法推进 Decode！");
        return prevSeqs;
      }

      const currentLastBlockId = seqA.logicalBlocks[seqA.logicalBlocks.length - 1];
      const targetBlock = physicalBlocks[currentLastBlockId];

      if (targetBlock.tokensCount + 4 <= BLOCK_SIZE) {
        // 当前块未满，原地追加
        setPhysicalBlocks((prevBlocks) =>
          prevBlocks.map((b) =>
            b.id === currentLastBlockId
              ? { ...b, tokensCount: b.tokensCount + 4, dataSummary: `SeqA [${seqA.totalTokens}..${seqA.totalTokens + 3}]` }
              : b
          )
        );
        addLog(`⚡ [自回归生成] 请求 A 追加 4 个 Token，物理块 ${currentLastBlockId} 占用升至 ${targetBlock.tokensCount + 4}/${BLOCK_SIZE}`);
        return prevSeqs.map((s) => (s.id === "seq-a" ? { ...s, totalTokens: s.totalTokens + 4 } : s));
      } else {
        // 当前块已满，从 Free List 申请新物理块
        const freeBlock = physicalBlocks.find((b) => b.refCount === 0 && !b.isSwappedToCpu);
        if (!freeBlock) {
          addLog("💥 [GPU OOM] 物理空闲块耗尽！触发显存水线下紧急抢占/换出机制！");
          return prevSeqs;
        }

        setPhysicalBlocks((prevBlocks) =>
          prevBlocks.map((b) =>
            b.id === freeBlock.id
              ? { ...b, refCount: 1, tokensCount: 4, dataSummary: `SeqA [${seqA.totalTokens}..${seqA.totalTokens + 3}]`, lastAction: "alloc" }
              : b
          )
        );

        addLog(`📦 [申请新页] 请求 A 当前块已填满，虚拟页表分配新物理块 ${freeBlock.id}，完成页表映射`);
        return prevSeqs.map((s) =>
          s.id === "seq-a"
            ? { ...s, logicalBlocks: [...s.logicalBlocks, freeBlock.id], totalTokens: s.totalTokens + 4 }
            : s
        );
      }
    });
  };

  // 2. 派生并行分支并触发写时复制 (Parallel Branching / CoW)
  const triggerCoWBranch = () => {
    const existingBranch = sequences.find((s) => s.id === "seq-a-branch");
    if (existingBranch) {
      addLog("ℹ️ 并行分支 A' 已经存在。可直接点击生成 Token 观察 CoW 行为。");
      return;
    }

    const seqA = sequences.find((s) => s.id === "seq-a");
    if (!seqA) return;

    // 增加 seqA 所使用的所有块的 refCount
    setPhysicalBlocks((prevBlocks) =>
      prevBlocks.map((b) =>
        seqA.logicalBlocks.includes(b.id)
          ? { ...b, refCount: b.refCount + 1, lastAction: "share" }
          : b
      )
    );

    const newBranch: Sequence = {
      id: "seq-a-branch",
      name: "分支 A' (Beam Search)",
      color: "var(--warning, #eab308)",
      logicalBlocks: [...seqA.logicalBlocks],
      totalTokens: seqA.totalTokens,
      isSwapped: false,
    };

    setSequences((prev) => [...prev, newBranch]);
    addLog("🌱 [并行分支派生] 模拟 Beam Search 采样：生成分支 A'，完全共享父级物理块，零内存拷贝！");
  };

  // 3. 分支 A' 进行独立写入，触发物理块写时复制
  const writeBranchCoW = () => {
    const branch = sequences.find((s) => s.id === "seq-a-branch");
    if (!branch) {
      addLog("⚠️ 请先点击【派生并行采样分支】创建分支 A'！");
      return;
    }

    const lastBlockId = branch.logicalBlocks[branch.logicalBlocks.length - 1];
    const targetBlock = physicalBlocks[lastBlockId];

    if (targetBlock.refCount > 1) {
      // 触发 CoW：目标块被共享，必须深拷贝到新的空闲块
      const freeBlock = physicalBlocks.find((b) => b.refCount === 0 && !b.isSwappedToCpu);
      if (!freeBlock) {
        addLog("💥 [GPU OOM] 没有空闲物理块用于执行 CoW 深拷贝！");
        return;
      }

      setPhysicalBlocks((prevBlocks) =>
        prevBlocks.map((b) => {
          if (b.id === lastBlockId) {
            return { ...b, refCount: b.refCount - 1 };
          }
          if (b.id === freeBlock.id) {
            return {
              ...b,
              refCount: 1,
              tokensCount: targetBlock.tokensCount,
              dataSummary: `BranchA' [CoW Clone]`,
              lastAction: "cow",
            };
          }
          return b;
        })
      );

      setSequences((prev) =>
        prev.map((s) =>
          s.id === "seq-a-branch"
            ? {
                ...s,
                logicalBlocks: s.logicalBlocks.map((id) => (id === lastBlockId ? freeBlock.id : id)),
              }
            : s
        )
      );

      addLog(`✂️ [写时复制 CoW 触发] 分支 A' 尝试写入共享块 ${lastBlockId} (ref_count>1)！`);
      addLog(`✨ [零拷贝隔离] 原物理块 ${lastBlockId} 引用递减至 ${targetBlock.refCount - 1}；深拷贝数据至物理块 ${freeBlock.id} 并更新分支 A' 页表！`);
    } else {
      // 独占块，直接写入
      setPhysicalBlocks((prevBlocks) =>
        prevBlocks.map((b) =>
          b.id === lastBlockId ? { ...b, tokensCount: Math.min(BLOCK_SIZE, b.tokensCount + 2) } : b
        )
      );
      addLog(`✏️ [独占块写入] 分支 A' 的最后块已是独占块 (ref_count=1)，直接写入无须 CoW。`);
    }
  };

  // 4. 显存高压驱逐：将请求 B 换出到 CPU (Swap-out)
  const triggerSwapOut = () => {
    const seqB = sequences.find((s) => s.id === "seq-b");
    if (!seqB || seqB.isSwapped) {
      addLog("ℹ️ 请求 B 已换出到 CPU，或不存在。");
      return;
    }

    // 释放仅属于 seqB 的独占物理块
    setPhysicalBlocks((prevBlocks) =>
      prevBlocks.map((b) => {
        if (seqB.logicalBlocks.includes(b.id)) {
          if (b.refCount === 1) {
            return { ...b, refCount: 0, tokensCount: 0, dataSummary: "Free (Evicted)", isSwappedToCpu: true };
          } else {
            return { ...b, refCount: b.refCount - 1 };
          }
        }
        return b;
      })
    );

    setSequences((prev) =>
      prev.map((s) => (s.id === "seq-b" ? { ...s, isSwapped: true } : s))
    );

    addLog("❄️ [显存抢占 Swap-out] 显存不足！调度器挂起低优先级请求 B，将其独占 KV 块转存至 CPU 内存，释放 GPU 块！");
  };

  // 5. 换入请求 B (Swap-in)
  const triggerSwapIn = () => {
    const seqB = sequences.find((s) => s.id === "seq-b");
    if (!seqB || !seqB.isSwapped) {
      addLog("ℹ️ 请求 B 当前已在 GPU 显存中。");
      return;
    }

    const freeBlock = physicalBlocks.find((b) => b.refCount === 0);
    if (!freeBlock) {
      addLog("⚠️ 没有空闲 GPU 物理块，无法完成换入！请等待其他请求结束。");
      return;
    }

    setPhysicalBlocks((prevBlocks) =>
      prevBlocks.map((b) => {
        if (b.id === 0 || b.id === 1) {
          return { ...b, refCount: b.refCount + 1 };
        }
        if (b.id === freeBlock.id) {
          return {
            ...b,
            refCount: 1,
            tokensCount: 8,
            dataSummary: "SeqB-Prompt [Restored]",
            isSwappedToCpu: false,
            lastAction: "alloc",
          };
        }
        return b;
      })
    );

    setSequences((prev) =>
      prev.map((s) =>
        s.id === "seq-b"
          ? { ...s, isSwapped: false, logicalBlocks: [0, 1, freeBlock.id] }
          : s
      )
    );

    addLog(`🔥 [热复苏 Swap-in] 请求 B 被调度器重新激活，通过 PCIe DMA 换入 GPU 物理块 ${freeBlock.id}，恢复推理！`);
  };

  // 重置状态
  const resetSimulator = () => {
    setPhysicalBlocks([
      { id: 0, tokensCount: 16, refCount: 2, dataSummary: "SysPrompt [0..15]", isPinned: true, isSwappedToCpu: false },
      { id: 1, tokensCount: 16, refCount: 2, dataSummary: "SysPrompt [16..31]", isPinned: true, isSwappedToCpu: false },
      { id: 2, tokensCount: 12, refCount: 1, dataSummary: "SeqA-Prompt [32..43]", isPinned: false, isSwappedToCpu: false },
      { id: 3, tokensCount: 8,  refCount: 1, dataSummary: "SeqB-Prompt [32..39]", isPinned: false, isSwappedToCpu: false },
      { id: 4, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 5, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 6, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 7, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 8, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 9, tokensCount: 0,  refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 10, tokensCount: 0, refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
      { id: 11, tokensCount: 0, refCount: 0, dataSummary: "Free Block", isPinned: false, isSwappedToCpu: false },
    ]);
    setSequences([
      { id: "seq-a", name: "请求 A (Chat)", color: "var(--accent)", logicalBlocks: [0, 1, 2], totalTokens: 44, isSwapped: false },
      { id: "seq-b", name: "请求 B (Agent)", color: "var(--primary, #0ea5e9)", logicalBlocks: [0, 1, 3], totalTokens: 40, isSwapped: false },
    ]);
    setLogs(["🔄 沙盒状态已重置为初始状态。"]);
  };

  // 统计指标计算
  const allocatedBlocks = physicalBlocks.filter((b) => b.refCount > 0);
  const totalTokensStored = physicalBlocks.reduce((acc, b) => acc + (b.refCount > 0 ? b.tokensCount : 0), 0);
  const totalCapacityTokens = allocatedBlocks.length * BLOCK_SIZE;
  const internalFragmentation = totalCapacityTokens > 0 ? (((totalCapacityTokens - totalTokensStored) / totalCapacityTokens) * 100).toFixed(1) : "0";
  const memoryUtilization = ((allocatedBlocks.length / TOTAL_PHYSICAL_BLOCKS) * 100).toFixed(1);

  return (
    <div className="sandbox-container">
      {/* 顶部控制面板 */}
      <div className="sandbox-header">
        <div>
          <h2 className="sandbox-title">PagedAttention 显存虚拟分页与 CoW 交互沙盘</h2>
          <p className="sandbox-subtitle">
            直观理解操作系统虚拟内存分页哲学在大模型中的投射：物理块池、逻辑页表、前缀零拷贝共享与写时复制（Copy-on-Write）分支。
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={`sandbox-btn ${viewMode === "paged" ? "sandbox-btn-active" : ""}`}
            onClick={() => setViewMode("paged")}
          >
            PagedAttention 视图
          </button>
          <button
            type="button"
            className={`sandbox-btn ${viewMode === "contiguous" ? "sandbox-btn-active" : ""}`}
            onClick={() => setViewMode("contiguous")}
          >
            传统连续内存对比
          </button>
        </div>
      </div>

      {/* 实时物理指标仪表盘 */}
      <div className="sandbox-metrics-bar">
        <div className="sandbox-metric-card">
          <span className="sandbox-metric-label">GPU 物理块利用率</span>
          <span className="sandbox-metric-value">{memoryUtilization}%</span>
          <small>{allocatedBlocks.length} / {TOTAL_PHYSICAL_BLOCKS} 块占用</small>
        </div>
        <div className="sandbox-metric-card">
          <span className="sandbox-metric-label">活跃逻辑会话数</span>
          <span className="sandbox-metric-value">{sequences.filter((s) => !s.isSwapped).length}</span>
          <small>{sequences.length} 总会话 (含换出)</small>
        </div>
        <div className="sandbox-metric-card">
          <span className="sandbox-metric-label">内部碎片率 (Internal Frag)</span>
          <span className="sandbox-metric-value" style={{ color: viewMode === "contiguous" ? "var(--danger, #ef4444)" : "inherit" }}>
            {viewMode === "contiguous" ? "68.5%" : `${internalFragmentation}%`}
          </span>
          <small>{viewMode === "contiguous" ? "按 max_tokens 预分配导致" : "仅最后物理块存在尾部余量"}</small>
        </div>
        <div className="sandbox-metric-card">
          <span className="sandbox-metric-label">前缀共享节省显存</span>
          <span className="sandbox-metric-value" style={{ color: "var(--accent)" }}>
            {viewMode === "contiguous" ? "0%" : "32 Tokens (2 块)"}
          </span>
          <small>Block 0 & 1 零拷贝复用</small>
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="sandbox-actions-toolbar">
        <button type="button" className="sandbox-action-btn primary" onClick={appendTokensSeqA}>
          ➕ 请求 A 生成 Token (+4 Tokens)
        </button>
        <button type="button" className="sandbox-action-btn" onClick={triggerCoWBranch}>
          🌿 派生并行采样分支 (Beam Search)
        </button>
        <button type="button" className="sandbox-action-btn warning" onClick={writeBranchCoW}>
          ✂️ 分支 A&apos; 独占写入 (触发 CoW)
        </button>
        <button type="button" className="sandbox-action-btn danger" onClick={triggerSwapOut}>
          ❄️ 显存高压换出 (Swap-Out B)
        </button>
        <button type="button" className="sandbox-action-btn success" onClick={triggerSwapIn}>
          🔥 显存换入 (Swap-In B)
        </button>
        <button type="button" className="sandbox-action-btn secondary" onClick={resetSimulator}>
          🔄 重置沙盘
        </button>
      </div>

      {viewMode === "paged" ? (
        <div className="sandbox-paged-grid-layout">
          {/* 左侧：逻辑页表 (Logical Block Tables) */}
          <div className="sandbox-panel">
            <h3 className="sandbox-panel-title">1. 逻辑序列与页表映射 (Block Tables)</h3>
            <p className="sandbox-panel-desc">
              每个请求维护单调递增的逻辑块号（Logical Block Number），通过虚拟映射表指向非连续的物理显存块。
            </p>

            <div className="sandbox-seq-list">
              {sequences.map((seq) => (
                <div
                  key={seq.id}
                  className="sandbox-seq-card"
                  style={{
                    borderLeft: `4px solid ${seq.color}`,
                    opacity: seq.isSwapped ? 0.6 : 1,
                  }}
                >
                  <div className="sandbox-seq-header">
                    <strong>{seq.name}</strong>
                    <span>
                      {seq.isSwapped ? (
                        <span className="sandbox-badge-evicted">已换出至 CPU</span>
                      ) : (
                        <span className="sandbox-badge-active">{seq.totalTokens} Tokens</span>
                      )}
                    </span>
                  </div>
                  <div className="sandbox-block-table-row">
                    <span className="sandbox-bt-label">页表映射:</span>
                    <div className="sandbox-bt-chain">
                      {seq.logicalBlocks.map((physId, lIndex) => {
                        const physBlock = physicalBlocks[physId];
                        return (
                          <div key={lIndex} className="sandbox-bt-slot">
                            <span className="sandbox-bt-logic">L#{lIndex}</span>
                            <span className="sandbox-bt-arrow">➔</span>
                            <span
                              className="sandbox-bt-phys"
                              style={{
                                background: physBlock?.refCount > 1 ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--surface)",
                              }}
                            >
                              P#{physId}
                              {physBlock?.refCount > 1 ? <small> (共享)</small> : null}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：GPU 物理显存块池 (Physical GPU Memory Pool) */}
          <div className="sandbox-panel">
            <h3 className="sandbox-panel-title">2. GPU 物理显存块池 (Physical HBM Blocks)</h3>
            <p className="sandbox-panel-desc">
              全局显存被划分为大小固定的物理块（每个 B=16 Token）。物理块可非连续存放，支持跨序列引用计数与零拷贝共享。
            </p>

            <div className="sandbox-phys-grid">
              {physicalBlocks.map((block) => {
                const isOccupied = block.refCount > 0;
                const isShared = block.refCount > 1;
                const fillPercent = (block.tokensCount / BLOCK_SIZE) * 100;

                return (
                  <div
                    key={block.id}
                    className={`sandbox-phys-block ${isOccupied ? "occupied" : "free"} ${isShared ? "shared" : ""} ${block.isSwappedToCpu ? "swapped" : ""}`}
                  >
                    <div className="sandbox-pb-head">
                      <strong>Block #{block.id}</strong>
                      <span className={`sandbox-pb-ref ${isShared ? "high-ref" : ""}`}>
                        ref: {block.refCount}
                      </span>
                    </div>

                    <div className="sandbox-pb-meter">
                      <div className="sandbox-pb-fill" style={{ width: `${fillPercent}%` }} />
                    </div>

                    <div className="sandbox-pb-body">
                      <span className="sandbox-pb-tokens">{block.tokensCount} / {BLOCK_SIZE} Tokens</span>
                      <small className="sandbox-pb-data">{block.dataSummary}</small>
                    </div>

                    {isShared && <div className="sandbox-pb-tag">CoW 保护</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* 传统连续内存对比模式 */
        <div className="sandbox-contiguous-view">
          <div className="sandbox-alert warning">
            <strong>⚠️ 传统连续显存预分配模式（无 PagedAttention）：</strong>
            必须在请求启动时，按照客户声明的 <code>max_tokens = 2048</code> 一次性预分配巨大的连续物理显存空间。
          </div>

          <div className="sandbox-contiguous-diagram">
            <div className="sandbox-contig-row">
              <div className="sandbox-contig-label">请求 A 预分配槽位 (2048 Tokens):</div>
              <div className="sandbox-contig-bar">
                <div className="sandbox-contig-used" style={{ width: "12%" }}>真实写入 44 Tokens (2.1%)</div>
                <div className="sandbox-contig-internal-frag" style={{ width: "88%" }}>内部碎片浪费：保留未用显存 (97.9% 闲置且他人不可用)</div>
              </div>
            </div>

            <div className="sandbox-contig-row">
              <div className="sandbox-contig-label">请求 B 预分配槽位 (2048 Tokens):</div>
              <div className="sandbox-contig-bar">
                <div className="sandbox-contig-used" style={{ width: "10%" }}>真实写入 40 Tokens (1.9%)</div>
                <div className="sandbox-contig-internal-frag" style={{ width: "90%" }}>内部碎片浪费：保留未用显存 (98.1% 闲置)</div>
              </div>
            </div>

            <div className="sandbox-contig-row">
              <div className="sandbox-contig-label">剩余未分配显存 (外部碎片):</div>
              <div className="sandbox-contig-bar external">
                <span>碎片化离散小块，无法容纳任何新请求的 2048 连续预分配 ➔ <strong>显存假死 OOM！</strong></span>
              </div>
            </div>
          </div>

          <div className="sandbox-comparison-summary">
            <h4>💡 核心本质对比：</h4>
            <p>
              在传统连续显存模式下，单卡 80GB HBM 只能并发承接 <strong>10~15 个请求</strong> 即宣告显存耗尽（因每个请求被预扣了未发生的数百兆显存）；
              而在 PagedAttention 下，物理块按需 16 字节动态分页分配，并发吞吐跃升至 <strong>60~80 个并发请求</strong>，吞吐直接提升 <strong>4~5 倍</strong>！
            </p>
          </div>
        </div>
      )}

      {/* 实时事件与调测时序日志流 */}
      <div className="sandbox-logs-panel">
        <h4 className="sandbox-logs-title">📋 内核分页与调度事件流 (Kernel Page Allocation Trace)</h4>
        <div className="sandbox-log-list">
          {logs.map((log, idx) => (
            <div key={idx} className="sandbox-log-item">
              <span className="sandbox-log-idx">#{logs.length - idx}</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 关联深度博文 */}
      <div className="sandbox-footer-link">
        <span>📖 想深入推导 PagedAttention 显存物理公式与 Block Table 映射源码？阅读专栏长文：</span>
        <Link href="/writing/ai-backend-16-paged-attention-kv-cache-virtual-memory">
          《PagedAttention 与显存虚拟化：操作系统的虚拟内存分页哲学如何终结大模型显存碎片》➔
        </Link>
      </div>
    </div>
  );
}
