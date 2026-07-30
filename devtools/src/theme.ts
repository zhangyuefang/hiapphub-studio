export type ThemeMode = "system" | "light" | "dark";

let currentMode: ThemeMode = "system";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const isDark = currentMode === "dark" || (currentMode === "system" && mediaQuery.matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

export function initTheme() {
  const saved = localStorage.getItem("hap-devtools-theme") as ThemeMode | null;
  currentMode = saved || "system";
  applyTheme();
  mediaQuery.addEventListener("change", applyTheme);
}

export function setTheme(mode: ThemeMode) {
  currentMode = mode;
  localStorage.setItem("hap-devtools-theme", mode);
  applyTheme();
}

export function getTheme(): ThemeMode {
  return currentMode;
}
