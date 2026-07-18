import { create } from "zustand";
import type { PluginRecord, Theme } from "@/types";

interface AppState {
  plugins: PluginRecord[];
  search: string;
  category: string;
  activePlugin: string | null;
  theme: Theme;
  setPlugins: (plugins: PluginRecord[]) => void;
  setSearch: (q: string) => void;
  setCategory: (cat: string) => void;
  openPlugin: (id: string) => void;
  closePlugin: () => void;
  toggleTheme: () => void;
}

const savedTheme = (localStorage.getItem("shell_theme") as Theme) || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

export const useAppStore = create<AppState>((set) => ({
  plugins: [],
  search: "",
  category: "all",
  activePlugin: null,
  theme: savedTheme,
  setPlugins: (plugins) => set({ plugins }),
  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
  openPlugin: (id) => set({ activePlugin: id }),
  closePlugin: () => set({ activePlugin: null }),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("shell_theme", next);
      return { theme: next };
    }),
}));
