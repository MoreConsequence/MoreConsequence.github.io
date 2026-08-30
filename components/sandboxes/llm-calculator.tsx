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
    kvHeads: 4, // MLA compressed latent head equivalent
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
  const [contextLength, setContextLength] = useState(8192); // in tokens
  const [concurrency, setConcurrency] = useState(16); // concurrent requests
  const [precision, setPrecision] = useState<"fp16" | "fp8" | "int4">("fp16");
  const [tensorParallel, setTensorParallel] = useState(1); // TP degree: 1, 2, 4, 8

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
    // 1. Static model weight VRAM (in GiB)
    // Params (in billions) * bytesPerParam / (1024^3 / 10^9)
    const weightBytes = model.params * 1e9 * precisionBytes;
    const weightGiB = weightBytes / (1024 * 1024 * 1024);

    // Per GPU weight under Tensor Parallelism
    const weightPerGpuGiB = weightGiB / tensorParallel;

    // 2. KV Cache per token (in Bytes): 2 (K+V) * precisionBytes * L * H_kv * d_h
    const kvBytesPerToken = 2 * precisionBytes * model.layers * model.kvHeads * model.headDim;
    const kvKiBPerToken = kvBytesPerToken / 1024;

    // 3. Single sequence KV Cache memory (in GiB)
    const singleSeqKvGiB = (contextLength * kvBytesPerToken) / (1024 * 1024 * 1024);

    // 4. Total concurrency KV Cache memory (in GiB)
    const totalKvGiB = singleSeqKvGiB * concurrency;
    const totalKvPerGpuGiB = totalKvGiB / tensorParallel;

    // 5. Activation & CUDA Context Overhead (~15% or min 2 GiB)
    const overheadPerGpuGiB = Math.max(2, (weightPerGpuGiB + totalKvPerGpuGiB) * 0.12);

    // 6. Total VRAM needed per GPU (in GiB)
    const totalVramPerGpuGiB = weightPerGpuGiB + totalKvPerGpuGiB + overheadPerGpuGiB;

    // 7. Optimal Chunked Prefill size
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
    <div className="not-prose my-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm">
              🧮
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              大模型显存容量与吞吐配平实时计算器
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            基于 PagedAttention 显存模型与物理硬件约束，实时测算 KV Cache 水位线与 GPU 瓶颈
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {model.attnType} 注意力
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            单 Token: {metrics.kvKiBPerToken.toFixed(1)} KB
          </span>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* 1. Model Preset Selector */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            1. 选择预设模型架构
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {Object.entries(MODEL_PRESETS).map(([key, item]) => (
              <option key={key} value={key}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="mt-1.5 text-[11px] text-slate-400">
            参数: {model.params}B | 层数: {model.layers} | KV组: {model.kvHeads}
          </div>
        </div>

        {/* 2. Precision Selector */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            2. 量化与权重精度
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "fp16", label: "FP16 (2B)" },
              { id: "fp8", label: "FP8 (1B)" },
              { id: "int4", label: "INT4 (0.5B)" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrecision(p.id as "fp16" | "fp8" | "int4")}
                className={`rounded-md py-1.5 text-xs font-semibold transition ${
                  precision === p.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-400">
            量化直接按比例压缩权重与 KV Cache
          </div>
        </div>

        {/* 3. Context Length Slider */}
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">3. 上下文长度 (Context)</span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
              {contextLength.toLocaleString()} Tokens
            </span>
          </div>
          <input
            type="range"
            min="1024"
            max="65536"
            step="1024"
            value={contextLength}
            onChange={(e) => setContextLength(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-slate-700"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>1K</span>
            <span>8K</span>
            <span>32K</span>
            <span>64K</span>
          </div>
        </div>

        {/* 4. Concurrency Slider */}
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">4. 峰值并发数 (Concurrency)</span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
              {concurrency} 请求
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="128"
            step="1"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-slate-700"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>1</span>
            <span>16</span>
            <span>64</span>
            <span>128</span>
          </div>
        </div>
      </div>

      {/* TP Degree Selector */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          张量并行卡数 (Tensor Parallelism):
        </span>
        {[1, 2, 4, 8].map((tp) => (
          <button
            key={tp}
            onClick={() => setTensorParallel(tp)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              tensorParallel === tp
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            TP = {tp} 卡
          </button>
        ))}
      </div>

      {/* Result Metrics Grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Static Weights */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            静态模型权重 (单卡)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.weightPerGpuGiB.toFixed(1)}{" "}
            <span className="text-sm font-normal text-slate-500">GiB</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            总权重: {metrics.weightGiB.toFixed(1)} GiB
          </div>
        </div>

        {/* Metric 2: KV Cache Total */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
            KV Cache 显存池 (单卡)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
            {metrics.totalKvPerGpuGiB.toFixed(1)}{" "}
            <span className="text-sm font-normal text-blue-500">GiB</span>
          </div>
          <div className="mt-1 text-[11px] text-blue-500">
            单请求 8K: {metrics.singleSeqKvGiB.toFixed(2)} GiB
          </div>
        </div>

        {/* Metric 3: Total VRAM Required */}
        <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
            单卡总显存需求 (含开销)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-orange-600 dark:text-orange-400">
            {metrics.totalVramPerGpuGiB.toFixed(1)}{" "}
            <span className="text-sm font-normal text-orange-500">GiB</span>
          </div>
          <div className="mt-1 text-[11px] text-orange-500">
            含激活与块表缓冲: {metrics.overheadPerGpuGiB.toFixed(1)} GiB
          </div>
        </div>

        {/* Metric 4: Optimization Advice */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Chunked Prefill 推荐
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.recommendedChunkSize}{" "}
            <span className="text-sm font-normal text-emerald-500">T/Chunk</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600">
            ITL 逐字抖动抑制 &lt; 25ms
          </div>
        </div>
      </div>

      {/* GPU Compatibility Matrix */}
      <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          物理 GPU 显存负载矩阵与 OOM 风险评估
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GPU_TARGETS.map((gpu) => {
            const isOOM = metrics.totalVramPerGpuGiB > gpu.vram;
            const usagePercent = Math.min(100, Math.round((metrics.totalVramPerGpuGiB / gpu.vram) * 100));

            return (
              <div
                key={gpu.name}
                className={`rounded-lg border p-3.5 ${
                  isOOM
                    ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30"
                    : usagePercent > 85
                    ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30"
                    : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    {gpu.name}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      isOOM
                        ? "bg-red-600 text-white"
                        : usagePercent > 85
                        ? "bg-amber-500 text-white"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    {isOOM ? "OOM 崩溃" : `${usagePercent}%`}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOOM ? "bg-red-600" : usagePercent > 85 ? "bg-amber-500" : "bg-emerald-600"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                <div className="mt-2 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
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
