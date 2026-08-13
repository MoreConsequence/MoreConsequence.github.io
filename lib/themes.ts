export const themes = [
  {
    id: "paper",
    label: "千本樱 · 白哉",
    description: "绯樱粉 × 藏青 × 银灰",
    colors: ["#f8f5f1", "#c83b7e", "#1e3a8a", "#9d174d", "#6b7280"],
  },
  {
    id: "midnight",
    label: "斩月 · 一护",
    description: "奶油橙 × 电蓝 × 血红 × 鎏金",
    colors: ["#f8f2e7", "#ea580c", "#2563eb", "#dc2626", "#eab308"],
  },
  {
    id: "hyorinmaru",
    label: "冰轮丸 · 冬狮郎",
    description: "冰蓝 × 电子紫 × 深蓝 × 雾冰",
    colors: ["#eef6fa", "#0e86a8", "#9333ea", "#2563eb", "#67e8f9"],
  },
  {
    id: "shirayuki",
    label: "袖白雪 · 露琪亚",
    description: "紫罗兰 × 品红 × 深靛 × 兰花",
    colors: ["#f6f3fd", "#7c3aed", "#db2777", "#3730a3", "#c084fc"],
  },
  {
    id: "ryujin",
    label: "烈日 · 山本",
    description: "流刃火赤 × 焦金 × 绯红 × 午夜蓝",
    colors: ["#fbf5ee", "#d64529", "#b45309", "#c1121f", "#1e5aa8"],
  },
  {
    id: "ulquiorra",
    label: "断崖 · 乌尔奇奥拉",
    description: "祖母绿 × 石板灰 × 荧光绿 × 深紫",
    colors: ["#f1f8f4", "#0f8a48", "#334155", "#4ade80", "#6d28d9"],
  },
  {
    id: "gin",
    label: "神枪 · 市丸银",
    description: "妖精绯瞳 × 魔青 × 银灰",
    colors: ["#f2f3f6", "#d21f3c", "#0e7490", "#475569", "#94a3b8"],
  },
  {
    id: "kurotsuchi",
    label: "改造 · 涅茧利",
    description: "酸绿 × 洋红 × 电紫 × 药剂金",
    colors: ["#f5f3f8", "#4f8a10", "#d61f69", "#7c3aed", "#eab308"],
  },
  {
    id: "yoruichi",
    label: "瞬开 · 夜一",
    description: "玄黑金雷 × 电紫 × 琥珀",
    colors: ["#0a0803", "#e6a917", "#8b5cf6", "#f59e0b", "#ffd166"],
  },
  {
    id: "kenpachi",
    label: "剑八 · 更木",
    description: "狂刃血红 × 热粉 × 钢铁",
    colors: ["#0c0706", "#dc2626", "#ec4899", "#7f1d1d", "#475569"],
  },
  {
    id: "nelliel",
    label: "幼体 · 妮莉艾露",
    description: "青玉 × 珊瑚粉 × 薄荷",
    colors: ["#f2faf8", "#128579", "#0f766e", "#ec6878", "#a7f3d0"],
  },
  {
    id: "uryu",
    label: "灭却 · 石田雨龙",
    description: "灭却之蓝 × 天青 × 焦橙",
    colors: ["#f4f6f9", "#1d4ed8", "#60a5fa", "#d97706", "#6b7f9e"],
  },
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export type ThemePreference = ThemeId | "system" | "custom";

export const themePreferences: ThemePreference[] = [
  "system",
  ...themes.map((theme) => theme.id),
  "custom",
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    themePreferences.includes(value as ThemePreference)
  );
}

export function resolveTheme(preference: ThemePreference): ThemePreference {
  if (preference === "system") {
    // 主角一护的暖橙默认底色
    return "midnight";
  }

  if (preference === "custom") {
    return "custom";
  }

  return preference;
}

/* ---------- 自定义配色 ---------- */

export type CustomColors = [string, string, string, string, string];

export const customThemeKey = "haoyu-theme-custom";
export const customThemeVarsKey = "haoyu-theme-custom-vars";

export const defaultCustomColors: CustomColors = [
  "#0a0803",
  "#e6a917",
  "#8b5cf6",
  "#f59e0b",
  "#ffd166",
];

const hexPattern = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value.split("").map((c) => c + c).join("")
      : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    rgb
      .map((v) => clamp(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function mixColors(a: string, b: string, weight: number): string {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  return rgbToHex([
    ra + (rb - ra) * weight,
    ga + (gb - ga) * weight,
    ba + (bb - ba) * weight,
  ]);
}

export function hexLuminance(hex: string): number {
  const linear = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const [r, g, b] = hexToRgb(hex).map((v) => linear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastFor(hex: string): string {
  return hexLuminance(hex) > 0.45 ? "#16120c" : "#ffffff";
}

function rgbaOf(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 从「底色 + 4 个撞色」推导出一整套主题变量。
 * 底色亮度决定明暗模式，其余表面/边框/文字色从底色派生，
 * 每个撞色按亮度自动选深/浅前景。
 */
export function deriveThemeVars(
  colors: readonly string[],
): Record<string, string> {
  const [bg, accent, secondary, warm, quad] = colors;
  const dark = hexLuminance(bg) < 0.32;
  const ink = dark ? "#ffffff" : "#141210";
  const fg = mixColors(bg, ink, 0.82);
  const surface = dark
    ? mixColors(bg, "#ffffff", 0.07)
    : mixColors(bg, "#ffffff", 0.62);
  const surfaceStrong = dark
    ? mixColors(bg, "#ffffff", 0.14)
    : mixColors(bg, "#141210", 0.07);
  const border = mixColors(bg, fg, dark ? 0.18 : 0.15);
  const borderSoft = mixColors(border, bg, 0.5);

  return {
    "--background": bg,
    "--surface": surface,
    "--surface-strong": surfaceStrong,
    "--foreground": fg,
    "--muted": mixColors(fg, bg, dark ? 0.4 : 0.35),
    "--border": border,
    "--border-soft": borderSoft,
    "--accent": accent,
    "--accent-secondary": secondary,
    "--accent-warm": warm,
    "--accent-quad": quad,
    "--accent-contrast": contrastFor(accent),
    "--accent-secondary-contrast": contrastFor(secondary),
    "--accent-warm-contrast": contrastFor(warm),
    "--accent-quad-contrast": contrastFor(quad),
    "--accent-soft": mixColors(accent, bg, 0.8),
    "--code-background": mixColors(bg, ink, 0.04),
    "--selection": mixColors(accent, bg, dark ? 0.5 : 0.58),
    "--shadow": dark ? "rgba(0, 0, 0, 0.5)" : rgbaOf("#141210", 0.12),
    "--glow": rgbaOf(accent, 0.14),
    "--shiki-active": dark ? "var(--shiki-dark)" : "var(--shiki-light)",
  };
}

export const themeVarsKeys = Object.keys(deriveThemeVars(defaultCustomColors));

export function isValidCustomColors(value: unknown): value is CustomColors {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((item) => typeof item === "string" && hexPattern.test(item))
  );
}

export function loadCustomColors(): CustomColors | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(customThemeKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidCustomColors(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadCustomVars(): Record<string, string> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(customThemeVarsKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return "--background" in parsed ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function saveCustomTheme(colors: CustomColors): Record<string, string> {
  const vars = deriveThemeVars(colors);
  localStorage.setItem(customThemeKey, JSON.stringify(colors));
  localStorage.setItem(customThemeVarsKey, JSON.stringify(vars));
  return vars;
}

export function clearCustomTheme() {
  localStorage.removeItem(customThemeKey);
  localStorage.removeItem(customThemeVarsKey);
}

export function applyVars(el: HTMLElement, vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}

export function clearAppliedVars(el: HTMLElement) {
  for (const key of themeVarsKeys) {
    el.style.removeProperty(key);
  }
}