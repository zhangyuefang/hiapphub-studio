import { create } from "zustand";
import zhCN from "./zh-CN.json";
import enUS from "./en-US.json";

type Translations = Record<string, string>;

interface I18nState {
  locale: string;
  translations: Translations;
  availableLocales: string[];
  setLocale: (locale: string) => void;
  loadLanguagePack: (locale: string, data: Translations) => void;
  t: (key: string, fallback?: string) => string;
}

const builtinLocales: Record<string, Translations> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const dynamicLocales: Record<string, Translations> = {};

export const useI18n = create<I18nState>((set, get) => ({
  locale: "zh-CN",
  translations: zhCN,
  availableLocales: ["zh-CN", "en-US"],

  setLocale: (locale: string) => {
    const data = builtinLocales[locale] ?? dynamicLocales[locale];
    if (data) {
      set({ locale, translations: data });
    }
  },

  /**
   * 动态导入语言包：用户可从 ~/.hiapphub/locales/ 加载 JSON，
   * 或通过设置界面导入本地文件。
   * 语言包格式与内置 zh-CN.json / en-US.json 完全一致。
   */
  loadLanguagePack: (locale: string, data: Translations) => {
    dynamicLocales[locale] = data;
    set((s) => ({
      availableLocales: Array.from(
        new Set([...s.availableLocales, locale]),
      ),
    }));
  },

  t: (key: string, fallback?: string) => {
    return get().translations[key] ?? fallback ?? key;
  },
}));

/**
 * 从 Rust 侧读取 ~/.hiapphub/locales/ 下的 JSON 文件，
 * 注册为可用语言包。Shell 启动时调用。
 */
export async function loadExternalLocales() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const localesDir = `${await invoke<string>("get_data_dir")}/locales`;
    const exists: boolean = await invoke("fs_exists", { path: localesDir });
    if (!exists) return;

    const entries: Array<{ name: string; path: string; isDir: boolean }> =
      await invoke("fs_read_dir", { path: localesDir });

    for (const entry of entries) {
      if (entry.name.endsWith(".json") && !entry.isDir) {
        const locale = entry.name.replace(".json", "");
        const content: string = await invoke("fs_read_text_file", {
          path: entry.path,
        });
        const data: Translations = JSON.parse(content);
        useI18n.getState().loadLanguagePack(locale, data);
      }
    }
  } catch {
    // 静默失败——外部语言包为可选功能
  }
}
