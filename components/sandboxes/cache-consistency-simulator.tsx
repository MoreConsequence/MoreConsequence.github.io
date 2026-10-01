"use client";

import React, { useState } from "react";
import { Play, RotateCcw, ShieldCheck, AlertTriangle, XCircle } from "lucide-react";

type Strategy = "cache_aside" | "double_delete" | "version_fencing";

interface StepRecord {
  thread: "R (读线程)" | "W (写线程)";
  action: string;
  dbVal: string;
  dbVer: number;
  cacheVal: string | null;
  cacheVer: number;
  desc: string;
}

export function CacheConsistencySimulator() {
  const [strategy, setStrategy] = useState<Strategy>("version_fencing");
  const [currentStep, setCurrentStep] = useState(0);

  const getSteps = (strat: Strategy): StepRecord[] => {
    if (strat === "cache_aside") {
      return [
        {
          thread: "R (读线程)",
          action: "1. 读请求查缓存",
          dbVal: "V1",
          dbVer: 1,
          cacheVal: null,
          cacheVer: 0,
          desc: "客户端读请求到达，查询 Redis 缓存未命中 (Cache Miss)。",
        },
        {
          thread: "R (读线程)",
          action: "2. 读取数据库",
          dbVal: "V1",
          dbVer: 1,
          cacheVal: null,
          cacheVer: 0,
          desc: "读线程穿透至数据库，读取到当前有效旧值 V1 (版本 1)。准备回填缓存，但因 GC 或网络发生短暂微秒级卡顿。",
        },
        {
          thread: "W (写线程)",
          action: "3. 写线程更新数据库",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: null,
          cacheVer: 0,
          desc: "并发写请求抢占执行，将数据库中的记录更新为新值 V2 (版本 2) 并提交事务。",
        },
        {
          thread: "W (写线程)",
          action: "4. 写线程删除缓存",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: null,
          cacheVer: 0,
          desc: "写线程执行 DEL key，清理掉缓存。此时数据库为 V2，缓存为空。",
        },
        {
          thread: "R (读线程)",
          action: "5. 读线程滞后回填缓存",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: "V1",
          cacheVer: 1,
          desc: "卡顿的读线程恢复调度，无脑将旧值 V1 写入 Redis！旧值复活，发生严重数据不一致！",
        },
      ];
    }

    if (strat === "double_delete") {
      return [
        {
          thread: "W (写线程)",
          action: "1. 写线程先删缓存并写库",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: null,
          cacheVer: 0,
          desc: "写线程更新数据库为 V2，并执行第一次缓存删除。",
        },
        {
          thread: "R (读线程)",
          action: "2. 并发读线程查缓存未命中",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: null,
          cacheVer: 0,
          desc: "读线程查询缓存为空，读取到 DB 数据（或者在写事务提交前读到旧值 V1）。",
        },
        {
          thread: "W (写线程)",
          action: "3. 写线程进入 Sleep 等待",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: null,
          cacheVer: 0,
          desc: "写线程启动异步休眠（如 sleep 500ms），试图等待所有并发读线程完成回填。",
        },
        {
          thread: "W (写线程)",
          action: "4. 写线程执行第二次延迟删除",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: null,
          cacheVer: 0,
          desc: "写线程唤醒并执行第二次 DEL。若读线程网络阻塞超过 500ms，在第二次删除之后才回填，依然复活旧值！",
        },
        {
          thread: "R (读线程)",
          action: "5. 极端长尾读线程回填",
          dbVal: "V2",
          dbVer: 2,
          cacheVal: "V1",
          cacheVer: 1,
          desc: "长尾慢查询（>500ms）在二次删除后到达，将旧值 V1 写入缓存。延迟双删无法彻底防御长尾倾斜！",
        },
      ];
    }

    // version_fencing
    return [
      {
        thread: "R (读线程)",
        action: "1. 读请求查缓存",
        dbVal: "V1",
        dbVer: 1,
        cacheVal: null,
        cacheVer: 0,
        desc: "读请求查询 Redis 未命中，准备回填。",
      },
      {
        thread: "R (读线程)",
        action: "2. 读数据库带出版本号",
        dbVal: "V1",
        dbVer: 1,
        cacheVal: null,
        cacheVer: 0,
        desc: "从数据库读取到数据 V1 与行版本号 Version=1。此时读线程被调度挂起。",
      },
      {
        thread: "W (写线程)",
        action: "3. 写线程 CAS 更新 DB 并广播",
        dbVal: "V2",
        dbVer: 2,
        cacheVal: "V2",
        cacheVer: 2,
        desc: "写线程更新 DB 为 V2，自增版本号为 Version=2，并通过原子 Lua 脚本更新 Redis 缓存与版本栅栏。",
      },
      {
        thread: "R (读线程)",
        action: "4. 滞后读线程触发版本号栅栏",
        dbVal: "V2",
        dbVer: 2,
        cacheVal: "V2",
        cacheVer: 2,
        desc: "读线程苏醒，尝试写入 V1 (Ver=1)。执行 Redis Lua: ARGV[ver] >= cached[ver]。检测到 1 < 2，直接拒绝覆盖！",
      },
      {
        thread: "R (读线程)",
        action: "5. 零旧值复活，强一致收敛",
        dbVal: "V2",
        dbVer: 2,
        cacheVal: "V2",
        cacheVer: 2,
        desc: "Redis 缓存中的有效值始终锁定为最新 V2 (Ver=2)。并发时序倒挂被原子版本号栅栏完美吸收！",
      },
    ];
  };

  const steps = getSteps(strategy);
  const activeStep = steps[currentStep] || steps[0];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((c) => c + 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
  };

  const isFinalStep = currentStep === steps.length - 1;
  const isFailed = isFinalStep && (strategy === "cache_aside" || strategy === "double_delete");

  return (
    <div className="sandbox-card">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-wrap">
          <div className="sandbox-icon-badge" style={{ background: "#7c3aed" }}>⚡</div>
          <div>
            <h3 className="sandbox-title">缓存与数据库并发一致性时序模拟器</h3>
            <p className="sandbox-subtitle">
              推演先删后写、经典 Cache-Aside、延迟双删的时序空洞，与版本号栅栏（Version Fencing）的确定性防旧值复活
            </p>
          </div>
        </div>

        {/* Strategy Switch */}
        <div className="sandbox-btn-group">
          <button
            type="button"
            onClick={() => {
              setStrategy("cache_aside");
              setCurrentStep(0);
            }}
            className={`sandbox-btn ${strategy === "cache_aside" ? "active" : ""}`}
            style={strategy === "cache_aside" ? { color: "#ea580c" } : {}}
          >
            ❌ Cache-Aside (先写后删)
          </button>
          <button
            type="button"
            onClick={() => {
              setStrategy("double_delete");
              setCurrentStep(0);
            }}
            className={`sandbox-btn ${strategy === "double_delete" ? "active" : ""}`}
            style={strategy === "double_delete" ? { color: "#eab308" } : {}}
          >
            ⚠️ 延迟双删 (Delayed Delete)
          </button>
          <button
            type="button"
            onClick={() => {
              setStrategy("version_fencing");
              setCurrentStep(0);
            }}
            className={`sandbox-btn ${strategy === "version_fencing" ? "active" : ""}`}
            style={strategy === "version_fencing" ? { color: "#059669" } : {}}
          >
            🛡️ 版本号栅栏 (Version Fencing)
          </button>
        </div>
      </div>

      {/* Simulator Controls & Timeline Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "1rem 0", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleNext}
            disabled={isFinalStep}
            className="sandbox-btn active"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isFinalStep ? "已推演完毕" : `单步推演 (${currentStep + 1}/${steps.length})`}</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="sandbox-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置时序</span>
          </button>
        </div>

        <div style={{ fontSize: "0.78rem", color: "var(--ink-secondary)" }}>
          当前事件：<strong style={{ color: "var(--ink)" }}>{activeStep.action}</strong>
        </div>
      </div>

      {/* Real-time Storage State Cards */}
      <div className="sandbox-results-panel">
        <div className="sandbox-result-metric">
          <span className="sandbox-metric-label">MySQL 数据库物理存储状态</span>
          <span className="sandbox-metric-value" style={{ color: "#2563eb" }}>
            {activeStep.dbVal} (Ver {activeStep.dbVer})
          </span>
          <small className="sandbox-metric-sub">
            {activeStep.dbVer === 2 ? "已成功提交最新事务" : "初始历史数据"}
          </small>
        </div>

        <div className="sandbox-result-metric">
          <span className="sandbox-metric-label">Redis 缓存物理状态</span>
          <span
            className="sandbox-metric-value"
            style={{
              color: activeStep.cacheVal === null
                ? "#94a3b8"
                : isFailed
                  ? "#dc2626"
                  : "#059669",
            }}
          >
            {activeStep.cacheVal ? `${activeStep.cacheVal} (Ver ${activeStep.cacheVer})` : "EMPTY (空)"}
          </span>
          <small className="sandbox-metric-sub">
            {activeStep.cacheVal === null
              ? "缓存未命中或已被清理"
              : isFailed
                ? "❌ 脏数据驻留 (旧值复活)"
                : "✅ 与数据库完全同步"}
          </small>
        </div>

        <div className="sandbox-result-metric">
          <span className="sandbox-metric-label">并发时序判决</span>
          <span
            className="sandbox-metric-value"
            style={{ color: isFailed ? "#dc2626" : isFinalStep ? "#059669" : "#0284c7" }}
          >
            {isFailed ? "不一致发生" : isFinalStep ? "强一致达成" : "推演进行中"}
          </span>
          <small className="sandbox-metric-sub">
            {activeStep.thread}
          </small>
        </div>
      </div>

      {/* Narrative Explanation Box */}
      <div style={{
        marginTop: "1.25rem",
        padding: "0.85rem 1.15rem",
        borderRadius: "8px",
        background: isFailed ? "rgba(239, 68, 68, 0.08)" : isFinalStep ? "rgba(16, 185, 129, 0.08)" : "var(--paper, #f8fafc)",
        border: `1px solid ${isFailed ? "#ef4444" : isFinalStep ? "#10b981" : "var(--line, #e2e8f0)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
          {isFailed ? (
            <XCircle className="w-4 h-4 text-red-600" />
          ) : isFinalStep ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
          <strong style={{ fontSize: "0.85rem", color: "var(--ink)" }}>
            步骤 {currentStep + 1} 物理现场解析：
          </strong>
        </div>
        <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.5, color: "var(--ink-secondary)" }}>
          {activeStep.desc}
        </p>
      </div>

      {/* Step Sequence Pills */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {steps.map((st, i) => (
          <div
            key={i}
            onClick={() => setCurrentStep(i)}
            style={{
              padding: "0.3rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.72rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: i === currentStep ? "var(--accent)" : "var(--paper)",
              color: i === currentStep ? "#ffffff" : "var(--ink-secondary)",
              border: "1px solid var(--line)",
            }}
          >
            {i + 1}. {st.thread.split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}
