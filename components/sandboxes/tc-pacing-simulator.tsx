"use client";

import React, { useState } from "react";

export function TCPacingSimulator() {
  const [qdisc, setQdisc] = useState<"pfifo_fast" | "fq">("fq");
  const [coreRate, setCoreRate] = useState(7); // in Gbps
  const [backupRate, setBackupRate] = useState(2); // in Gbps
  const totalCapacity = 10; // 10 Gbps physical capacity

  const totalDemand = coreRate + backupRate;
  const isCongested = totalDemand > totalCapacity;

  // Simulation metrics
  const isFQ = qdisc === "fq";
  const queueDelayMs = isFQ ? 5 : isCongested ? 240 : 85;
  const bufferbloatLevel = isFQ ? "极低 (0% 膨胀)" : isCongested ? "严重拥塞 (Bufferbloat 240ms)" : "中等排队 (85ms)";
  const packetLossRate = isFQ ? 0 : isCongested ? 4.8 : 0.2;
  const pacingRate = coreRate * 1000; // in Mbps

  return (
    <div className="not-prose my-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-sm font-bold text-white shadow-sm">
              🎛️
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Linux 流量控制（TC）HTB 令牌桶与 BBR/fq Pacing 模拟器
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            对比传统 pfifo_fast 突发拥塞与 Fair Queueing (fq) 纳秒级匀速发包对 Bufferbloat 的消除效果
          </p>
        </div>

        {/* Qdisc Mode Toggle */}
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setQdisc("pfifo_fast")}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              qdisc === "pfifo_fast"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            ❌ pfifo_fast (突发拥塞)
          </button>
          <button
            onClick={() => setQdisc("fq")}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              qdisc === "fq"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            ⚡ fq (BBR 匀速 Pacing)
          </button>
        </div>
      </div>

      {/* Control Sliders */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Core Online Traffic Slider */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex justify-between text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Class 1:10 核心业务流量 (高优先级)
            </span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
              {coreRate} Gbps
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={coreRate}
            onChange={(e) => setCoreRate(Number(e.target.value))}
            className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-slate-700"
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
            <span>Rate: 7G (保底)</span>
            <span>Ceil: 10G (上限)</span>
          </div>
        </div>

        {/* Background Backup Traffic Slider */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex justify-between text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Class 1:20 离线备份流量 (低优先级)
            </span>
            <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
              {backupRate} Gbps
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="6"
            step="1"
            value={backupRate}
            onChange={(e) => setBackupRate(Number(e.target.value))}
            className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-600 dark:bg-slate-700"
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
            <span>Rate: 1G (保底)</span>
            <span>Ceil: 3G (弹性借调)</span>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Metric 1: Queue Delay */}
        <div
          className={`rounded-lg border p-4 ${
            isFQ
              ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              : "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
          }`}
        >
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            交换机排队延迟 (Bufferbloat RTT)
          </div>
          <div
            className={`mt-1 font-mono text-2xl font-bold ${
              isFQ ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {queueDelayMs} <span className="text-sm font-normal">ms</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{bufferbloatLevel}</div>
        </div>

        {/* Metric 2: Pacing Mode */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            发包起搏速率 (Pacing Rate)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
            {isFQ ? `${pacingRate} Mbps` : "无起搏 (Burst 突发)"}
          </div>
          <div className="mt-1 text-[11px] text-blue-500">
            {isFQ ? "EDT 纳秒级均匀调度" : "一次性释放整组 CWND 大包"}
          </div>
        </div>

        {/* Metric 3: Packet Loss */}
        <div
          className={`rounded-lg border p-4 ${
            packetLossRate === 0
              ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
          }`}
        >
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            突发丢包率 (Packet Loss)
          </div>
          <div
            className={`mt-1 font-mono text-2xl font-bold ${
              packetLossRate === 0 ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {packetLossRate}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {packetLossRate === 0 ? "✓ 零丢包平滑交付" : "⚠️ 交换机 FIFO 满溢丢包"}
          </div>
        </div>
      </div>
    </div>
  );
}
