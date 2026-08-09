"use client";

import { useEffect, useSyncExternalStore } from "react";

const fontScales = [0.94, 1, 1.08] as const;
const widthMin = 680;
const widthMax = 980;
const widthStep = 20;
const widthDefault = 860;
const listeners = new Set<() => void>();

function normalizeWidth(value: number) {
  if (Number.isNaN(value)) return widthDefault;
  return Math.min(widthMax, Math.max(widthMin, value));
}

function getSnapshot() {
  if (typeof localStorage === "undefined") return "1:860";
  const storedFont = Number(localStorage.getItem("reading-font-index"));
  const fontIndex = fontScales[storedFont] ? storedFont : 1;
  const storedWidth = localStorage.getItem("reading-width");
  const width =
    storedWidth === null ? widthDefault : normalizeWidth(Number(storedWidth));
  return `${fontIndex}:${width}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function ReadingControls() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "1:860");
  const [fontValue, widthValue] = snapshot.split(":");
  const fontIndex = Number(fontValue);
  const width = Number(widthValue);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--article-font-scale",
      String(fontScales[fontIndex]),
    );
    document.documentElement.style.setProperty("--reading-width", `${width}px`);
  }, [fontIndex, width]);

  const selectFont = (index: number) => {
    localStorage.setItem("reading-font-index", String(index));
    notify();
  };

  const setWidth = (value: number) => {
    localStorage.setItem("reading-width", String(value));
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
      <span>宽度</span>
      <label className="reading-width-control">
        <input
          type="range"
          min={widthMin}
          max={widthMax}
          step={widthStep}
          value={width}
          aria-label="正文宽度"
          onChange={(event) => setWidth(Number(event.target.value))}
        />
        <output>{width}px</output>
      </label>
    </div>
  );
}
