import {
  customThemeVarsKey,
  defaultCustomColors,
  deriveThemeVars,
  themes,
} from "@/lib/themes";

const defaultCustomVars = deriveThemeVars(defaultCustomColors);

export function createThemeBootstrapScript(themeIds: readonly string[]) {
  return `
(() => {
  var applyVars = function (key, fallback) {
    var vars = fallback;
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && "--background" in parsed) vars = parsed;
    } catch (_) {}
    for (var name in vars) {
      document.documentElement.style.setProperty(name, vars[name]);
    }
  };
  try {
    var stored = localStorage.getItem("haoyu-theme");
    var preference = ["system", ...${JSON.stringify([...themeIds, "custom"])}].includes(stored) ? stored : "system";
    var theme = preference === "system" ? "midnight" : preference;
    if (preference === "custom") applyVars(${JSON.stringify(customThemeVarsKey)}, ${JSON.stringify(defaultCustomVars)});
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
  } catch {
    document.documentElement.dataset.theme = "midnight";
    document.documentElement.dataset.themePreference = "system";
  }
})();
`;
}

export const themeBootstrapScript = createThemeBootstrapScript(
  themes.map((theme) => theme.id),
);

export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
      suppressHydrationWarning
    />
  );
}

