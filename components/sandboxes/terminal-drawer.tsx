"use client";

import React, { useState, useEffect } from "react";
import { WebTerminal } from "./web-terminal";
import { Terminal as TerminalIcon, X, Minus, Maximize2 } from "lucide-react";

export function TerminalDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeCommand, setActiveCommand] = useState("kubectl get nodes");
  const [terminalKey, setTerminalKey] = useState(0);

  useEffect(() => {
    const handleExec = (e: CustomEvent<{ command: string }>) => {
      if (e.detail?.command) {
        setActiveCommand(e.detail.command);
        setTerminalKey((k) => k + 1);
        setIsOpen(true);
        setIsMinimized(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + ` or Cmd + ` toggles terminal
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setIsMinimized(false);
      }
    };

    window.addEventListener("terminal-exec" as unknown as keyof WindowEventMap, handleExec as EventListener);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("terminal-exec" as unknown as keyof WindowEventMap, handleExec as EventListener);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!isOpen) {
    return (
      <aside aria-label="快捷终端工具" className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="terminal-float-pill"
          title="打开虚拟 Web 终端 (快捷键: Ctrl + `)"
          aria-label="打开虚拟终端"
        >
          <TerminalIcon className="w-4 h-4 text-emerald-500" />
          <span>终端</span>
          <kbd className="terminal-float-kbd">Ctrl+`</kbd>
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="交互式内核终端"
      className={`terminal-drawer-container ${
        isMinimized ? "minimized" : ""
      }`}
    >
      <div className="terminal-drawer-header">
        <div className="terminal-drawer-title">
          <TerminalIcon className="w-3.5 h-3.5 text-emerald-500" />
          <span>虚拟内核沙盒 · Boundary WebTerminal</span>
        </div>
        <div className="terminal-drawer-actions">
          <button
            type="button"
            onClick={() => setIsMinimized((v) => !v)}
            className="terminal-drawer-btn"
            title={isMinimized ? "展开" : "最小化"}
            aria-label={isMinimized ? "展开终端" : "最小化终端"}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="terminal-drawer-btn close"
            title="关闭终端 (Ctrl+`)"
            aria-label="关闭终端"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="terminal-drawer-body">
          <WebTerminal
            key={terminalKey}
            initialCommand={activeCommand}
            title="root@node-01: ~"
          />
        </div>
      )}
    </aside>
  );
}
