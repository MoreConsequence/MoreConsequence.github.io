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

  return (
    <div className="sandbox-card">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-wrap">
          <div className="sandbox-icon-badge" style={{ background: "#ea580c" }}>🎛️</div>
          <div>
            <h3 className="sandbox-title">Linux 流量控制（TC）HTB 令牌桶与 BBR/fq Pacing 模拟器</h3>
            <p className="sandbox-subtitle">对比传统 pfifo_fast 突发拥塞与 Fair Queueing (fq) 纳秒级匀速发包对 Bufferbloat 的消除效果</p>
          </div>
        </div>

        {/* Qdisc Mode Toggle */}
        <div className="sandbox-btn-group">
          <button
            type="button"
            onClick={() => setQdisc("pfifo_fast")}
            className={`sandbox-btn ${qdisc === "pfifo_fast" ? "active" : ""}`}
            style={qdisc === "pfifo_fast" ? { color: "#dc2626" } : {}}
          >
            ❌ pfifo_fast (突发拥塞)
          </button>
          <button
            type="button"
            onClick={() => setQdisc("fq")}
            className={`sandbox-btn ${qdisc === "fq" ? "active" : ""}`}
            style={qdisc === "fq" ? { color: "#059669" } : {}}
          >
            ⚡ fq (BBR 匀速 Pacing)
          </button>
        </div>
      </div>

      {/* Control Sliders */}
      <div className="sandbox-controls-grid">
        {/* Core Online Traffic Slider */}
        <div className="sandbox-control-item">
          <label className="sandbox-label">
            <span>Class 1:10 核心业务流量</span>
            <span className="sandbox-label-val">{coreRate} Gbps</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={coreRate}
            onChange={(e) => setCoreRate(Number(e.target.value))}
            className="sandbox-slider"
          />
          <div className="sandbox-slider-ticks">
            <span>Rate: 7G (保底)</span>
            <span>Ceil: 10G (上限)</span>
          </div>
        </div>

        {/* Background Backup Traffic Slider */}
        <div className="sandbox-control-item">
          <label className="sandbox-label">
            <span>Class 1:20 离线备份流量</span>
            <span className="sandbox-label-val" style={{ color: "var(--muted)" }}>{backupRate} Gbps</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={backupRate}
            onChange={(e) => setBackupRate(Number(e.target.value))}
            className="sandbox-slider"
          />
          <div className="sandbox-slider-ticks">
            <span>Rate: 1G (保底)</span>
            <span>Ceil: 10G (可借用)</span>
          </div>
        </div>
      </div>

      {/* Result Metrics Grid */}
      <div className="sandbox-metrics-grid">
        {/* Metric 1 */}
        <div className="sandbox-metric-card">
          <div className="sandbox-metric-title">总带宽需求 vs 物理上限 (10G)</div>
          <div className="sandbox-metric-val">
            {totalDemand} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>Gbps</span>
          </div>
          <div className="sandbox-metric-sub">
            {isCongested ? "⚠️ 超出 10G 物理线速" : "✓ 链路容量充裕"}
          </div>
        </div>

        {/* Metric 2 */}
        <div className={`sandbox-metric-card ${isFQ ? "success" : isCongested ? "warm" : ""}`}>
          <div className="sandbox-metric-title">排队时延 (Bufferbloat Delay)</div>
          <div className="sandbox-metric-val">
            {queueDelayMs} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>ms</span>
          </div>
          <div className="sandbox-metric-sub">{bufferbloatLevel}</div>
        </div>

        {/* Metric 3 */}
        <div className={`sandbox-metric-card ${packetLossRate === 0 ? "success" : "warm"}`}>
          <div className="sandbox-metric-title">尾丢弃丢包率 (Tail Drop)</div>
          <div className="sandbox-metric-val">
            {packetLossRate.toFixed(1)} <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>%</span>
          </div>
          <div className="sandbox-metric-sub">
            {isFQ ? "✓ 纳秒级 Pacing 零突发" : "突发打满网卡 FIFO 队列"}
          </div>
        </div>

        {/* Metric 4 */}
        <div className="sandbox-metric-card accent">
          <div className="sandbox-metric-title">调度核心算法与特征</div>
          <div className="sandbox-metric-val" style={{ fontSize: "1.1rem" }}>
            {isFQ ? "FQ 纳秒 Pacing" : "粗暴 FIFO 突发"}
          </div>
          <div className="sandbox-metric-sub">
            {isFQ ? "流间公平隔离 + BBR 联动" : "大流量挤死小流量"}
          </div>
        </div>
      </div>
    </div>
  );
}
