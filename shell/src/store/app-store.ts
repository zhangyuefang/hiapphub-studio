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

export const useAppStore = create<AppState>((set) => ({
  plugins: [],
  search: "",
  category: "all",
  activePlugin: null,
  theme: "light",
  setPlugins: (plugins) => set({ plugins }),
  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
  openPlugin: (id) => set({ activePlugin: id }),
  closePlugin: () => set({ activePlugin: null }),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
}));
