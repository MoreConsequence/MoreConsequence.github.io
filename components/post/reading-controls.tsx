"use client";

import { useEffect, useSyncExternalStore } from "react";

const fontScales = [0.94, 1, 1.08] as const;
const listeners = new Set<() => void>();

function getSnapshot() {
  if (typeof localStorage === "undefined") return "1:false";
  const storedFont = Number(localStorage.getItem("reading-font-index"));
  const fontIndex = fontScales[storedFont] ? storedFont : 1;
  const wide = localStorage.getItem("reading-wide") === "true";
  return `${fontIndex}:${wide}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function ReadingControls() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "1:false");
  const [fontValue, wideValue] = snapshot.split(":");
  const fontIndex = Number(fontValue);
  const wide = wideValue === "true";

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--article-font-scale",
      String(fontScales[fontIndex]),
    );
    document.documentElement.style.setProperty(
      "--reading-width",
      wide ? "820px" : "720px",
    );
  }, [fontIndex, wide]);

  const selectFont = (index: number) => {
    localStorage.setItem("reading-font-index", String(index));
    notify();
  };

  const toggleWidth = () => {
    const next = !wide;
    localStorage.setItem("reading-wide", String(next));
    notify();
  };

  return (
    <div className="reading-controls" aria-label="阅读显示设置">
      <span>阅读</span>
      <div>
        {fontScales.map((scale, index) => (
          <button
            key={scale}
            type="button"
            aria-label={`正文大小 ${index + 1}`}
            aria-pressed={fontIndex === index}
            onClick={() => selectFont(index)}
          >
            A{index === 0 ? "−" : index === 2 ? "+" : ""}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={wide}
        onClick={toggleWidth}
        title="切换正文宽度"
      >
        {wide ? "窄栏" : "宽栏"}
      </button>
    </div>
  );
}
