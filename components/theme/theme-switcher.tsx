"use client";

import { themes, type ThemePreference } from "@/lib/themes";
import { useTheme } from "./theme-provider";

const options = [
  {
    id: "system",
    label: "自动",
    description: "跟随系统",
    colors: ["#f1ede2", "#111416", "#7fc9be"],
  },
  ...themes,
] as const;

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="theme-switcher" aria-label="外观主题">
      {options.map((option) => (
        <button
          className="theme-option"
          data-active={preference === option.id}
          type="button"
          key={option.id}
          aria-pressed={preference === option.id}
          title={option.description}
          onClick={() => setPreference(option.id as ThemePreference)}
        >
          <span className="theme-swatches" aria-hidden="true">
            {option.colors.map((color) => (
              <span key={color} style={{ backgroundColor: color }} />
            ))}
          </span>
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
