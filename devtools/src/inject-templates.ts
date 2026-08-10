export function getTitlebarTsx(appName: string): string {
  return `import { useState, useEffect, type ReactNode } from 'react';

const IS_MAC = navigator.platform.includes('Mac');
const hap = (window as any).hap;

export function Titlebar({ title, children }: { title: string; children?: ReactNode }) {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    const check = async () => {
      try { setIsMax(await hap?.window?.isMaximized?.()); } catch {}
    };
    check();
  }, []);

  return (
    <header className="app-titlebar" data-tauri-drag-region
      style={{ paddingLeft: IS_MAC ? 78 : 12, paddingRight: IS_MAC ? 12 : 0 }}>
      <span className="app-titlebar-title" data-tauri-drag-region>{title}</span>
      <div className="app-titlebar-actions">
        {children}
        {!IS_MAC && (
          <>
            <button className="app-titlebar-btn" onClick={() => hap?.window?.minimize?.()}>
              <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
            </button>
            <button className="app-titlebar-btn" onClick={async () => {
              await hap?.window?.maximize?.();
              setIsMax(!isMax);
            }}>
              {isMax
                ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="2" y="0" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="0" y="2" width="8" height="8" rx="1" fill="var(--bg, #fff)" stroke="currentColor" strokeWidth="1"/></svg>
                : <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
              }
            </button>
            <button className="app-titlebar-btn close" onClick={() => hap?.window?.close?.()}>
              <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/></svg>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
`;
}

export function getTitlebarCss(): string {
  return `
.app-titlebar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
  height: 38px; display: flex; align-items: center; justify-content: space-between;
  background: var(--titlebar-bg, #f0f0f0); border-bottom: 1px solid var(--border, #e0e0e0);
  -webkit-app-region: drag; user-select: none; font-size: 13px;
}
[data-theme="dark"] .app-titlebar { background: var(--titlebar-bg, #2b2b2b); }
.app-titlebar-title { font-weight: 600; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-titlebar-actions {
  display: flex; align-items: center; gap: 4px; padding-right: 8px;
  -webkit-app-region: no-drag;
}
.app-titlebar-btn {
  width: 28px; height: 28px; border: none; background: transparent; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  color: var(--fg, #333); transition: background 0.15s, color 0.15s;
}
.app-titlebar-btn:hover { background: rgba(0,0,0,0.06); }
[data-theme="dark"] .app-titlebar-btn:hover { background: rgba(255,255,255,0.08); }
.app-titlebar-btn.close:hover { background: #e81123; color: #fff; }
`;
}

export function getLangSwitcherTsx(locales: string[]): string {
  const labels = locales.map(l => `  '${l}': '${l}'`).join(',\n');
  return `import { useState } from 'react';
import { getLocale, setLocale, getSupportedLocales } from './i18n';

const LOCALE_LABELS: Record<string, string> = {
${labels}
};

export function LangSwitcher() {
  const [current, setCurrent] = useState(getLocale());
  const locales = getSupportedLocales();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLocale(e.target.value);
    setCurrent(e.target.value);
  }

  return (
    <select className="lang-switcher" value={current} onChange={handleChange}>
      {locales.map(loc => (
        <option key={loc} value={loc}>{LOCALE_LABELS[loc] || loc}</option>
      ))}
    </select>
  );
}
`;
}

export function getLangSwitcherCss(): string {
  return `
.lang-switcher {
  height: 28px; padding: 0 6px; border: none; border-radius: 4px;
  background: transparent; color: var(--fg, #333); font-size: 11px;
  cursor: pointer; outline: none;
}
.lang-switcher:hover { background: rgba(0,0,0,0.06); }
[data-theme="dark"] .lang-switcher { color: var(--fg, #e8e8e8); }
[data-theme="dark"] .lang-switcher:hover { background: rgba(255,255,255,0.08); }
`;
}

export function getThemeSwitcherTsx(): string {
  return `import { useState } from 'react';
import { getTheme, setTheme, type ThemeMode } from './theme';

const ICONS: Record<ThemeMode, string> = { system: '🖥', light: '☀', dark: '🌙' };
const LABELS: Record<ThemeMode, string> = { system: '跟随系统', light: '浅色', dark: '深色' };

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>(getTheme());

  function cycle() {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(mode) + 1) % 3];
    setTheme(next);
    setMode(next);
  }

  return (
    <button className="theme-switcher" onClick={cycle} title={LABELS[mode]}>
      {ICONS[mode]}
    </button>
  );
}
`;
}

export function getThemeSwitcherCss(): string {
  return `
.theme-switcher {
  width: 28px; height: 28px; border: none; background: transparent; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 14px;
}
.theme-switcher:hover { background: rgba(0,0,0,0.06); }
[data-theme="dark"] .theme-switcher:hover { background: rgba(255,255,255,0.08); }
`;
}

export function getI18nTs(locales: string[], defaultLocale: string, appName: string, followSystem: boolean): string {
  const entries = locales.map(loc => `  '${loc}': { 'app.title': '${appName}' }`).join(',\n');
  const detectBody = followSystem
    ? `  const saved = localStorage.getItem('app-locale');
  if (saved && SUPPORTED.includes(saved)) return saved;
  const nav = navigator.language;
  if (SUPPORTED.includes(nav)) return nav;
  const prefix = nav.split('-')[0];
  const match = SUPPORTED.find(s => s.startsWith(prefix));
  return match || SUPPORTED[0];`
    : `  const saved = localStorage.getItem('app-locale');
  if (saved && SUPPORTED.includes(saved)) return saved;
  return SUPPORTED[0];`;
  return `type Messages = Record<string, string>;

const messages: Record<string, Messages> = {
${entries}
};

const SUPPORTED = ${JSON.stringify(locales)};
let current: string = detectLocale();

function detectLocale(): string {
${detectBody}
}

export function t(key: string): string {
  return messages[current]?.[key] || messages[SUPPORTED[0]]?.[key] || key;
}

export function setLocale(loc: string) {
  if (SUPPORTED.includes(loc)) {
    current = loc;
    localStorage.setItem('app-locale', loc);
    window.dispatchEvent(new Event('locale-change'));
  }
}

export function getLocale(): string { return current; }
export function getSupportedLocales(): string[] { return [...SUPPORTED]; }
`;
}

export function getThemeTs(): string {
  return `export type ThemeMode = 'system' | 'light' | 'dark';

let current: ThemeMode = 'system';
const mq = window.matchMedia('(prefers-color-scheme: dark)');

function apply() {
  const isDark = current === 'dark' || (current === 'system' && mq.matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

export function initTheme() {
  current = (localStorage.getItem('app-theme') as ThemeMode) || 'system';
  apply();
  mq.addEventListener('change', apply);
}

export function setTheme(mode: ThemeMode) {
  current = mode;
  localStorage.setItem('app-theme', mode);
  apply();
}

export function getTheme(): ThemeMode { return current; }
`;
}

export function getThemeCssVars(): string {
  return `
:root, [data-theme="light"] {
  --bg: #ffffff; --fg: #1a1a1a; --bg-secondary: #f5f5f5;
  --border: #e0e0e0; --accent: #2563eb; --accent-fg: #ffffff;
  --titlebar-bg: #f0f0f0;
}
[data-theme="dark"] {
  --bg: #1a1a1a; --fg: #e8e8e8; --bg-secondary: #2a2a2a;
  --border: #3a3a3a; --accent: #3b82f6; --accent-fg: #ffffff;
  --titlebar-bg: #2b2b2b;
}
body { background: var(--bg); color: var(--fg); transition: background 0.2s, color 0.2s; }
`;
}
