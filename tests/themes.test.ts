import { describe, expect, it } from "vitest";
import {
  isThemePreference,
  resolveTheme,
  themePreferences,
  themes,
} from "@/lib/themes";
import { createThemeBootstrapScript } from "@/components/theme/theme-script";

describe("theme registry", () => {
  it("exposes unique theme ids with preview colors", () => {
    const ids = themes.map((theme) => theme.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(themes.every((theme) => theme.colors.length === 3)).toBe(true);
  });

  it("recognizes only registered preferences", () => {
    expect(themePreferences.every(isThemePreference)).toBe(true);
    expect(isThemePreference("neon-rainbow")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves system preference without storing a fake theme", () => {
    expect(resolveTheme("system", true)).toBe("midnight");
    expect(resolveTheme("system", false)).toBe("paper");
    expect(resolveTheme("paper", true)).toBe("paper");
    expect(resolveTheme("midnight", false)).toBe("midnight");
  });

  it("builds the refresh script from registered theme ids", () => {
    const script = createThemeBootstrapScript(["paper", "midnight", "sepia"]);

    expect(script).toContain('"sepia"');
    expect(script).toContain('"paper"');
  });
});
