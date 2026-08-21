import { describe, expect, it } from "vitest";
import {
  clearCustomTheme,
  defaultCustomColors,
  deriveThemeVars,
  isThemePreference,
  isValidCustomColors,
  loadCustomColors,
  loadCustomVars,
  resolveTheme,
  saveCustomTheme,
  themePreferences,
  themeVarsKeys,
  themes,
} from "@/lib/themes";
import { createThemeBootstrapScript } from "@/components/theme/theme-script";

function stubLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
    configurable: true,
  });
  return store;
}

describe("theme registry", () => {
  it("exposes unique theme ids with preview colors", () => {
    const ids = themes.map((theme) => theme.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(themes.every((theme) => theme.colors.length === 5)).toBe(true);
    expect(themes).toMatchObject([
      {
        id: "boundary",
        label: "边界 · 雾蓝",
        colors: ["#f3f5f7", "#17324d", "#e85d3f", "#2f7d75", "#7b8794"],
      },
      {
        id: "paper",
        label: "千本樱 · 白哉",
        colors: ["#f8f5f1", "#c83b7e", "#1e3a8a", "#9d174d", "#6b7280"],
      },
      {
        id: "midnight",
        label: "斩月 · 一护",
        colors: ["#f8f2e7", "#ea580c", "#2563eb", "#dc2626", "#eab308"],
      },
      {
        id: "hyorinmaru",
        label: "冰轮丸 · 冬狮郎",
        colors: ["#eef6fa", "#0e86a8", "#9333ea", "#2563eb", "#67e8f9"],
      },
      {
        id: "shirayuki",
        label: "袖白雪 · 露琪亚",
        colors: ["#f6f3fd", "#7c3aed", "#db2777", "#3730a3", "#c084fc"],
      },
      {
        id: "ryujin",
        label: "烈日 · 山本",
        colors: ["#fbf5ee", "#d64529", "#b45309", "#c1121f", "#1e5aa8"],
      },
      {
        id: "ulquiorra",
        label: "断崖 · 乌尔奇奥拉",
        colors: ["#f1f8f4", "#0f8a48", "#334155", "#4ade80", "#6d28d9"],
      },
      {
        id: "gin",
        label: "神枪 · 市丸银",
        colors: ["#f2f3f6", "#d21f3c", "#0e7490", "#475569", "#94a3b8"],
      },
      {
        id: "kurotsuchi",
        label: "改造 · 涅茧利",
        colors: ["#f5f3f8", "#4f8a10", "#d61f69", "#7c3aed", "#eab308"],
      },
      {
        id: "yoruichi",
        label: "瞬开 · 夜一",
        colors: ["#0a0803", "#e6a917", "#8b5cf6", "#f59e0b", "#ffd166"],
      },
      {
        id: "kenpachi",
        label: "剑八 · 更木",
        colors: ["#0c0706", "#dc2626", "#ec4899", "#7f1d1d", "#475569"],
      },
      {
        id: "nelliel",
        label: "幼体 · 妮莉艾露",
        colors: ["#f2faf8", "#128579", "#0f766e", "#ec6878", "#a7f3d0"],
      },
      {
        id: "uryu",
        label: "灭却 · 石田雨龙",
        colors: ["#f4f6f9", "#1d4ed8", "#60a5fa", "#d97706", "#6b7f9e"],
      },
      {
        id: "kami",
        label: "紙 · 和纸",
        colors: ["#f5f4ed", "#1b365d", "#2d5a8a", "#8a6f3c", "#6b6a64"],
      },
      {
        id: "kamisha",
        label: "紙 · 茶纸",
        colors: ["#f1ead9", "#1b365d", "#2d5a8a", "#8a6f3c", "#6b6a64"],
      },
      {
        id: "kamiao",
        label: "紙 · 青笺",
        colors: ["#eef0ec", "#1b365d", "#2d5a8a", "#7d6a3c", "#6b6a64"],
      },
      {
        id: "kamisumi",
        label: "紙 · 墨笺",
        colors: ["#141413", "#9db4d6", "#8a9bb8", "#c8a06b", "#6b6a64"],
      },
      {
        id: "kamisakura",
        label: "紙 · 樱纸",
        colors: ["#f7f2eb", "#1b365d", "#2d5a8a", "#9d6b5e", "#6b6a64"],
      },
      {
        id: "kamitake",
        label: "紙 · 竹纸",
        colors: ["#eef0e8", "#1b365d", "#2d5a8a", "#6f7a4c", "#6b6a64"],
      },
      {
        id: "kamikaze",
        label: "紙 · 风化纸",
        colors: ["#efe9dc", "#1b365d", "#2d5a8a", "#8a6f3c", "#6b6a64"],
      },
    ]);
  });

  it("recognizes only registered preferences", () => {
    expect(themePreferences.every(isThemePreference)).toBe(true);
    expect(themePreferences).toContain("custom");
    expect(isThemePreference("neon-rainbow")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("defaults to the blog signature theme for system preference", () => {
    expect(resolveTheme("system")).toBe("boundary");
    expect(resolveTheme("paper")).toBe("paper");
    expect(resolveTheme("midnight")).toBe("midnight");
    expect(resolveTheme("custom")).toBe("custom");
  });

  it("builds the refresh script from registered theme ids", () => {
    const script = createThemeBootstrapScript(["paper", "midnight", "sepia"]);

    expect(script).toContain('"sepia"');
    expect(script).toContain('"paper"');
    expect(script).toContain('"custom"');
    expect(script).toContain("haoyu-theme-custom-vars");
  });
});

describe("custom theme colors", () => {
  it("accepts five hex colors and rejects anything else", () => {
    expect(isValidCustomColors(defaultCustomColors)).toBe(true);
    expect(isValidCustomColors(["#aabbcc", "#aabbcc", "#aabbcc", "#aabbcc"])).toBe(false);
    expect(isValidCustomColors(["red", "#aabbcc", "#aabbcc", "#aabbcc", "#aabbcc"])).toBe(false);
    expect(isValidCustomColors(null)).toBe(false);
  });

  it("derives dark or light variables from the base color", () => {
    const dark = deriveThemeVars(["#0a0803", "#e6a917", "#8b5cf6", "#f59e0b", "#ffd166"]);
    const light = deriveThemeVars(["#f8f5f1", "#c83b7e", "#1e3a8a", "#9d174d", "#6b7280"]);

    expect(dark["--shiki-active"]).toBe("var(--shiki-dark)");
    expect(light["--shiki-active"]).toBe("var(--shiki-light)");
    expect(hexLuminanceOf(dark["--background"]) < 0.32).toBe(true);
    expect(hexLuminanceOf(light["--background"]) < 0.32).toBe(false);
    expect(dark["--foreground"]).not.toBe(light["--foreground"]);
    expect(Object.keys(dark).sort()).toEqual(themeVarsKeys.slice().sort());
  });

  it("round-trips a saved custom theme through localStorage", () => {
    const store = stubLocalStorage();
    const colors = ["#101418", "#22d3ee", "#818cf8", "#f472b6", "#4ade80"] as const;

    const vars = saveCustomTheme([...colors]);

    expect(store.get("haoyu-theme-custom")).toBe(JSON.stringify([...colors]));
    expect(loadCustomColors()).toEqual([...colors]);
    expect(loadCustomVars()).toEqual(vars);

    clearCustomTheme();
    expect(store.has("haoyu-theme-custom")).toBe(false);
    expect(loadCustomColors()).toBe(null);
  });

  it("ignores corrupted custom vars", () => {
    stubLocalStorage();
    localStorage.setItem("haoyu-theme-custom-vars", '{"nope":1}');
    expect(loadCustomVars()).toBeNull();
    localStorage.setItem("haoyu-theme-custom-vars", "not-json");
    expect(loadCustomVars()).toBeNull();
  });
});

function hexLuminanceOf(hex: string) {
  const value = hex.replace("#", "");
  const n = parseInt(value, 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const linear = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return (
    0.2126 * linear(rgb[0] / 255) +
    0.7152 * linear(rgb[1] / 255) +
    0.0722 * linear(rgb[2] / 255)
  );
}
