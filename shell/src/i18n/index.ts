import { create } from "zustand";
import zhCN from "./zh-CN.json";
import enUS from "./en-US.json";

type Translations = Record<string, string>;

export type ShellLang = "zh-CN" | "en-US" | "zh-TW" | "ja" | "ko" | "es" | "fr" | "de" | "pt-BR" | "ru" | "ar" | "hi";

export const SHELL_LANGS: { code: ShellLang; label: string; dir?: "rtl" }[] = [
  { code: "zh-CN", label: "简体中文" },
  { code: "en-US", label: "English" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt-BR", label: "Português (BR)" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "hi", label: "हिन्दी" },
];

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

const lazyLocaleLoaders: Record<string, () => Promise<{ default: Translations }>> = {
  "zh-TW": () => import("./zh-TW.json"),
  ja: () => import("./ja.json"),
  ko: () => import("./ko.json"),
  es: () => import("./es.json"),
  fr: () => import("./fr.json"),
  de: () => import("./de.json"),
  "pt-BR": () => import("./pt-BR.json"),
  ru: () => import("./ru.json"),
  ar: () => import("./ar.json"),
  hi: () => import("./hi.json"),
};

const dynamicLocales: Record<string, Translations> = {};

const savedLocale = localStorage.getItem("shell_locale") || "zh-CN";
const savedTranslations = builtinLocales[savedLocale] ?? zhCN;

export const useI18n = create<I18nState>((set, get) => ({
  locale: savedLocale,
  translations: savedTranslations,
  availableLocales: SHELL_LANGS.map(l => l.code),

  setLocale: async (locale: string) => {
    let data = builtinLocales[locale] ?? dynamicLocales[locale];
    if (!data && lazyLocaleLoaders[locale]) {
      try {
        const mod = await lazyLocaleLoaders[locale]();
        data = mod.default;
        builtinLocales[locale] = data;
      } catch { /* fallback to en-US */ }
    }
    if (data) {
      set({ locale, translations: data });
      localStorage.setItem("shell_locale", locale);
      document.documentElement.lang = locale;
      const cfg = SHELL_LANGS.find(l => l.code === locale);
      document.documentElement.dir = cfg?.dir === "rtl" ? "rtl" : "ltr";
      hap.system.setLocale(locale).catch(() => {});
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
    const dataDir = await hap.app.dataDir;
    const localesDir = dataDir.replace(/\/data\/plugins\/.*$/, "/locales");
    const exists = await hap.fs.exists(localesDir);
    if (!exists) return;

    const entries: any[] = await hap.fs.readDir(localesDir);
    for (const entry of entries) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (name?.endsWith(".json")) {
        const locale = name.replace(".json", "");
        const content = await hap.fs.readTextFile(`${localesDir}/${name}`);
        const data: Translations = JSON.parse(content);
        useI18n.getState().loadLanguagePack(locale, data);
      }
    }
  } catch {
    // 静默失败——外部语言包为可选功能
  }
}
