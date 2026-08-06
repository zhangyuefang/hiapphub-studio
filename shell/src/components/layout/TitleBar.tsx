import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/app-store";

const LOCALE_LABELS: Record<string, string> = {
  "zh-CN": "简体中文", "en-US": "English", "zh-TW": "繁體中文",
  ja: "日本語", ko: "한국어", es: "Español", fr: "Français",
  de: "Deutsch", "pt-BR": "Português (BR)", ru: "Русский",
  ar: "العربية", hi: "हिन्दी",
};

export function TitleBar() {
  const { t, locale, setLocale, availableLocales } = useI18n();
  const { theme, toggleTheme } = useAppStore();
  const navigate = useNavigate();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [multiWindow, setMultiWindow] = useState(true);
  const [customTitleBar, setCustomTitleBar] = useState(true);
  const [langDropOpen, setLangDropOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const langDropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
        if (caps?.features?.multiWindow === false) setMultiWindow(false);
        if (caps?.features?.customTitleBar === false) setCustomTitleBar(false);
      } catch {}
      try {
        setIsMaximized(await hap.window.isMaximized());
        setIsFullscreen(await hap.window.isFullscreen());
        if (!navigator.userAgent.includes("Mac")) {
          await hap.window.setDecorations(false);
        }
      } catch {}
    };
    init();
    const unlisten = hap.window.onResized(async () => {
      try {
        setIsMaximized(await hap.window.isMaximized());
        setIsFullscreen(await hap.window.isFullscreen());
      } catch {}
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isMac = navigator.userAgent.includes("Mac");

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = searchRef.current?.value?.trim();
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      searchRef.current?.blur();
    }
  };

  return (
    <header
      className="flex items-center shrink-0 border-b"
      style={{
        borderColor: "var(--fs-border)",
        background: theme === "dark" ? "#1e1e2e" : "#f8f9fa",
        height: multiWindow ? 52 : `calc(52px + env(safe-area-inset-top, 0px))`,
        paddingTop: multiWindow ? 0 : "env(safe-area-inset-top, 0px)",
        paddingLeft: isMac && multiWindow && customTitleBar ? (isFullscreen ? 12 : 78) : 12,
        paddingRight: isMac ? 12 : 0,
      }}
      data-tauri-drag-region={multiWindow && customTitleBar || undefined}
    >
      {/* Search bar (center) */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-auto px-4" data-tauri-drag-region>
        <div
          className={`flex items-center h-8 rounded-lg border px-3 gap-2 transition-colors ${
            searchFocused ? "border-[var(--fs-primary)] bg-white dark:bg-[#1a1a2e]" : "border-[var(--fs-border)] bg-[var(--fs-bg)]"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={searchRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-[var(--fs-text-secondary)]"
            placeholder={t("search.placeholder")}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className="hidden sm:inline text-[10px] text-[var(--fs-text-secondary)] border border-[var(--fs-border)] rounded px-1 py-0.5 leading-none">⌘K</kbd>
        </div>
      </form>

      {/* Right controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Language */}
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
          </button>
          {langDropOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 max-h-72 overflow-y-auto rounded-xl border shadow-lg z-[9999] py-1"
              style={{ borderColor: "var(--fs-border)", background: theme === "dark" ? "#1e1e2e" : "#fff" }}>
              {availableLocales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => { setLocale(loc); setLangDropOpen(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    locale === loc ? "font-medium text-blue-500" : "opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {LOCALE_LABELS[loc] ?? loc}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100 text-xs"
          onClick={toggleTheme}
          title={t("settings.theme")}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>

        {/* Windows/Linux window controls */}
        {multiWindow && !isMac && customTitleBar && (
          <div className="flex items-center ml-1">
            <button className="w-11 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors" style={{ height: 52 }} onClick={() => hap.window.minimize()} title={t("window.minimize")}>
              <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
            </button>
            <button className="w-11 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors" style={{ height: 52 }} onClick={() => isMaximized ? hap.window.unmaximize() : hap.window.maximize()} title={isMaximized ? t("window.restore") : t("window.maximize")}>
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="0" width="8" height="8" rx="0.5"/><rect x="0" y="2" width="8" height="8" rx="0.5"/></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" rx="0.5"/></svg>
              )}
            </button>
            <button className="w-11 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors" style={{ height: 52 }} onClick={() => hap.window.close()} title={t("window.close")}>
              <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
