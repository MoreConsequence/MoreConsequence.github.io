"use client";

import React, { useState } from "react";

export function SSEBackpressureSimulator() {
  const [strategy, setStrategy] = useState<"none" | "watermark">("watermark");
  const [upstreamSpeed, setUpstreamSpeed] = useState(120); // tokens/sec (~240 KB/s per connection)
  const [clientSpeed, setClientSpeed] = useState(25); // KB/s (slow mobile client)
  const [connections, setConnections] = useState(500); // concurrent streams

  // Calculations
  const isBackpressure = strategy === "watermark";
  const upstreamKbps = (upstreamSpeed * 4) / 1; // ~4 bytes per token
  const rateMismatch = upstreamKbps - clientSpeed;

  // Single connection buffer size in KB
  // Without backpressure, accumulates unbounded over a typical 45s session
  const durationSec = 30;
  const singleBufferKb = isBackpressure
    ? 64 // capped at high watermark
    : Math.max(16, Math.min(4096, 16 + (rateMismatch > 0 ? (rateMismatch * durationSec) / 2 : 0)));

  // Total cluster memory across all connections in MB
  const totalMemoryMb = Math.round((singleBufferKb * connections) / 1024);
  const isOOM = !isBackpressure && totalMemoryMb > 1024; // > 1GB risk

  const bufferPercent = Math.min(100, Math.round((singleBufferKb / 128) * 100));

  return (
    <div className="sandbox-card">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-wrap">
          <div className="sandbox-icon-badge" style={{ background: "#2563eb" }}>🌊</div>
          <div>
            <h3 className="sandbox-title">高并发 SSE 流式长连接反压（Backpressure）机制模拟器</h3>
            <p className="sandbox-subtitle">
              对比传统无界缓冲区在慢速消费者下的 OOM 崩溃，与 TCP Zero Window / 高低水位线流控的有界内存防护
            </p>
          </div>
        </div>

        {/* Strategy Switch */}
        <div className="sandbox-btn-group">
          <button
            type="button"
            onClick={() => setStrategy("none")}
            className={`sandbox-btn ${strategy === "none" ? "active" : ""}`}
            style={strategy === "none" ? { color: "#dc2626" } : {}}
          >
            ❌ 无反压 (内存无限膨胀)
          </button>
          <button
            type="button"
            onClick={() => setStrategy("watermark")}
            className={`sandbox-btn ${strategy === "watermark" ? "active" : ""}`}
            style={strategy === "watermark" ? { color: "#059669" } : {}}
          >
            ⚡ 水位线反压 (Envoy/Netty Flow Control)
          </button>
        </div>
      </div>

      {/* Control Sliders */}
      <div className="sandbox-controls-grid">
        <div className="sandbox-control-item">
          <label className="sandbox-label">
            <span>上游推理生成速度 (Upstream Producer)</span>
            <span className="sandbox-label-val">{upstreamSpeed} tokens/s ({Math.round(upstreamKbps)} KB/s)</span>
          </label>
          <input
            type="range"
            min="20"
            max="200"
            step="10"
            value={upstreamSpeed}
            onChange={(e) => setUpstreamSpeed(Number(e.target.value))}
            className="sandbox-slider"
          />
        </div>

        <div className="sandbox-control-item">
          <label className="sandbox-label">
            <span>下游客户端消费带宽 (Slow Client 4G)</span>
            <span className="sandbox-label-val">{clientSpeed} KB/s</span>
          </label>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={clientSpeed}
            onChange={(e) => setClientSpeed(Number(e.target.value))}
            className="sandbox-slider"
          />
        </div>

        <div className="sandbox-control-item" style={{ gridColumn: "1 / -1" }}>
          <label className="sandbox-label">
            <span>并发流式长连接数 (Concurrent Streams)</span>
            <span className="sandbox-label-val">{connections} 路连接</span>
          </label>
          <input
            type="range"
            min="50"
            max="2000"
            step="50"
            value={connections}
            onChange={(e) => setConnections(Number(e.target.value))}
            className="sandbox-slider"
          />
        </div>
      </div>

      {/* Status & Simulation Visualization */}
      <div className="sandbox-results-panel">
        <div className="sandbox-result-metric">
          <span className="sandbox-metric-label">单连接网关缓冲区 (Per-Socket Buffer)</span>
          <span
            className="sandbox-metric-value"
            style={{ color: isBackpressure ? "#059669" : singleBufferKb > 512 ? "#dc2626" : "#ea580c" }}
          >
            {Math.round(singleBufferKb)} KB
          </span>
          <small className="sandbox-metric-sub">
            {isBackpressure ? "严格锁定在高水位线 (High Watermark: 64KB)" : "随长连接持续推流无界膨胀"}
          </small>
        </div>

        <div className="sandbox-result-metric">
          <span className="sandbox-metric-label">网关集群总内存开销 (Total Gateway RAM)</span>
          <span
            className="sandbox-metric-value"
            style={{ color: isOOM ? "#dc2626" : isBackpressure ? "#059669" : "#ea580c" }}
          >
            {totalMemoryMb} MB {isOOM ? "⚠️ OOM 风险!" : ""}
          </span>
          <small className="sandbox-metric-sub">
            {isBackpressure ? "安全有界 (O(1) 内存复杂度)" : isOOM ? "超出容器内存配额，触发内核 OOM Killer" : "内存承压中"}
          </small>
        </div>

        <div className="sandbox-result-metric">
          <span className="sandbox-metric-label">流控状态 (Flow Control State)</span>
          <span
            className="sandbox-metric-value"
            style={{ color: isBackpressure ? "#0284c7" : "#64748b" }}
          >
            {isBackpressure ? "PAUSED / RESUMED (交替)" : "NONE (失控)"}
          </span>
          <small className="sandbox-metric-sub">
            {isBackpressure ? "向对端发送 TCP Zero Window / HTTP2 帧暂停读取" : "持续读入上游数据填充本地队列"}
          </small>
        </div>
      </div>

      {/* Buffer Progress Bar */}
      <div style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.35rem", color: "var(--ink-secondary)" }}>
          <span>缓冲区水位线刻度 (Buffer Watermark Fill)</span>
          <span>低水位 16KB | 高水位 64KB | 当前: {Math.round(singleBufferKb)} KB</span>
        </div>
        <div style={{ height: "12px", background: "var(--paper, #f1f5f9)", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--line)" }}>
          <div
            style={{
              height: "100%",
              width: `${bufferPercent}%`,
              background: isBackpressure ? "#10b981" : isOOM ? "#ef4444" : "#f59e0b",
              transition: "width 0.3s ease, background-color 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}
