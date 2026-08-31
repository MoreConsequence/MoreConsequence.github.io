"use client";

import React, { useState, useMemo } from "react";

type ModelPreset = {
  name: string;
  params: number; // in Billions (B)
  layers: number;
  kvHeads: number;
  headDim: number;
  attnType: "MHA" | "GQA" | "MQA";
};

const MODEL_PRESETS: Record<string, ModelPreset> = {
  "llama3-8b": {
    name: "LLaMA-3 8B (GQA 4:1)",
    params: 8,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    attnType: "GQA",
  },
  "llama3-70b": {
    name: "LLaMA-3 70B (GQA 8:1)",
    params: 70,
    layers: 80,
    kvHeads: 8,
    headDim: 128,
    attnType: "GQA",
  },
  "llama2-7b": {
    name: "LLaMA-2 7B (MHA 原生)",
    params: 7,
    layers: 32,
    kvHeads: 32,
    headDim: 128,
    attnType: "MHA",
  },
  "deepseek-v3": {
    name: "DeepSeek-V3 (MLA 多头潜变量)",
    params: 671,
    layers: 61,
    kvHeads: 4,
    headDim: 128,
    attnType: "GQA",
  },
  "mixtral-8x7b": {
    name: "Mixtral 8x7B (MoE 47B 激活 13B)",
    params: 47,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    attnType: "GQA",
  },
};

const GPU_TARGETS = [
  { name: "RTX 4090", vram: 24, label: "24 GB VRAM" },
  { name: "NVIDIA L40S", vram: 48, label: "48 GB VRAM" },
  { name: "NVIDIA A100 / H100", vram: 80, label: "80 GB VRAM" },
  { name: "8x A100 80G (Node)", vram: 640, label: "640 GB VRAM" },
];

export function LLMCalculator() {
  const [selectedPreset, setSelectedPreset] = useState("llama3-8b");
  const [contextLength, setContextLength] = useState(8192);
  const [concurrency, setConcurrency] = useState(16);
  const [precision, setPrecision] = useState<"fp16" | "fp8" | "int4">("fp16");
  const [tensorParallel, setTensorParallel] = useState(1);

  const model = MODEL_PRESETS[selectedPreset];

  const precisionBytes = useMemo(() => {
    switch (precision) {
      case "fp16":
        return 2;
      case "fp8":
        return 1;
      case "int4":
        return 0.5;
    }
  }, [precision]);

  const metrics = useMemo(() => {
    const weightBytes = model.params * 1e9 * precisionBytes;
    const weightGiB = weightBytes / (1024 * 1024 * 1024);
    const weightPerGpuGiB = weightGiB / tensorParallel;

    const kvBytesPerToken = 2 * precisionBytes * model.layers * model.kvHeads * model.headDim;
    const kvKiBPerToken = kvBytesPerToken / 1024;

    const singleSeqKvGiB = (contextLength * kvBytesPerToken) / (1024 * 1024 * 1024);
    const totalKvGiB = singleSeqKvGiB * concurrency;
    const totalKvPerGpuGiB = totalKvGiB / tensorParallel;

    const overheadPerGpuGiB = Math.max(2, (weightPerGpuGiB + totalKvPerGpuGiB) * 0.12);
    const totalVramPerGpuGiB = weightPerGpuGiB + totalKvPerGpuGiB + overheadPerGpuGiB;

    const recommendedChunkSize = contextLength > 16384 ? 512 : 2048;

    return {
      weightGiB,
      weightPerGpuGiB,
      kvKiBPerToken,
      singleSeqKvGiB,
      totalKvGiB,
      totalKvPerGpuGiB,
      overheadPerGpuGiB,
      totalVramPerGpuGiB,
      recommendedChunkSize,
    };
  }, [model, contextLength, concurrency, precisionBytes, tensorParallel]);

  return (
    <div className="sandbox-card">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-wrap">
          <div className="sandbox-icon-badge">🧮</div>
          <div>
            <h3 className="sandbox-title">大模型显存容量与吞吐配平实时计算器</h3>
            <p className="sandbox-subtitle">基于 PagedAttention 显存模型与物理硬件约束，实时测算 KV Cache 水位线与 GPU 瓶颈</p>
          </div>
        </div>

        <div className="sandbox-pill-group">
          <span className="sandbox-pill accent">{model.attnType} 注意力</span>
          <span className="sandbox-pill success">单 Token: {metrics.kvKiBPerToken.toFixed(1)} KB</span>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="sandbox-controls-grid">
        {/* 1. Model Preset */}
        <div className="sandbox-control-item">
          <label className="sandbox-label">1. 选择模型架构</label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="sandbox-select"
          >
            {Object.entries(MODEL_PRESETS).map(([key, item]) => (
              <option key={key} value={key}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="sandbox-metric-sub">
            参数: {model.params}B | 层数: {model.layers} | KV组: {model.kvHeads}
          </div>
        </div>

        {/* 2. Precision */}
        <div className="sandbox-control-item">
          <label className="sandbox-label">2. 量化与权重精度</label>
          <div className="sandbox-btn-group">
            {[
              { id: "fp16", label: "FP16 (2B)" },
              { id: "fp8", label: "FP8 (1B)" },
              { id: "int4", label: "INT4 (0.5B)" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrecision(p.id as "fp16" | "fp8" | "int4")}
                className={`sandbox-btn ${precision === p.id ? "active" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="sandbox-metric-sub">量化直接按比例压缩权重与 KV Cache</div>
        </div>

        {/* 3. Context Length */}
        <div className="sandbox-control-item">
          <label className="sandbox-label">
            <span>3. 上下文长度</span>
            <span className="sandbox-label-val">{contextLength.toLocaleString()} Tokens</span>
          </label>
          <input
            type="range"
            min="1024"
            max="65536"
            step="1024"
            value={contextLength}
            onChange={(e) => setContextLength(Number(e.target.value))}
            className="sandbox-slider"
          />
          <div className="sandbox-slider-ticks">
            <span>1K</span>
            <span>8K</span>
            <span>32K</span>
            <span>64K</span>
          </div>
        </div>

        {/* 4. Concurrency */}
        <div className="sandbox-control-item">
          <label className="sandbox-label">
            <span>4. 峰值并发数</span>
            <span className="sandbox-label-val">{concurrency} 请求</span>
          </label>
          <input
            type="range"
            min="1"
            max="128"
            step="1"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="sandbox-slider"
          />
          <div className="sandbox-slider-ticks">
            <span>1</span>
            <span>16</span>
            <span>64</span>
            <span>128</span>
          </div>
        </div>
      </div>

      {/* TP Degree Selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", paddingTop: "0.75rem", borderTop: "1px solid var(--border-soft)" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>
          张量并行卡数 (Tensor Parallelism):
        </span>
        <div className="sandbox-btn-group" style={{ display: "inline-flex" }}>
          {[1, 2, 4, 8].map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setTensorParallel(tp)}
              className={`sandbox-btn ${tensorParallel === tp ? "active" : ""}`}
              style={{ minWidth: "4rem" }}
            >
              TP = {tp} 卡
            </button>
          ))}
        </div>
      </div>

      {/* Result Metrics Grid */}
      <div className="sandbox-metrics-grid">
        {/* Metric 1 */}
        <div className="sandbox-metric-card">
          <div className="sandbox-metric-title">静态模型权重 (单卡)</div>
          <div className="sandbox-metric-val">
            {metrics.weightPerGpuGiB.toFixed(1)} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>GiB</span>
          </div>
          <div className="sandbox-metric-sub">总权重: {metrics.weightGiB.toFixed(1)} GiB</div>
        </div>

        {/* Metric 2 */}
        <div className="sandbox-metric-card accent">
          <div className="sandbox-metric-title">KV Cache 显存池 (单卡)</div>
          <div className="sandbox-metric-val">
            {metrics.totalKvPerGpuGiB.toFixed(1)} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>GiB</span>
          </div>
          <div className="sandbox-metric-sub">单请求 8K: {metrics.singleSeqKvGiB.toFixed(2)} GiB</div>
        </div>

        {/* Metric 3 */}
        <div className="sandbox-metric-card warm">
          <div className="sandbox-metric-title">单卡总显存需求 (含开销)</div>
          <div className="sandbox-metric-val">
            {metrics.totalVramPerGpuGiB.toFixed(1)} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>GiB</span>
          </div>
          <div className="sandbox-metric-sub">含上下文缓冲: {metrics.overheadPerGpuGiB.toFixed(1)} GiB</div>
        </div>

        {/* Metric 4 */}
        <div className="sandbox-metric-card success">
          <div className="sandbox-metric-title">Chunked Prefill 推荐</div>
          <div className="sandbox-metric-val">
            {metrics.recommendedChunkSize} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>T/Chunk</span>
          </div>
          <div className="sandbox-metric-sub">ITL 逐字抖动抑制 &lt; 25ms</div>
        </div>
      </div>

      {/* GPU Compatibility Matrix */}
      <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border-soft)" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          物理 GPU 显存负载矩阵与 OOM 风险评估
        </div>
        <div className="sandbox-gpu-grid">
          {GPU_TARGETS.map((gpu) => {
            const isOOM = metrics.totalVramPerGpuGiB > gpu.vram;
            const usagePercent = Math.min(100, Math.round((metrics.totalVramPerGpuGiB / gpu.vram) * 100));
            const statusClass = isOOM ? "oom" : usagePercent > 85 ? "warning" : "ok";

            return (
              <div key={gpu.name} className={`sandbox-gpu-card ${isOOM ? "oom" : usagePercent > 85 ? "warning" : ""}`}>
                <div className="sandbox-gpu-header">
                  <span style={{ color: "var(--foreground)" }}>{gpu.name}</span>
                  <span className={`sandbox-gpu-tag ${statusClass}`}>
                    {isOOM ? "OOM 崩溃" : `${usagePercent}%`}
                  </span>
                </div>

                <div className="sandbox-progress-track">
                  <div
                    className={`sandbox-progress-bar ${statusClass}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)" }}>
                  <span>容量: {gpu.vram} GB</span>
                  <span>需: {metrics.totalVramPerGpuGiB.toFixed(1)} GB</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
