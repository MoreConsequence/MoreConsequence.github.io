"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import {
  applyVars,
  clearAppliedVars,
  defaultCustomColors,
  deriveThemeVars,
  isThemePreference,
  loadCustomColors,
  loadCustomVars,
  resolveTheme,
  type ThemePreference,
} from "@/lib/themes";

const storageKey = "haoyu-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const listeners = new Set<() => void>();

function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  if (theme === "custom") {
    const vars =
      loadCustomVars() ??
      deriveThemeVars(loadCustomColors() ?? defaultCustomColors);
    applyVars(document.documentElement, vars);
  } else {
    clearAppliedVars(document.documentElement);
  }
  return theme;
}

function getPreferenceSnapshot(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const preference = document.documentElement.dataset.themePreference;
  return isThemePreference(preference) ? preference : "system";
}

function subscribePreference(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyPreferenceChanged() {
  listeners.forEach((listener) => listener());
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribePreference,
    getPreferenceSnapshot,
    () => "system",
  );


  const setPreference = useCallback((next: ThemePreference) => {
    localStorage.setItem(storageKey, next);
    applyTheme(next);
    notifyPreferenceChanged();
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 内使用");
  }
  return context;
}
