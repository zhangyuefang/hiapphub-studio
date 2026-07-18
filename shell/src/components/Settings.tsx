import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useI18n } from "../i18n";
import { useAppStore } from "../store/app-store";
import { AccountPanel } from "./AccountPanel";
import { useAuthStore } from "@/store/auth-store";
import { getApiBase } from "@/lib/api";

interface Props {
  onBack: () => void;
}

type Tab = "settings" | "account" | "libraries" | "dev_mode";

type I18nMap = Record<string, string> | null;

interface ParamDesc {
  name: string;
  type: string;
  desc: string;
  descs: I18nMap;
  optional?: boolean;
  default_value?: string;
}

interface FnDesc {
  name: string;
  description: string | null;
  descriptions: I18nMap;
  symbol: string;
  params: ParamDesc[];
  returns: { type: string; desc: string; descs: I18nMap };
  bridge_path: string;
  group?: string;
  is_async?: boolean;
  platform?: string[];
}

interface TypeDesc {
  name: string;
  descriptions: I18nMap;
  fields: ParamDesc[];
}

interface ConstantDesc {
  name: string;
  value: string | number;
  value_type: string;
  group?: string;
  descs: I18nMap;
}

interface EventDesc {
  name: string;
  descriptions: I18nMap;
  payload: ParamDesc[];
}

interface ModuleDesc {
  uuid: string | null;
  name: string;
  version: string;
  author: string | null;
  author_email: string | null;
  author_url: string | null;
  icon: string | null;
  min_shell_version: string | null;
  category: string;
  description: string | null;
  descriptions: I18nMap;
  overview: string | null;
  overviews: I18nMap;
  permission: string;
  functions: FnDesc[];
  types?: TypeDesc[];
  constants?: ConstantDesc[];
  events?: EventDesc[];
  file_path: string | null;
  file_size: number | null;
}

function i18nText(defaultText: string | null, i18nMap: I18nMap, locale: string): string {
  if (i18nMap && i18nMap[locale]) return i18nMap[locale];
  if (i18nMap && i18nMap["en-US"]) return i18nMap["en-US"];
  return defaultText ?? "";
}

export function Settings({ onBack }: Props) {
  const { theme, toggleTheme } = useAppStore();
  const { t, locale, setLocale, availableLocales } = useI18n();
  const [tab, setTab] = useState<Tab>("settings");
  const [modules, setModules] = useState<ModuleDesc[]>([]);
  const [expandedMod, setExpandedMod] = useState<string | null>(null);

  const LOCALE_LABELS: Record<string, string> = {
    "zh-CN": "简体中文", "en-US": "English", "zh-TW": "繁體中文",
    ja: "日本語", ko: "한국어", es: "Español", fr: "Français",
    de: "Deutsch", "pt-BR": "Português (BR)", ru: "Русский",
    ar: "العربية", hi: "हिन्दी",
  };

  const MENU: { id: Tab; icon: string }[] = [
    { id: "settings", icon: "⚙️" },
    { id: "account", icon: "👤" },
    { id: "libraries", icon: "📦" },
    { id: "dev_mode", icon: "🛠️" },
  ];

  const reloadModules = () => {
    invoke<ModuleDesc[]>("hap_list_modules").then(setModules).catch(() => {});
  };

  useEffect(() => {
    if (tab === "libraries") { reloadModules(); }
  }, [tab]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b" style={{ borderColor: "var(--fs-border)" }}>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          onClick={onBack}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h2 className="text-base font-semibold flex-1">{t("settings.console")}</h2>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          onClick={onBack}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-40 shrink-0 border-r overflow-y-auto py-2" style={{ borderColor: "var(--fs-border)" }}>
          {MENU.map((m) => (
            <button
              key={m.id}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                tab === m.id ? "bg-blue-500/10 text-blue-500 font-medium" : "hover:bg-black/5 dark:hover:bg-white/5"
              }`}
              onClick={() => setTab(m.id)}
            >
              <span>{m.icon}</span>
              <span>{t(`settings.${m.id}`)}</span>
            </button>
          ))}
        </nav>

        <div className={`flex-1 overflow-hidden ${tab === "libraries" ? "" : "overflow-y-auto px-6 py-4"}`}>
          {tab === "settings" && <SettingsPanel theme={theme} toggleTheme={toggleTheme} t={t} locale={locale} setLocale={setLocale} availableLocales={availableLocales} localeLabels={LOCALE_LABELS} />}
          {tab === "account" && <AccountPanel />}
          {tab === "libraries" && <LibrariesPanel modules={modules} expandedMod={expandedMod} setExpandedMod={setExpandedMod} t={t} locale={locale} onReload={reloadModules} />}
          {tab === "dev_mode" && <DevModeLauncher t={t} />}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ theme, toggleTheme, t, locale, setLocale, availableLocales, localeLabels }: {
  theme: string; toggleTheme: () => void; t: (k: string) => string;
  locale: string; setLocale: (l: string) => void; availableLocales: string[];
  localeLabels: Record<string, string>;
}) {
  const currentVersion = "0.1.0";
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "latest" | "available" | "error">("idle");
  const [latestInfo, setLatestInfo] = useState<{ version: string; title: string; changelog: string; publishedAt: string; downloads: { standard: string; developer: string } } | null>(null);
  const [updateError, setUpdateError] = useState("");

  const checkUpdate = async () => {
    setUpdateState("checking");
    setUpdateError("");
    try {
      const res = await fetch(`${getApiBase()}/shell/latest`);
      if (!res.ok) { setUpdateState("error"); setUpdateError(t("settings.update_check_failed")); return; }
      const data = await res.json();
      setLatestInfo(data);
      setUpdateState(data.version === currentVersion ? "latest" : "available");
    } catch {
      setUpdateState("error");
      setUpdateError(t("settings.update_check_failed"));
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-medium mb-3 opacity-60 uppercase tracking-wider">{t("settings.appearance")}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.theme")}</span>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: theme === "dark" ? "#333" : "#f1f3f5" }}>
              <button className={`px-3 py-1 text-xs rounded-md transition-all ${theme === "light" ? "bg-white shadow text-black" : "text-gray-400"}`} onClick={() => theme === "dark" && toggleTheme()}>
                ☀️ {t("settings.light")}
              </button>
              <button className={`px-3 py-1 text-xs rounded-md transition-all ${theme === "dark" ? "bg-gray-600 shadow text-white" : "text-gray-400"}`} onClick={() => theme === "light" && toggleTheme()}>
                🌙 {t("settings.dark")}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.language")}</span>
            <select
              className="text-sm px-3 py-1.5 rounded-lg border outline-none"
              style={{ borderColor: "var(--fs-border)", background: theme === "dark" ? "#2a2a3e" : "#fff", color: theme === "dark" ? "#e0e0e0" : "#333" }}
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              {availableLocales.map((loc) => (
                <option key={loc} value={loc}>{localeLabels[loc] ?? loc}</option>
              ))}
            </select>
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-medium mb-3 opacity-60 uppercase tracking-wider">{t("settings.about")}</h3>
        <div className="space-y-2 text-sm opacity-70">
          <div className="flex justify-between"><span>{t("settings.version")}</span><span>{currentVersion}</span></div>
          <div className="flex justify-between"><span>{t("settings.framework")}</span><span>Tauri 2.x + React 19</span></div>
          <div className="flex justify-between">
            <span>{t("settings.website")}</span>
            <a className="text-blue-500 hover:underline" href="https://hiapphub.com" target="_blank" rel="noreferrer">hiapphub.com</a>
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-medium mb-3 opacity-60 uppercase tracking-wider">{t("settings.update")}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.update_check")}</span>
            <button onClick={checkUpdate} disabled={updateState === "checking"}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
              {updateState === "checking" ? t("settings.update_checking") : t("settings.update_check_btn")}
            </button>
          </div>
          {updateState === "latest" && (
            <div className="text-xs text-green-500 flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              {t("settings.update_latest")}
            </div>
          )}
          {updateState === "available" && latestInfo && (
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--fs-border)" }}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{latestInfo.title || `v${latestInfo.version}`}</span>
                <span className="text-blue-500">v{latestInfo.version}</span>
              </div>
              {latestInfo.changelog && <p className="text-[11px] opacity-60 whitespace-pre-wrap max-h-32 overflow-y-auto">{latestInfo.changelog}</p>}
              {latestInfo.publishedAt && <p className="text-[10px] opacity-40">{new Date(latestInfo.publishedAt).toLocaleDateString()}</p>}
              {latestInfo.downloads.standard && (
                <a href={latestInfo.downloads.standard} target="_blank" rel="noreferrer"
                  className="inline-block text-xs text-blue-500 hover:underline">{t("settings.update_download")} →</a>
              )}
            </div>
          )}
          {updateState === "error" && <p className="text-xs text-red-500">{updateError}</p>}
        </div>
      </section>
    </div>
  );
}

function CopyIcon({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      title={title}
      className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><path d="M20 6L9 17l-5-5"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      )}
    </button>
  );
}

function buildModuleText(m: ModuleDesc, t: (k: string) => string, locale: string): string {
  const desc = i18nText(m.description, m.descriptions, locale);
  const overview = (m.overview || m.overviews) ? i18nText(m.overview ?? "", m.overviews, locale) : "";
  const lines = [
    `${m.name} v${m.version}`,
    desc,
    overview ? `\n${overview}` : "",
    m.uuid ? `UUID: ${m.uuid}` : "",
    m.author ? `${t("settings.lib_author")}: ${m.author}` : "",
    m.author_email ? `${t("settings.lib_email")}: ${m.author_email}` : "",
    m.author_url ? `URL: ${m.author_url}` : "",
    `${t("settings.lib_category")}: ${t(`category.${m.category}`) !== `category.${m.category}` ? t(`category.${m.category}`) : m.category}`,
    `${t("settings.permission")}: ${m.permission}`,
    m.min_shell_version ? `${t("settings.lib_min_shell")}: ${m.min_shell_version}` : "",
    m.file_size ? `${t("settings.lib_size")}: ${formatSize(m.file_size)}` : "",
    m.file_path ? `${t("settings.file_path")}: ${m.file_path}` : "",
    "",
    `${t("settings.fn_list")} (${m.functions.length}):`,
    ...m.functions.flatMap((fn) => [
      "  ────────────────────",
      `  ${buildFnText(fn, t, locale).split("\n").join("\n  ")}`,
    ]),
  ].filter(Boolean);
  return lines.join("\n");
}

function buildFnText(fn: FnDesc, t: (k: string) => string, locale: string): string {
  const fnDesc = i18nText(fn.description ?? "", fn.descriptions, locale);
  const paramSig = fn.params.map((p) => {
    const opt = p.optional ? "?" : "";
    const def = p.optional && p.default_value != null ? `=${p.default_value}` : "";
    return `${p.name}${opt}: ${p.type}${def}`;
  }).join(", ");
  return [
    `${fn.name}(${paramSig}) → ${fn.returns.type}`,
    fnDesc,
    fn.params.length ? `${t("settings.fn_params")}: ${fn.params.map((p) => `${p.name}: ${p.type}${p.optional ? ` [${t("settings.fn_optional")}]` : ""} (${i18nText(p.desc, p.descs, locale)})`).join(", ")}` : "",
    `${t("settings.fn_return")}: ${fn.returns.type} (${i18nText(fn.returns.desc, fn.returns.descs, locale)})`,
    `${t("settings.fn_bridge")}: ${fn.bridge_path}`,
  ].filter(Boolean).join("\n");
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SizeInfoButton({ modules, t, locale }: { modules: ModuleDesc[]; t: (k: string) => string; locale: string }) {
  const [show, setShow] = useState(false);
  const total = modules.reduce((sum, m) => sum + (m.file_size ?? 0), 0);
  const sorted = [...modules].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0));

  const getOverview = (m: ModuleDesc) => {
    if (m.overviews) return (locale === "zh-CN" ? m.overviews["zh-CN"] : m.overviews["en-US"]) || "";
    return m.overview || "";
  };

  return (
    <>
      <button onClick={() => setShow(true)} className="opacity-60 hover:opacity-100" title={t("settings.lib_info")}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/><text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor">i</text></svg>
      </button>
      {show && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setShow(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[620px] max-h-[75vh] flex flex-col border" onClick={(e) => e.stopPropagation()} style={{ borderColor: "var(--fs-border)" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--fs-border)" }}>
              <span className="font-medium text-sm">{t("settings.lib_info")}</span>
              <button onClick={() => setShow(false)} className="opacity-50 hover:opacity-100 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 text-xs space-y-0.5">
              <TooltipPrimitive.Provider delayDuration={300}>
              {sorted.map((m) => (
                <TooltipPrimitive.Root key={m.name}>
                  <TooltipPrimitive.Trigger asChild>
                    <div className="flex items-center gap-2 py-1.5 border-b border-dashed last:border-0 cursor-default" style={{ borderColor: "var(--fs-border)" }}>
                      <span className="text-base shrink-0">{m.icon ?? "📦"}</span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-medium">{m.name}</span>
                          <span className="opacity-50 text-[10px]">{i18nText(m.description, m.descriptions, locale)}</span>
                        </div>
                        <span className="opacity-40 text-[10px] truncate">{getOverview(m)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-70">
                        {m.functions.length > 0 && <span>ƒ{m.functions.length}</span>}
                        {(m.events?.length ?? 0) > 0 && <span>⚡{m.events!.length}</span>}
                        {(m.types?.length ?? 0) > 0 && <span>▣{m.types!.length}</span>}
                        {(m.constants?.length ?? 0) > 0 && <span>◈{m.constants!.length}</span>}
                      </div>
                      <span className="shrink-0 opacity-50 tabular-nums ml-2">{formatSize(m.file_size)}</span>
                    </div>
                  </TooltipPrimitive.Trigger>
                  <TooltipPrimitive.Portal>
                    <TooltipPrimitive.Content side="top" align="center" sideOffset={6} className="z-[99999] rounded-lg border px-3 py-2 text-xs shadow-lg max-w-[360px] bg-white dark:bg-gray-800" style={{ borderColor: "var(--fs-border)" }}>
                      <div className="font-medium mb-1">{m.icon ?? "📦"} {m.name} <span className="opacity-50 font-normal">{i18nText(m.description, m.descriptions, locale)}</span></div>
                      <div className="opacity-70 mb-1.5 leading-relaxed">{getOverview(m)}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 opacity-60">
                        <span>ƒ {m.functions.length} 函数</span>
                        {(m.types?.length ?? 0) > 0 && <span>▣ {m.types!.length} 类型</span>}
                        {(m.events?.length ?? 0) > 0 && <span>⚡ {m.events!.length} 事件</span>}
                        {(m.constants?.length ?? 0) > 0 && <span>◈ {m.constants!.length} 常量</span>}
                        <span>📦 {formatSize(m.file_size)}</span>
                        <span>v{m.version}</span>
                      </div>
                    </TooltipPrimitive.Content>
                  </TooltipPrimitive.Portal>
                </TooltipPrimitive.Root>
              ))}
              </TooltipPrimitive.Provider>
            </div>
            <div className="px-4 py-2 border-t text-xs font-medium flex justify-between" style={{ borderColor: "var(--fs-border)" }}>
              <span>{t("settings.loaded_count")}: {modules.length}</span>
              <span>{formatSize(total)}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function LibrariesPanel({ modules, expandedMod, setExpandedMod, t, locale, onReload }: {
  modules: ModuleDesc[]; expandedMod: string | null; setExpandedMod: (n: string | null) => void; t: (k: string) => string; locale: string; onReload: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [reloading, setReloading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeTocId, setActiveTocId] = useState<string>("");
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  const handleDetailScroll = useCallback(() => {
    const container = detailScrollRef.current;
    if (!container) return;
    const ids = container.querySelectorAll("[id^='fn-'], [id^='type-'], [id^='event-']");
    let closest: string = "";
    let minDist = Infinity;
    const containerTop = container.getBoundingClientRect().top;
    ids.forEach((el) => {
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop - 60);
      if (dist < minDist) { minDist = dist; closest = el.id; }
    });
    setActiveTocId(closest);
  }, []);

  const handleReload = async () => {
    setReloading(true);
    try {
      await invoke("hap_reload_modules");
      onReload();
    } catch { /* ignore */ }
    setReloading(false);
  };
  const [usageStats, setUsageStats] = useState<Record<string, { id: string; name: string }[]>>({});
  const [showUsage, setShowUsage] = useState<string | null>(null);

  useEffect(() => {
    invoke<Record<string, { id: string; name: string }[]>>("hap_lib_usage_stats")
      .then(setUsageStats)
      .catch(() => {});
  }, [modules]);
  const filtered = filter.trim()
    ? modules.filter((m) =>
        m.name.toLowerCase().includes(filter.toLowerCase()) ||
        (m.description ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        m.category.toLowerCase().includes(filter.toLowerCase())
      )
    : modules;

  const selected = modules.find((m) => m.name === expandedMod);

  if (modules.length === 0) {
    return <div className="text-sm opacity-50 py-8 text-center">{t("settings.no_libraries")}</div>;
  }

  return (
    <div className="flex h-full">
      {/* 左侧模块列表 */}
      <div className="w-48 shrink-0 border-r flex flex-col" style={{ borderColor: "var(--fs-border)" }}>
        <div className="px-2 py-2 border-b flex gap-1" style={{ borderColor: "var(--fs-border)" }}>
          <input
            className="text-xs px-2 py-1.5 rounded border outline-none flex-1 min-w-0"
            style={{ borderColor: "var(--fs-border)", background: "transparent" }}
            placeholder={t("settings.filter_libs")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            onClick={handleReload}
            disabled={reloading}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
            title={t("settings.refresh_libs")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={reloading ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 11-2.2-5.9" /><path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.name}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 text-sm transition-colors ${
                expandedMod === m.name ? "bg-blue-500/10 text-blue-500" : "hover:bg-black/5 dark:hover:bg-white/5"
              }`}
              onClick={() => setExpandedMod(m.name)}
            >
              <span className="text-base shrink-0">{m.icon ?? "📦"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="font-medium truncate">{m.name}</span>
                  <span className="text-[10px] opacity-40 shrink-0">v{m.version}</span>
                </div>
                {m.description && (
                  <div className="text-[11px] opacity-50 truncate">{i18nText(m.description, m.descriptions, locale)}</div>
                )}
              </div>
              {(usageStats[m.name]?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded-full bg-blue-500/15 text-blue-500 cursor-pointer shrink-0 hover:bg-blue-500/25 transition-colors"
                  onPointerDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowUsage(showUsage === m.name ? null : m.name); }}
                >
                  {usageStats[m.name].length}
                </button>
              )}
            </button>
          ))}
        </div>
        <div className="px-3 py-0.5 text-[10px] opacity-40 border-t flex items-center justify-between" style={{ borderColor: "var(--fs-border)" }}>
          <span>{t("settings.loaded_count")}: {modules.length}</span>
          <SizeInfoButton modules={modules} t={t} locale={locale} />
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 relative" ref={detailScrollRef} onScroll={handleDetailScroll}>
        {!selected ? (
          <div className="text-sm opacity-40 py-8 text-center">{t("settings.select_lib")}</div>
        ) : (
          <div className="flex gap-3">
          <div className="flex-1 min-w-0 space-y-4">
            {/* 头部 */}
            <div className="flex items-start gap-3">
              <span className="text-3xl">{selected.icon ?? "📦"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{selected.name}</h3>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-xs opacity-50">v{selected.version}</span>
                    <CopyIcon text={buildModuleText(selected, t, locale)} title={t("settings.copy_all")} />
                  </div>
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-xs opacity-60">{i18nText(selected.description, selected.descriptions, locale)}</span>
                  <span className="text-[10px] font-mono opacity-40 shrink-0 ml-2">{selected.uuid ?? ""}</span>
                </div>
              </div>
            </div>

            {(selected.overview || selected.overviews) && (
              <div className="text-xs leading-relaxed opacity-70 px-3 py-2.5 rounded-lg" style={{ background: "var(--fs-border)" }}>
                {i18nText(selected.overview ?? "", selected.overviews, locale)}
              </div>
            )}

            {/* 统计摘要 */}
            {(() => {
              const stats = [
                { key: "sec-fn-list", label: t("settings.fn_list"), count: selected.functions.length },
                { key: "sec-type-list", label: t("settings.type_list"), count: selected.types?.length ?? 0 },
                { key: "sec-const-list", label: t("settings.const_list"), count: selected.constants?.length ?? 0 },
                { key: "sec-event-list", label: t("settings.event_list"), count: selected.events?.length ?? 0 },
              ].filter(s => s.count > 0);
              return stats.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {stats.map(s => (
                    <button
                      key={s.key}
                      className="text-[11px] px-2.5 py-1 rounded-full border cursor-pointer hover:bg-blue-500/10 transition-colors"
                      style={{ borderColor: "var(--fs-border)" }}
                      onClick={() => document.getElementById(s.key)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      {s.label} <span className="font-semibold text-blue-500 ml-0.5">{s.count}</span>
                    </button>
                  ))}
                </div>
              ) : null;
            })()}

            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <InfoRow label={t("settings.lib_author")} value={selected.author ?? "-"} />
              <InfoRow label={t("settings.lib_email")} value={selected.author_email ?? "-"} />
              {selected.author_url && (
                <InfoRow label={t("settings.website")} value={
                  <a className="text-blue-500 hover:underline" href={selected.author_url} target="_blank" rel="noreferrer">{selected.author_url}</a>
                } />
              )}
              <InfoRow label={t("settings.lib_category")} value={selected.category} />
              <InfoRow label={t("settings.permission")} value={selected.permission} />
              <InfoRow label={t("settings.lib_min_shell")} value={selected.min_shell_version ?? "-"} />
              <InfoRow label={t("settings.lib_size")} value={formatSize(selected.file_size)} />
              {selected.file_path && (
                <div className="col-span-2">
                  <InfoRow label={t("settings.file_path")} value={
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono truncate" title={selected.file_path}>{selected.file_path}</span>
                      <button
                        className="shrink-0 text-blue-500 hover:underline whitespace-nowrap"
                        onClick={() => invoke("hap_reveal_in_folder", { path: selected.file_path })}
                      >{t("settings.browse")}</button>
                    </span>
                  } />
                </div>
              )}
            </div>

            {/* API 列表 */}
            <div id="sec-fn-list">
              <h4 className="text-xs font-medium opacity-60 mb-2">
                {t("settings.fn_list")} ({selected.functions.length})
              </h4>
              <div className="space-y-3">
                {(() => {
                  const groups = new Map<string, FnDesc[]>();
                  for (const fn of selected.functions) {
                    const g = fn.group || "";
                    if (!groups.has(g)) groups.set(g, []);
                    groups.get(g)!.push(fn);
                  }
                  const entries = Array.from(groups.entries());
                  const hasMultipleGroups = entries.length > 1 || (entries.length === 1 && entries[0][0] !== "");
                  const groupLabel = (g: string) => {
                    const key = `settings.fn_group_${g}`;
                    const translated = t(key);
                    return translated !== key ? translated : g;
                  };
                  const toggleGroup = (g: string) => {
                    setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      next.has(g) ? next.delete(g) : next.add(g);
                      return next;
                    });
                  };
                  return entries.map(([groupName, fns]) => (
                    <div key={groupName}>
                      {hasMultipleGroups && (
                        <div
                          className="text-[11px] font-semibold opacity-60 tracking-wider mb-1 mt-3 border-b pb-1 flex items-center gap-2 cursor-pointer select-none"
                          style={{ borderColor: "var(--fs-border)" }}
                          onClick={() => toggleGroup(groupName)}
                        >
                          <span className="text-[10px]">{collapsedGroups.has(groupName) ? "▶" : "▼"}</span>
                          <span>{groupLabel(groupName || "default")}</span>
                          <span className="opacity-40">({fns.length})</span>
                        </div>
                      )}
                      {!collapsedGroups.has(groupName) && fns.map((fn) => (
                  <div key={fn.symbol} id={`fn-${fn.name}`} className="border rounded-lg overflow-hidden mt-2.5" style={{ borderColor: "var(--fs-border)" }}>
                    <div className="px-3 py-2 flex items-center justify-between" style={{ background: "var(--fs-border)", opacity: 0.6 }}>
                      <code className="text-xs font-semibold">
                        {fn.name}(<span className="opacity-70">{fn.params.map((p) => p.optional ? `${p.name}?` : p.name).join(", ")}</span>)
                        <span className="opacity-50"> → {fn.returns.type}</span>
                      </code>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-mono opacity-40">{fn.bridge_path}</span>
                        <CopyIcon text={buildFnText(fn, t, locale)} />
                      </div>
                    </div>
                    <div className="px-3 py-2 space-y-2">
                      {fn.description && <div className="text-xs opacity-60">{i18nText(fn.description, fn.descriptions, locale)}</div>}
                      {fn.params.length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="opacity-40">
                              <th className="text-left font-normal pb-1 pr-4">{t("settings.fn_params")}</th>
                              <th className="text-left font-normal pb-1 pr-4">{t("settings.fn_type")}</th>
                              <th className="text-left font-normal pb-1">{t("settings.fn_desc")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fn.params.map((p) => (
                              <tr key={p.name}>
                                <td className="pr-4 py-0.5 font-mono text-blue-500">
                                  {p.name}
                                  {p.optional && <span className="text-[10px] text-orange-400 ml-1">{t("settings.fn_optional")}</span>}
                                </td>
                                <td className="pr-4 py-0.5 opacity-60">{p.type}</td>
                                <td className="py-0.5 opacity-50">
                                  {i18nText(p.desc, p.descs, locale)}
                                  {p.optional && p.default_value != null && (
                                    <span className="ml-1.5 text-[11px] text-green-600 dark:text-green-400 font-medium">{t("settings.fn_default")}: {p.default_value}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="text-xs flex items-center gap-2">
                        <span className="opacity-40">{t("settings.fn_return")}:</span>
                        {(() => {
                          const typeDef = selected?.types?.find((td) => td.name === fn.returns.type);
                          if (typeDef) {
                            return (
                              <TooltipPrimitive.Provider delayDuration={200}>
                                <TooltipPrimitive.Root>
                                  <TooltipPrimitive.Trigger asChild>
                                    <code className="px-1.5 py-0.5 rounded text-[11px] cursor-help underline decoration-dashed" style={{ background: "var(--fs-border)" }}>
                                      {fn.returns.type}
                                    </code>
                                  </TooltipPrimitive.Trigger>
                                  <TooltipPrimitive.Portal>
                                    <TooltipPrimitive.Content side="top" align="start" sideOffset={4} className="z-[99999] rounded-lg border px-3 py-2 text-xs shadow-lg bg-white dark:bg-gray-800 max-w-[320px]" style={{ borderColor: "var(--fs-border)" }}>
                                      <div className="font-medium mb-1">{typeDef.name} <span className="opacity-50 font-normal">{i18nText(null, typeDef.descriptions, locale)}</span></div>
                                      <table className="w-full text-[10px]">
                                        <tbody>
                                          {typeDef.fields.map((f) => (
                                            <tr key={f.name} className="border-b border-dashed last:border-0" style={{ borderColor: "var(--fs-border)" }}>
                                              <td className="py-0.5 pr-2 font-mono">{f.name}</td>
                                              <td className="py-0.5 pr-2 opacity-60">{f.type}</td>
                                              <td className="py-0.5 opacity-50">{i18nText(f.desc ?? null, f.descs, locale)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </TooltipPrimitive.Content>
                                  </TooltipPrimitive.Portal>
                                </TooltipPrimitive.Root>
                              </TooltipPrimitive.Provider>
                            );
                          }
                          return (
                            <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: "var(--fs-border)" }}>
                              {fn.returns.type}
                            </code>
                          );
                        })()}
                        <span className="opacity-50">{i18nText(fn.returns.desc, fn.returns.descs, locale)}</span>
                      </div>
                    </div>
                  </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Types */}
            {selected.types && selected.types.length > 0 && (
              <div id="sec-type-list">
                <h4 className="text-xs font-medium opacity-60 mb-2">{t("settings.type_list")} ({selected.types.length})</h4>
                <div className="space-y-2">
                  {selected.types.map((td) => (
                    <div key={td.name} id={`type-${td.name}`} className="border rounded-lg p-3" style={{ borderColor: "var(--fs-border)" }}>
                      <div className="text-xs font-semibold mb-1"><code>{td.name}</code></div>
                      <div className="text-[11px] opacity-50 mb-2">{i18nText(null, td.descriptions, locale)}</div>
                      <table className="w-full text-xs">
                        <tbody>
                          {td.fields.map((f) => (
                            <tr key={f.name}>
                              <td className="pr-3 py-0.5 font-mono text-blue-500">{f.name}{f.optional && <span className="text-orange-400 text-[10px] ml-1">{t("settings.fn_optional")}</span>}</td>
                              <td className="pr-3 py-0.5 opacity-60">{f.type}</td>
                              <td className="py-0.5 opacity-50">{i18nText(null, f.descs, locale)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Constants */}
            {selected.constants && selected.constants.length > 0 && (
              <div id="sec-const-list">
                <h4 className="text-xs font-medium opacity-60 mb-2">{t("settings.const_list")} ({selected.constants.length})</h4>
                <table className="w-full text-xs border rounded-lg overflow-hidden" style={{ borderColor: "var(--fs-border)" }}>
                  <thead>
                    <tr className="opacity-40">
                      <th className="text-left font-normal p-2">{t("settings.const_name")}</th>
                      <th className="text-left font-normal p-2">{t("settings.const_value")}</th>
                      <th className="text-left font-normal p-2">{t("settings.fn_desc")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.constants.map((c) => (
                      <tr key={c.name} className="border-t" style={{ borderColor: "var(--fs-border)" }}>
                        <td className="p-2 font-mono text-purple-500">{c.name}</td>
                        <td className="p-2 opacity-70">{JSON.stringify(c.value)}</td>
                        <td className="p-2 opacity-50">{i18nText(null, c.descs, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Events */}
            {selected.events && selected.events.length > 0 && (
              <div id="sec-event-list">
                <h4 className="text-xs font-medium opacity-60 mb-2">{t("settings.event_list")} ({selected.events.length})</h4>
                <div className="space-y-2">
                  {selected.events.map((ev) => (
                    <div key={ev.name} id={`event-${ev.name}`} className="border rounded-lg p-3" style={{ borderColor: "var(--fs-border)" }}>
                      <div className="text-xs font-semibold mb-1"><code>⚡ {ev.name}</code></div>
                      <div className="text-[11px] opacity-50 mb-2">{i18nText(null, ev.descriptions, locale)}</div>
                      {ev.payload.length > 0 && (
                        <table className="w-full text-xs">
                          <tbody>
                            {ev.payload.map((p) => (
                              <tr key={p.name}>
                                <td className="pr-3 py-0.5 font-mono text-green-500">{p.name}</td>
                                <td className="pr-3 py-0.5 opacity-60">{p.type}</td>
                                <td className="py-0.5 opacity-50">{i18nText(null, p.descs, locale)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* 悬浮目录导航 - sticky */}
          <div className="w-28 shrink-0 sticky top-0 self-start max-h-[80vh] overflow-y-auto text-[10px] border-l pl-2" style={{ borderColor: "var(--fs-border)" }}>
            <div className="flex flex-col gap-0.5 py-2">
              {(() => {
                const groups = new Map<string, FnDesc[]>();
                for (const fn of selected.functions) {
                  const g = fn.group || "";
                  if (!groups.has(g)) groups.set(g, []);
                  groups.get(g)!.push(fn);
                }
                const groupLabel = (g: string) => { const k = `settings.fn_group_${g}`; const v = t(k); return v !== k ? v : g; };
                return Array.from(groups.entries()).map(([g, fns]) => (
                  <div key={g}>
                    {g && <div className="font-semibold mt-1.5 mb-0.5 opacity-60">{groupLabel(g)}</div>}
                    {!g && <div className="font-semibold mb-0.5 cursor-pointer" onClick={() => document.getElementById("sec-fn-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("settings.fn_list")}</div>}
                    {fns.map(fn => (
                      <button key={fn.name} className={`text-left pl-2 py-px truncate w-full cursor-pointer rounded ${activeTocId === `fn-${fn.name}` ? "text-blue-500 font-medium bg-blue-500/10" : "hover:text-blue-500"}`} title={fn.name} onClick={() => document.getElementById(`fn-${fn.name}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{fn.name}</button>
                    ))}
                  </div>
                ));
              })()}
              {selected.types && selected.types.length > 0 && (
                <>
                  <div className="font-semibold mt-2 mb-0.5 cursor-pointer" onClick={() => document.getElementById("sec-type-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("settings.type_list")}</div>
                  {selected.types.map(td => (
                    <button key={td.name} className={`text-left pl-2 py-px truncate w-full cursor-pointer rounded ${activeTocId === `type-${td.name}` ? "text-blue-500 font-medium bg-blue-500/10" : "hover:text-blue-500"}`} title={td.name} onClick={() => document.getElementById(`type-${td.name}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{td.name}</button>
                  ))}
                </>
              )}
              {selected.constants && selected.constants.length > 0 && (
                <div className="font-semibold mt-2 mb-0.5 cursor-pointer" onClick={() => document.getElementById("sec-const-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("settings.const_list")}</div>
              )}
              {selected.events && selected.events.length > 0 && (
                <>
                  <div className="font-semibold mt-2 mb-0.5 cursor-pointer" onClick={() => document.getElementById("sec-event-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("settings.event_list")}</div>
                  {selected.events.map(ev => (
                    <button key={ev.name} className={`text-left pl-2 py-px truncate w-full cursor-pointer rounded ${activeTocId === `event-${ev.name}` ? "text-blue-500 font-medium bg-blue-500/10" : "hover:text-blue-500"}`} title={ev.name} onClick={() => document.getElementById(`event-${ev.name}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{ev.name}</button>
                  ))}
                </>
              )}
            </div>
          </div>
          </div>
        )}
      </div>

      {showUsage && usageStats[showUsage] && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={() => setShowUsage(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-[480px] max-h-[70vh] flex flex-col" style={{ borderColor: "var(--fs-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h4 className="text-sm font-semibold">{t("settings.lib_used_by")}</h4>
              <button className="opacity-40 hover:opacity-100" onClick={() => setShowUsage(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="text-xs opacity-50 mb-2 shrink-0">{showUsage} — {usageStats[showUsage].length} {t("settings.lib_usage_apps")}</div>
            <div className="overflow-y-auto flex-1">
              {usageStats[showUsage].map((app) => (
                <div key={app.id} className="flex items-center gap-3 py-2 text-sm border-t" style={{ borderColor: "var(--fs-border)" }}>
                  <span className="text-lg">📦</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{app.name}</div>
                    <div className="text-[11px] opacity-40 font-mono truncate">{app.id}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="opacity-50 shrink-0">{label}:</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

function DevModeLauncher({ t }: { t: (k: string) => string }) {
  const { isLoggedIn } = useAuthStore();

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="inline-flex w-16 h-16 bg-yellow-500/10 rounded-2xl items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-yellow-500">
              <path d="M12 9v4m0 4h.01M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
            </svg>
          </div>
          <p className="text-sm opacity-60">{t("devtools.need_login")}</p>
          <p className="text-xs opacity-40">{t("devtools.need_login_desc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center space-y-6 max-w-sm">
        <div className="inline-flex w-20 h-20 bg-blue-500/10 rounded-3xl items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold">{t("devtools.title")}</h3>
          <p className="text-xs opacity-50 mt-2 leading-relaxed">{t("devtools.hap_app_desc")}</p>
        </div>
        <p className="text-xs opacity-40">{t("devtools.hap_app_hint")}</p>
      </div>
    </div>
  );
}
