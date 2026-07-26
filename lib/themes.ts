export const themes = [
  {
    id: "paper",
    label: "云白",
    description: "云白表面、靛蓝与紫罗兰",
    colors: ["#f7f9ff", "#5b5fe8", "#8b5cf6"],
  },
  {
    id: "midnight",
    label: "深空",
    description: "深空蓝底、亮蓝与柔紫",
    colors: ["#090d1c", "#8ea2ff", "#b794f6"],
  },
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export type ThemePreference = ThemeId | "system";

export const themePreferences: ThemePreference[] = [
  "system",
  ...themes.map((theme) => theme.id),
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    themePreferences.includes(value as ThemePreference)
  );
}

export function resolveTheme(
  preference: ThemePreference,
  systemIsDark: boolean,
): ThemeId {
  if (preference === "system") {
    return systemIsDark ? "midnight" : "paper";
  }

  return preference;
}
