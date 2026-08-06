import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/app-store";

interface NavItem {
  id: string;
  icon: React.ReactNode;
  labelKey: string;
  path: string;
  badge?: number;
}

const NAV_ICONS = {
  discover: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>
  ),
  categories: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  rankings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>
  ),
  installed: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  me: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
};

export function Sidebar({ updateBadge = 0 }: { updateBadge?: number }) {
  const { t } = useI18n();
  const { theme } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const autoCollapsed = windowWidth < 900;
  const isCollapsed = autoCollapsed || collapsed;
  const sidebarWidth = isCollapsed ? 64 : 192;

  const mainNav: NavItem[] = [
    { id: "discover", icon: NAV_ICONS.discover, labelKey: "nav.discover", path: "/" },
    { id: "categories", icon: NAV_ICONS.categories, labelKey: "nav.categories", path: "/categories" },
    { id: "rankings", icon: NAV_ICONS.rankings, labelKey: "nav.rankings", path: "/rankings" },
    { id: "installed", icon: NAV_ICONS.installed, labelKey: "nav.installed", path: "/installed", badge: updateBadge },
  ];

  const bottomNav: NavItem[] = [
    { id: "me", icon: NAV_ICONS.me, labelKey: "nav.me", path: "/me" },
    { id: "settings", icon: NAV_ICONS.settings, labelKey: "nav.settings", path: "/settings" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item.path);
    return (
      <button
        key={item.id}
        className={`relative flex items-center gap-3 w-full rounded-lg transition-colors duration-150 ${
          active
            ? "bg-[var(--fs-primary)]/10 text-[var(--fs-primary)]"
            : "text-[var(--fs-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--fs-text)]"
        }`}
        style={{ height: 40, padding: isCollapsed ? "0 0" : "0 12px", justifyContent: isCollapsed ? "center" : "flex-start" }}
        onClick={() => navigate(item.path)}
        title={isCollapsed ? t(item.labelKey) : undefined}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--fs-primary)]" style={{ height: 20 }} />
        )}
        <span className="shrink-0">{item.icon}</span>
        {!isCollapsed && <span className="text-[13px] font-medium truncate">{t(item.labelKey)}</span>}
        {item.badge && item.badge > 0 ? (
          <span className={`absolute ${isCollapsed ? "top-1 right-2" : "top-1/2 -translate-y-1/2 right-3"} min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1`}>
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      className="flex flex-col shrink-0 border-r h-full transition-[width] duration-200 ease-in-out"
      style={{
        width: sidebarWidth,
        borderColor: "var(--fs-border)",
        background: theme === "dark" ? "var(--fs-bg-secondary)" : "#f8f9fb",
      }}
    >
      {/* Top spacer (small gap for aesthetics) */}
      <div className="shrink-0" style={{ height: 8 }} />

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-1 px-2">
        {mainNav.map(renderItem)}
      </nav>

      {/* Divider + bottom nav */}
      <div className="px-3 my-2">
        <div className="h-px" style={{ background: "var(--fs-border)" }} />
      </div>
      <nav className="flex flex-col gap-1 px-2 pb-2">
        {bottomNav.map(renderItem)}
      </nav>

      {/* Collapse toggle */}
      {!autoCollapsed && (
        <button
          className="flex items-center justify-center h-8 mx-2 mb-2 rounded-lg text-[var(--fs-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          onClick={handleToggle}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
          >
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      )}
    </aside>
  );
}
