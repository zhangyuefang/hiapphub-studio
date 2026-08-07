import { useMemo, useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useStoreStore, type UpdateInfo } from "@/store/store-store";
import { useDownloadStore } from "@/store/download-store";
import { useI18n } from "@/i18n";
import { ToolGrid } from "@/components/ToolGrid";

export default function InstalledPage() {
  const { plugins, category, setCategory } = useAppStore();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<"all" | "updates">("all");
  const updates = useStoreStore((s) => s.updates);
  const checkUpdates = useStoreStore((s) => s.checkUpdates);
  const enqueue = useDownloadStore((s) => s.enqueue);

  useEffect(() => {
    const installed = plugins.map((p) => ({ appId: p.manifest.id, version: p.manifest.version }));
    checkUpdates(installed);
  }, [plugins, checkUpdates]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    plugins.forEach((p) => map.set(p.manifest.category, (map.get(p.manifest.category) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [plugins]);

  const filtered = useMemo(() => {
    let list = plugins;
    if (category !== "all") list = list.filter((p) => p.manifest.category === category);
    return list;
  }, [plugins, category]);

  const handleOpen = async (id: string) => {
    const rec = plugins.find((p) => p.manifest.id === id);
    if (!rec) return;
    try {
      await hap.system.openApp(rec.manifest.id, { name: rec.manifest.names?.[locale] ?? rec.manifest.name });
    } catch (e) {
      console.error("打开插件窗口失败:", e);
    }
  };

  const handleUpdateOne = (u: UpdateInfo) => {
    enqueue({ uuid: u.uuid, appId: u.appId, name: u.name, version: u.latestVersion, fileUrl: u.fileUrl, fileSize: u.fileSize, isUpdate: true });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-4 px-6 pt-4 pb-2 shrink-0">
        <button
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${tab === "all" ? "border-[var(--fs-primary)] text-[var(--fs-primary)]" : "border-transparent text-[var(--fs-text-secondary)]"}`}
          onClick={() => setTab("all")}
        >
          {t("installed.all")} ({plugins.length})
        </button>
        <button
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${tab === "updates" ? "border-[var(--fs-primary)] text-[var(--fs-primary)]" : "border-transparent text-[var(--fs-text-secondary)]"}`}
          onClick={() => setTab("updates")}
        >
          {t("installed.updates")} ({updates.length})
        </button>
      </div>

      {/* Category filter */}
      {tab === "all" && (
        <div className="flex gap-2 px-6 pb-2 overflow-x-auto text-sm shrink-0">
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
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-4">
        {tab === "all" ? (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-4xl mb-4">📦</p>
              <p>{t("installed.empty")}</p>
              <p className="text-sm mt-1">{t("installed.empty_desc")}</p>
            </div>
          ) : (
            <ToolGrid plugins={filtered} onOpen={handleOpen} />
          )
        ) : (
          <div className="space-y-2 pt-2">
            {updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <p className="text-sm">{t("installed.no_updates")}</p>
              </div>
            ) : (
              updates.map((u) => (
                <div key={u.uuid} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: "var(--fs-border)" }}>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs" style={{ color: "var(--fs-text-secondary)" }}>{u.currentVersion} → {u.latestVersion}</p>
                  </div>
                  <button
                    className="px-3 py-1 text-xs rounded-full text-white"
                    style={{ background: "var(--fs-primary)" }}
                    onClick={() => handleUpdateOne(u)}
                  >
                    {t("installed.update_btn")}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
