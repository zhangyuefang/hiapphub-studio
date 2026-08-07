import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/app-store";
import { useDownloadStore } from "@/store/download-store";
import { apiFetch, getWebBase } from "@/lib/api";

interface AppVersion {
  id: string;
  version: string;
  changelog: string | null;
  changelogI18n: Record<string, string> | null;
  hapFileUrl: string | null;
  hapFileSize: number;
  publishedAt: string | null;
  artifacts: { id: string; type: string; platform: string; fileUrl: string; fileSize: number }[];
}

interface AppDetail {
  uuid: string;
  appId: string;
  name: string;
  names: Record<string, string> | null;
  description: string;
  descriptions: Record<string, string> | null;
  introduction: string | null;
  introductions: Record<string, string> | null;
  category: string;
  tags: string[];
  icon: string | null;
  license: string | null;
  homepage: string | null;
  sourceCodeUrl: string | null;
  platforms: string[];
  permissions: string[] | null;
  downloadCount: number;
  avgRating: number;
  ratingCount: number;
  publishedAt: string | null;
  developer: { id: string; name: string; avatar: string | null; verified: boolean };
  versions: AppVersion[];
  screenshots: { id: string; url: string; caption: string | null }[];
  ratings: { id: string; userId: string; rating: number; comment: string | null; createdAt: string }[];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function DetailIcon({ icon, appId, name }: { icon: string | null; appId: string; name: string }) {
  if (icon) {
    const src = icon.startsWith("http") ? icon : `${getWebBase()}${icon}`;
    return <img src={src} className="rounded-2xl object-cover w-16 h-16" alt={name} />;
  }
  const hue = hashCode(appId) % 360;
  return (
    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white" style={{ background: `hsl(${hue}, 55%, 50%)` }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { plugins } = useAppStore();
  const downloadTask = useDownloadStore((s) => s.tasks.find((t) => t.uuid === uuid));
  const enqueue = useDownloadStore((s) => s.enqueue);
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    setLoading(true);
    setError(null);
    apiFetch<{ item: AppDetail }>(`/apps/${uuid}`)
      .then((res) => setApp(res.item))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [uuid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-sm" style={{ color: "var(--fs-text-secondary)" }}>{error || "Not found"}</p>
        <button onClick={() => navigate(-1)} className="mt-3 px-4 py-1.5 text-sm bg-[var(--fs-primary)] text-white rounded-lg">
          {t("plugin.back")}
        </button>
      </div>
    );
  }

  const displayName = app.names?.[locale] ?? app.name;
  const displayDesc = app.descriptions?.[locale] ?? app.description;
  const displayIntro = app.introductions?.[locale] ?? app.introduction ?? displayDesc;
  const latestVersion = app.versions[0];
  const isInstalled = plugins.some((p) => p.manifest.id === app.appId);

  const handleInstall = () => {
    if (isInstalled) { hap.system.openApp(app.appId); return; }
    if (downloadTask && (downloadTask.status === "downloading" || downloadTask.status === "queued")) return;
    if (!latestVersion) return;
    const artifact = latestVersion.artifacts?.find((a) => a.type === "hapk" && a.platform === "cross-platform") || null;
    const fileUrl = artifact?.fileUrl || latestVersion.hapFileUrl || "";
    if (!fileUrl) return;
    enqueue({ uuid: app.uuid, appId: app.appId, name: displayName, version: latestVersion.version, fileUrl, fileSize: artifact?.fileSize || latestVersion.hapFileSize, isUpdate: false });
  };

  const btnLabel = isInstalled ? t("detail.open")
    : downloadTask?.status === "downloading" ? `${downloadTask.progress}%`
    : downloadTask?.status === "queued" ? t("detail.queued")
    : downloadTask?.status === "error" ? t("detail.retry")
    : t("detail.install");

  return (
    <div className="max-w-3xl p-6 space-y-6">
      {/* Back + Header */}
      <button onClick={() => navigate(-1)} className="text-sm flex items-center gap-1" style={{ color: "var(--fs-text-secondary)" }}>
        ← {t("plugin.back")}
      </button>

      {/* App info header */}
      <div className="flex items-start gap-4">
        <DetailIcon icon={app.icon} appId={app.appId} name={displayName} />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1 text-[12px]" style={{ color: "var(--fs-text-secondary)" }}>
            <span className="text-amber-500">★ {app.avgRating > 0 ? app.avgRating.toFixed(1) : "—"}</span>
            <span>·</span>
            <span>{app.ratingCount} {t("rating.count").replace("{{count}}", "")}</span>
            <span>·</span>
            <span>{app.downloadCount >= 1000 ? `${(app.downloadCount / 1000).toFixed(1)}k` : app.downloadCount} ↓</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[12px]" style={{ color: "var(--fs-text-secondary)" }}>
            <span>{app.developer.name}{app.developer.verified ? " ✓" : ""}</span>
            <span>·</span>
            <span>{app.category}</span>
            {latestVersion && <><span>·</span><span>v{latestVersion.version}</span><span>·</span><span>{formatSize(latestVersion.hapFileSize)}</span></>}
          </div>
        </div>
        {/* Install button */}
        <button
          className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
          style={isInstalled
            ? { border: "1.5px solid var(--fs-success)", color: "var(--fs-success)" }
            : downloadTask?.status === "error" ? { background: "var(--fs-error)", color: "#fff" }
            : { background: "var(--fs-primary)", color: "#fff" }
          }
          onClick={downloadTask?.status === "error" ? () => useDownloadStore.getState().retry(app.uuid) : handleInstall}
        >
          {btnLabel}
        </button>
      </div>

      {/* Screenshots */}
      {app.screenshots.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">{t("detail.screenshots")}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {app.screenshots.map((s) => (
              <img
                key={s.id}
                src={s.url.startsWith("http") ? s.url : `${getWebBase()}${s.url}`}
                className="h-40 rounded-lg object-cover shrink-0"
                alt={s.caption || ""}
                loading="lazy"
              />
            ))}
          </div>
        </section>
      )}

      {/* Introduction */}
      <section>
        <h2 className="text-sm font-semibold mb-2">{t("detail.introduction")}</h2>
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fs-text-secondary)" }}>
          {displayIntro}
        </p>
      </section>

      {/* Version history */}
      {app.versions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">{t("detail.changelog")}</h2>
          <div className="space-y-3">
            {app.versions.slice(0, 3).map((v) => (
              <div key={v.id} className="text-[12px]">
                <div className="font-medium">v{v.version} · {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : ""}</div>
                <p className="mt-0.5" style={{ color: "var(--fs-text-secondary)" }}>
                  {(v.changelogI18n?.[locale] ?? v.changelog) || "—"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ratings */}
      {app.ratings.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">{t("rating.title")}</h2>
          <div className="space-y-3">
            {app.ratings.slice(0, 5).map((r) => (
              <div key={r.id} className="text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span style={{ color: "var(--fs-text-secondary)" }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="mt-0.5" style={{ color: "var(--fs-text-secondary)" }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* App info */}
      <section>
        <h2 className="text-sm font-semibold mb-2">{t("detail.app_info")}</h2>
        <div className="grid grid-cols-2 gap-2 text-[12px]" style={{ color: "var(--fs-text-secondary)" }}>
          {app.permissions && app.permissions.length > 0 && (
            <div><span className="font-medium" style={{ color: "var(--fs-text)" }}>{t("detail.permissions")}:</span> {app.permissions.join(", ")}</div>
          )}
          {app.license && <div><span className="font-medium" style={{ color: "var(--fs-text)" }}>{t("detail.license")}:</span> {app.license}</div>}
          {app.homepage && (
            <div><span className="font-medium" style={{ color: "var(--fs-text)" }}>{t("detail.homepage")}:</span> <a href={app.homepage} target="_blank" rel="noreferrer" className="text-[var(--fs-primary)]">{app.homepage}</a></div>
          )}
          {app.sourceCodeUrl && (
            <div><span className="font-medium" style={{ color: "var(--fs-text)" }}>{t("detail.source_code")}:</span> <a href={app.sourceCodeUrl} target="_blank" rel="noreferrer" className="text-[var(--fs-primary)]">{app.sourceCodeUrl}</a></div>
          )}
        </div>
      </section>
    </div>
  );
}
