"use client";

import { useEffect, useRef, useState } from "react";
import {
  customThemeKey,
  defaultCustomColors,
  loadCustomColors,
  saveCustomTheme,
  themes,
  type CustomColors,
  type ThemePreference,
} from "@/lib/themes";
import { useTheme } from "./theme-provider";

const systemSwatch = ["#e7e3d9", "#a8b2bd", "#5b6472", "#141416", "#8f979f"];
const slotLabels = ["底色", "撞色一", "撞色二", "撞色三", "撞色四"];

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CustomColors | null>(null);
  const [customColors, setCustomColors] = useState<CustomColors | null>(
    () => loadCustomColors(),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const current = themes.find((theme) => theme.id === preference);
  const swatch =
    preference === "custom"
      ? (customColors ?? defaultCustomColors)
      : current
        ? current.colors
        : systemSwatch;
  const label =
    current?.label ?? (preference === "custom" ? "自定义配色" : "自动");

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === customThemeKey) setCustomColors(loadCustomColors());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setEditing(false);
  };

  const pick = (next: ThemePreference) => {
    setPreference(next);
    closeMenu();
  };

  const openEditor = () => {
    setDraft(customColors ?? defaultCustomColors);
    setEditing(true);
  };

  const applyDraft = (
    index: number,
    value: string,
    next: CustomColors,
  ) => {
    const updated = [...next] as CustomColors;
    updated[index] = value;
    return updated;
  };

  return (
    <div ref={rootRef} className="theme-switcher">
      <button
        className="theme-switcher-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="外观主题"
        title="外观主题"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="theme-swatches" aria-hidden="true">
          {swatch.map((color) => (
            <span key={color} style={{ backgroundColor: color }} />
          ))}
        </span>
        <span>{label}</span>
        <span className="theme-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="theme-menu">
          <button
            className="theme-option"
            data-active={preference === "system"}
            type="button"
            onClick={() => pick("system")}
          >
            <span className="theme-swatches" aria-hidden="true">
              {systemSwatch.map((color) => (
                <span key={color} style={{ backgroundColor: color }} />
              ))}
            </span>
            <span>自动</span>
            <small>跟随系统</small>
          </button>
          {themes.map((theme) => (
            <button
              key={theme.id}
              className="theme-option"
              data-active={preference === theme.id}
              type="button"
              title={theme.description}
              onClick={() => pick(theme.id as ThemePreference)}
            >
              <span className="theme-swatches" aria-hidden="true">
                {theme.colors.map((color) => (
                  <span key={color} style={{ backgroundColor: color }} />
                ))}
              </span>
              <span>{theme.label}</span>
              <small>{theme.description}</small>
            </button>
          ))}
          <button
            className="theme-option"
            data-active={preference === "custom"}
            type="button"
            onClick={openEditor}
          >
            <span className="theme-swatches" aria-hidden="true">
              {(customColors ?? defaultCustomColors).map((color) => (
                <span key={color} style={{ backgroundColor: color }} />
              ))}
            </span>
            <span>自定义配色</span>
            <small>{editing ? "正在编辑" : "我的五色"} · 点按编辑</small>
          </button>

          {editing && draft ? (
            <div className="theme-editor">
              <div className="te-preview" aria-hidden="true">
                {draft.map((color) => (
                  <span key={color} style={{ backgroundColor: color }} />
                ))}
              </div>
              {draft.map((color, index) => (
                <label key={index} className="te-row">
                  <span className="te-name">{slotLabels[index]}</span>
                  <input
                    type="color"
                    value={color}
                    aria-label={slotLabels[index]}
                    onChange={(event) =>
                      setDraft(applyDraft(index, event.target.value, draft))
                    }
                  />
                  <output className="te-hex">{color}</output>
                </label>
              ))}
              <p className="te-hint">
                底色决定明/暗模式，其余四色按亮度自动选深/浅前景
              </p>
              <div className="te-actions">
                <button
                  type="button"
                  className="te-save"
                  onClick={() => {
                    saveCustomTheme(draft);
                    setCustomColors(draft);
                    pick("custom");
                  }}
                >
                  保存并应用
                </button>
                <button
                  type="button"
                  className="te-reset"
                  onClick={() => {
                    setDraft(defaultCustomColors);
                  }}
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  className="te-cancel"
                  onClick={() => setEditing(false)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}