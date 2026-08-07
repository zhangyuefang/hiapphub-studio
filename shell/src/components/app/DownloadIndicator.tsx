import { useDownloadStore } from "@/store/download-store";
import { useI18n } from "@/i18n";

export function DownloadIndicator() {
  const { t } = useI18n();
  const tasks = useDownloadStore((s) => s.tasks);
  const active = tasks.filter((t) => t.status === "downloading" || t.status === "queued");

  if (active.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border shadow-lg p-3" style={{ background: "var(--fs-bg)", borderColor: "var(--fs-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{t("download.active")}</span>
        <span className="text-[10px]" style={{ color: "var(--fs-text-secondary)" }}>{active.length}</span>
      </div>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {active.slice(0, 3).map((task) => (
          <div key={task.uuid} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] truncate">{task.name}</p>
              <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--fs-border)" }}>
                <div
                  className={`h-full rounded-full transition-all ${task.status === "downloading" ? "animate-pulse" : ""}`}
                  style={{ width: task.status === "downloading" ? "60%" : "0%", background: "var(--fs-primary)" }}
                />
              </div>
            </div>
            <span className="text-[10px] shrink-0" style={{ color: "var(--fs-text-secondary)" }}>
              {task.status === "queued" ? t("detail.queued") : t("download.in_progress")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
