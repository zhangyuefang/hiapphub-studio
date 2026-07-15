import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { useAppStore } from "../store/app-store";

interface Props {
  onBack: () => void;
}

type Tab = "settings" | "account" | "libraries" | "dev_mode";

type I18nMap = Record<string, string> | null;

interface FnDesc {
  name: string;
  description: string | null;
  descriptions: I18nMap;
  symbol: string;
  params: { name: string; type: string; desc: string; descs: I18nMap }[];
  returns: { type: string; desc: string; descs: I18nMap };
  bridge_path: string;
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
  description: string;
  descriptions: I18nMap;
  permission: string;
  functions: FnDesc[];
  file_path: string | null;
  file_size: number | null;
}

function i18nText(defaultText: string, i18nMap: I18nMap, locale: string): string {
  if (i18nMap && i18nMap[locale]) return i18nMap[locale];
  return defaultText;
}

export function Settings({ onBack }: Props) {
  const { theme, toggleTheme } = useAppStore();
  const { t, locale, setLocale, availableLocales } = useI18n();
  const [tab, setTab] = useState<Tab>("settings");
  const [modules, setModules] = useState<ModuleDesc[]>([]);
  const [expandedMod, setExpandedMod] = useState<string | null>(null);

  const LOCALE_LABELS: Record<string, string> = {
    "zh-CN": "简体中文",
    "en-US": "English",
  };

  const MENU: { id: Tab; icon: string }[] = [
    { id: "settings", icon: "⚙️" },
    { id: "account", icon: "👤" },
    { id: "libraries", icon: "📦" },
    { id: "dev_mode", icon: "🛠️" },
  ];

  useEffect(() => {
    if (tab === "libraries") {
      invoke<ModuleDesc[]>("hap_list_modules").then(setModules).catch(() => {});
    }
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
          {tab === "account" && <div className="text-sm opacity-50 py-8 text-center">{t("settings.coming_soon")}</div>}
          {tab === "libraries" && <LibrariesPanel modules={modules} expandedMod={expandedMod} setExpandedMod={setExpandedMod} t={t} locale={locale} />}
          {tab === "dev_mode" && <div className="text-sm opacity-50 py-8 text-center">{t("settings.coming_soon")}</div>}
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
          <div className="flex justify-between"><span>{t("settings.version")}</span><span>0.1.0</span></div>
          <div className="flex justify-between"><span>{t("settings.framework")}</span><span>Tauri 2.x + React 19</span></div>
          <div className="flex justify-between">
            <span>{t("settings.website")}</span>
            <a className="text-blue-500 hover:underline" href="https://hiapphub.com" target="_blank" rel="noreferrer">hiapphub.com</a>
          </div>
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
  const lines = [
    `${m.name} v${m.version}`,
    desc,
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
  return [
    `${fn.name}(${fn.params.map((p) => `${p.name}: ${p.type}`).join(", ")}) → ${fn.returns.type}`,
    fnDesc,
    fn.params.length ? `${t("settings.fn_params")}: ${fn.params.map((p) => `${p.name}: ${p.type} (${i18nText(p.desc, p.descs, locale)})`).join(", ")}` : "",
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

function SizeInfoButton({ modules, t }: { modules: ModuleDesc[]; t: (k: string) => string; locale: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const total = modules.reduce((sum, m) => sum + (m.file_size ?? 0), 0);

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [show]);

  return (
    <span className="relative" ref={ref}>
      <button onClick={() => setShow(!show)} className="opacity-60 hover:opacity-100" title={t("settings.lib_size")}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/><text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor">i</text></svg>
      </button>
      {show && (
        <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-gray-800 border rounded shadow-lg p-2 min-w-[180px] z-50 text-[11px]" style={{ borderColor: "var(--fs-border)" }}>
          {modules.map((m) => (
            <div key={m.name} className="flex justify-between py-0.5">
              <span className="truncate mr-2">{m.name}</span>
              <span className="shrink-0 opacity-60">{formatSize(m.file_size)}</span>
            </div>
          ))}
          <div className="border-t mt-1 pt-1 flex justify-between font-medium" style={{ borderColor: "var(--fs-border)" }}>
            <span>{t("settings.loaded_count")}: {modules.length}</span>
            <span>{formatSize(total)}</span>
          </div>
        </div>
      )}
    </span>
  );
}

function LibrariesPanel({ modules, expandedMod, setExpandedMod, t, locale }: {
  modules: ModuleDesc[]; expandedMod: string | null; setExpandedMod: (n: string | null) => void; t: (k: string) => string; locale: string;
}) {
  const [filter, setFilter] = useState("");
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
        m.description.toLowerCase().includes(filter.toLowerCase()) ||
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
        <div className="px-2 py-2 border-b" style={{ borderColor: "var(--fs-border)" }}>
          <input
            className="text-xs px-2 py-1.5 rounded border outline-none w-full"
            style={{ borderColor: "var(--fs-border)", background: "transparent" }}
            placeholder={t("settings.filter_libs")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
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
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 cursor-pointer shrink-0"
                  onClick={(e) => { e.stopPropagation(); setShowUsage(showUsage === m.name ? null : m.name); }}
                >
                  {usageStats[m.name].length}
                </span>
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
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!selected ? (
          <div className="text-sm opacity-40 py-8 text-center">{t("settings.select_lib")}</div>
        ) : (
          <div className="space-y-4">
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
            <div>
              <h4 className="text-xs font-medium opacity-60 mb-2">
                {t("settings.fn_list")} ({selected.functions.length})
              </h4>
              <div className="space-y-3">
                {selected.functions.map((fn) => (
                  <div key={fn.symbol} className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--fs-border)" }}>
                    <div className="px-3 py-2 flex items-center justify-between" style={{ background: "var(--fs-border)", opacity: 0.6 }}>
                      <code className="text-xs font-semibold">
                        {fn.name}(<span className="opacity-70">{fn.params.map((p) => `${p.name}`).join(", ")}</span>)
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
                                <td className="pr-4 py-0.5 font-mono text-blue-500">{p.name}</td>
                                <td className="pr-4 py-0.5 opacity-60">{p.type}</td>
                                <td className="py-0.5 opacity-50">{i18nText(p.desc, p.descs, locale)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="text-xs flex items-center gap-2">
                        <span className="opacity-40">{t("settings.fn_return")}:</span>
                        <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: "var(--fs-border)" }}>
                          {fn.returns.type}
                        </code>
                        <span className="opacity-50">{i18nText(fn.returns.desc, fn.returns.descs, locale)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showUsage && usageStats[showUsage] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={() => setShowUsage(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 min-w-[240px] max-w-[360px]" style={{ borderColor: "var(--fs-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">{t("settings.lib_used_by")}</h4>
              <button className="opacity-40 hover:opacity-100" onClick={() => setShowUsage(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="text-xs opacity-50 mb-2">{showUsage}</div>
            {usageStats[showUsage].map((app) => (
              <div key={app.id} className="flex items-center gap-2 py-1.5 text-sm border-t" style={{ borderColor: "var(--fs-border)" }}>
                <span>📦</span>
                <span>{app.name}</span>
                <span className="text-[10px] opacity-40 ml-auto">{app.id}</span>
              </div>
            ))}
          </div>
        </div>
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
