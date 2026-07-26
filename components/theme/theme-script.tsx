import { themes } from "@/lib/themes";

export function createThemeBootstrapScript(themeIds: readonly string[]) {
  return `
(() => {
  try {
    const stored = localStorage.getItem("haoyu-theme");
    const preference = ["system", ...${JSON.stringify(themeIds)}].includes(stored) ? stored : "system";
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preference === "system" ? (dark ? "midnight" : "paper") : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
  } catch {
    document.documentElement.dataset.theme = "paper";
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
