export const themes = [
  {
    id: "paper",
    label: "纸上",
    description: "温暖纸张、浓墨与朱红",
    colors: ["#f1ede2", "#1b1a17", "#c6402d"],
  },
  {
    id: "midnight",
    label: "午夜",
    description: "深墨背景、雾白与冷青",
    colors: ["#111416", "#e9eceb", "#7fc9be"],
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
