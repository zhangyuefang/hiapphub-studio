import { useMemo, useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { useI18n, loadExternalLocales } from "@/i18n";
import { ToolGrid } from "@/components/ToolGrid";
import { SearchBar } from "@/components/SearchBar";
import { Toast } from "@/components/Toast";
import { Settings } from "@/components/Settings";

export default function App() {
  const { plugins, search, category, theme, setSearch, setCategory, toggleTheme } =
    useAppStore();
  const { t, locale, setLocale, availableLocales } = useI18n();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [multiWindow, setMultiWindow] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [langDropOpen, setLangDropOpen] = useState(false);
  const langDropRef = useRef<HTMLDivElement>(null);

  const LOCALE_LABELS: Record<string, string> = {
    "zh-CN": "简体中文", "en-US": "English", "zh-TW": "繁體中文",
    ja: "日本語", ko: "한국어", es: "Español", fr: "Français",
    de: "Deutsch", "pt-BR": "Português (BR)", ru: "Русский",
    ar: "العربية", hi: "हिन्दी",
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langDropRef.current && !langDropRef.current.contains(e.target as Node)) setLangDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const caps = await hap.system.capabilities?.();
        if (caps?.features?.multiWindow === false) {
          setMultiWindow(false);
        }
      } catch {}
      try {
        setIsMaximized(await hap.window.isMaximized());
        setIsFullscreen(await hap.window.isFullscreen());
        if (!navigator.userAgent.includes("Mac")) {
          await hap.window.setDecorations(false);
        }
      } catch {}
      const saved = localStorage.getItem("shell_locale");
      if (saved && saved !== locale) {
        setLocale(saved);
      }
      await loadExternalLocales();
    };
    init();
    const unlisten = hap.window.onResized(async () => {
      try {
        setIsMaximized(await hap.window.isMaximized());
        setIsFullscreen(await hap.window.isFullscreen());
      } catch {}
    });
    const dlId = hap.event.on("deep-link", (url: any) => {
      const raw = typeof url === "string" ? url : String(url);
      const match = raw.match(/^hiapphub:\/\/tool\/([^/?#]+)/);
      if (match) {
        hap.system.openApp(match[1]).catch((e: any) => console.error("deep-link open failed:", e));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
      hap.event.off("deep-link", dlId);
    };
  }, []);

  const isMac = navigator.userAgent.includes("Mac");

  const filtered = useMemo(() => {
    let list = plugins;
    if (category !== "all") list = list.filter((p) => p.manifest.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.manifest.name.toLowerCase().includes(q) ||
          Object.values(p.manifest.names ?? {}).some((n) => n.toLowerCase().includes(q)) ||
          (p.manifest.description ?? "").toLowerCase().includes(q) ||
          Object.values(p.manifest.descriptions ?? {}).some((d) => d.toLowerCase().includes(q)) ||
          p.manifest.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [plugins, search, category]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    plugins.forEach((p) => map.set(p.manifest.category, (map.get(p.manifest.category) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [plugins]);

  const handleOpen = async (id: string) => {
    const rec = plugins.find((p) => p.manifest.id === id);
    if (!rec) return;
    try {
      await hap.system.openApp(rec.manifest.id, { name: rec.manifest.names?.[locale] ?? rec.manifest.name });
    } catch (e) {
      console.error("打开插件窗口失败:", e);
    }
  };

  return (
    <div className="flex flex-col h-screen select-none">
      {/* 自定义标题栏 */}
      <header
        className="flex items-center shrink-0 border-b"
        style={{
          borderColor: "var(--fs-border)",
          background: theme === "dark" ? "#1e1e2e" : "#f8f9fa",
          height: multiWindow ? 44 : `calc(44px + env(safe-area-inset-top, 0px))`,
          paddingTop: multiWindow ? 0 : "env(safe-area-inset-top, 0px)",
          paddingLeft: isMac && multiWindow ? (isFullscreen ? 12 : 78) : 12,
          paddingRight: isMac ? 12 : 0,
        }}
        data-tauri-drag-region={multiWindow || undefined}
      >
        {/* 左侧：标题 */}
        <div className="flex items-center gap-2 mr-auto" data-tauri-drag-region>
          <span className="text-sm font-semibold opacity-80" data-tauri-drag-region>
            {t("app.title")}
          </span>
        </div>

        {/* 右侧控制区 */}
        <div className="flex items-center gap-0.5">
          {/* 语言切换 */}
          <div ref={langDropRef} className="relative">
            <button
              className="flex items-center gap-1 px-1.5 h-6 text-[11px] rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
              onClick={() => setLangDropOpen(!langDropOpen)}
              title={t("settings.language")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
              </svg>
              <span>{LOCALE_LABELS[locale] ?? locale}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${langDropOpen ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {langDropOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 max-h-72 overflow-y-auto rounded-xl border shadow-lg z-[9999] py-1"
                style={{ borderColor: "var(--fs-border)", background: theme === "dark" ? "#1e1e2e" : "#fff" }}>
                {availableLocales.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => { setLocale(loc); setLangDropOpen(false); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      locale === loc
                        ? "font-medium text-blue-500"
                        : "opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {LOCALE_LABELS[loc] ?? loc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 主题切换 */}
          <button
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100 text-xs"
            onClick={toggleTheme}
            title={t("settings.theme")}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>

          {/* 设置按钮 */}
          <button
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
            onClick={() => setSettingsOpen(true)}
            title={t("settings.title")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* Windows/Linux 窗口控制按钮 */}
          {multiWindow && !isMac && (
            <div className="flex items-center ml-1">
              <button
                className="w-11 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                style={{ height: 44 }}
                onClick={() => hap.window.minimize()}
                title={t("window.minimize")}
              >
                <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
              </button>
              <button
                className="w-11 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                style={{ height: 44 }}
                onClick={() => isMaximized ? hap.window.unmaximize() : hap.window.maximize()}
                title={isMaximized ? t("window.restore") : t("window.maximize")}
              >
                {isMaximized ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="2" y="0" width="8" height="8" rx="0.5"/>
                    <rect x="0" y="2" width="8" height="8" rx="0.5"/>
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="0.5" y="0.5" width="9" height="9" rx="0.5"/>
                  </svg>
                )}
              </button>
              <button
                className="w-11 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                style={{ height: 44 }}
                onClick={() => hap.window.close()}
                title={t("window.close")}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
                  <line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 内容区：滑动容器 */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{ transform: settingsOpen ? "translateX(-100%)" : "translateX(0)" }}
        >
          {/* 主页面 */}
          <div className="w-full h-full shrink-0 flex flex-col overflow-hidden">
            <div className="px-4 pt-3 pb-2 shrink-0">
              <SearchBar value={search} onChange={setSearch} />
              <div className="flex gap-2 mt-2 overflow-x-auto text-sm">
                <button
                  className={`px-3 py-1 rounded-full whitespace-nowrap ${category === "all" ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800"}`}
                  onClick={() => setCategory("all")}
                >
                  {t("app.all")} ({plugins.length})
                </button>
                {categories.map(([cat, count]) => (
                  <button
                    key={cat || `cat-${count}`}
                    className={`px-3 py-1 rounded-full whitespace-nowrap ${category === cat ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800"}`}
                    onClick={() => setCategory(cat)}
                  >
                    {t(`category.${cat}`) !== `category.${cat}` ? t(`category.${cat}`) : cat} ({count})
                  </button>
                ))}
              </div>
            </div>
            <main className="flex-1 overflow-y-auto px-4 pb-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <p className="text-4xl mb-4">📦</p>
                  <p>{t("app.empty.title")}</p>
                  <p className="text-sm mt-1">{t("app.empty.desc")}</p>
                </div>
              ) : (
                <ToolGrid plugins={filtered} onOpen={handleOpen} />
              )}
            </main>
          </div>

          {/* 设置页面 */}
          <div className="w-full h-full shrink-0 overflow-hidden">
            <Settings onBack={() => setSettingsOpen(false)} />
          </div>
        </div>
      </div>

      <Toast />
    </div>
  );
}
