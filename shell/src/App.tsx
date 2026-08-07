import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { useAppStore } from "@/store/app-store";
import { useStoreStore } from "@/store/store-store";
import { useI18n, loadExternalLocales } from "@/i18n";
import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { Toast } from "@/components/Toast";

const DiscoverPage = lazy(() => import("@/pages/DiscoverPage"));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage"));
const RankingsPage = lazy(() => import("@/pages/RankingsPage"));
const InstalledPage = lazy(() => import("@/pages/InstalledPage"));
const MePage = lazy(() => import("@/pages/MePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const AppDetailPage = lazy(() => import("@/pages/AppDetailPage"));
const CategoryListPage = lazy(() => import("@/pages/CategoryListPage"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppLayout() {
  const { theme, plugins } = useAppStore();
  const { locale, setLocale } = useI18n();
  const updateCount = useStoreStore((s) => s.updates.length);
  const checkUpdates = useStoreStore((s) => s.checkUpdates);

  useEffect(() => {
    const saved = localStorage.getItem("shell_locale");
    if (saved && saved !== locale) setLocale(saved);
    loadExternalLocales();
  }, []);

  useEffect(() => {
    if (plugins.length === 0) return;
    const installed = plugins.map((p) => ({ appId: p.manifest.id, version: p.manifest.version }));
    checkUpdates(installed);
  }, [plugins, checkUpdates]);

  useEffect(() => {
    const dlHandler = (url: any) => {
      const raw = typeof url === "string" ? url : String(url);
      const m = raw.match(/^hiapphub:\/\/(?:install|tool)\/([^/?#]+)/);
      if (m) {
        hap.system.openApp(m[1]).catch((e: any) => console.error("deep-link open failed:", e));
      }
    };
    const dlId = hap.event.on("deep-link", dlHandler);
    const pending = (window as any).__pendingDeepLinks;
    if (pending?.length) {
      (window as any).__pendingDeepLinks = [];
      (window as any).__dlDone = true;
      pending.forEach((u: string) => dlHandler(u));
    }
    return () => { hap.event.off("deep-link", dlId); };
  }, []);

  return (
    <div className="flex flex-col h-screen select-none" data-theme={theme}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar updateBadge={updateCount} />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<DiscoverPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/rankings" element={<RankingsPage />} />
              <Route path="/installed" element={<InstalledPage />} />
              <Route path="/me" element={<MePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/app/:uuid" element={<AppDetailPage />} />
              <Route path="/category/:slug" element={<CategoryListPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}
