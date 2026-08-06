import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/app-store";
import { getWebBase } from "@/lib/api";
import type { AppSummary } from "@/store/store-store";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function AppIcon({ icon, appId, name, size = 48 }: { icon: string | null; appId: string; name: string; size?: number }) {
  if (icon) {
    const src = icon.startsWith("http") ? icon : `${getWebBase()}${icon}`;
    return <img src={src} className="rounded-xl object-cover" style={{ width: size, height: size }} alt={name} loading="lazy" />;
  }
  const hue = hashCode(appId) % 360;
  return (
    <div className="flex items-center justify-center text-lg font-bold text-white rounded-xl" style={{ width: size, height: size, background: `hsl(${hue}, 55%, 50%)` }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

interface AppCardProps {
  app: AppSummary;
  onClick?: () => void;
}

export function AppCard({ app, onClick }: AppCardProps) {
  const { locale } = useI18n();
  const { theme } = useAppStore();
  const displayName = app.names?.[locale] ?? app.name;
  const displayDesc = app.descriptions?.[locale] ?? app.description;

  return (
    <button
      className="flex flex-col items-center p-3 rounded-xl border transition-all duration-150 hover:shadow-md cursor-pointer text-left group"
      style={{ borderColor: "var(--fs-border)", background: theme === "dark" ? "var(--fs-bg-secondary)" : "#fff" }}
      onClick={onClick}
    >
      <AppIcon icon={app.icon} appId={app.appId} name={displayName} size={48} />
      <span className="mt-2 text-[13px] font-medium text-center line-clamp-2 w-full leading-tight" style={{ color: "var(--fs-text)" }}>
        {displayName}
      </span>
      <span className="mt-0.5 text-[11px] text-center line-clamp-1 w-full" style={{ color: "var(--fs-text-secondary)" }}>
        {displayDesc}
      </span>
      <div className="flex items-center gap-1 mt-1.5 text-[11px]" style={{ color: "var(--fs-text-secondary)" }}>
        <span className="text-amber-500">★</span>
        <span>{app.avgRating > 0 ? app.avgRating.toFixed(1) : "—"}</span>
      </div>
    </button>
  );
}

interface AppListItemProps {
  app: AppSummary;
  rank?: number;
  onClick?: () => void;
}

export function AppListItem({ app, rank, onClick }: AppListItemProps) {
  const { locale } = useI18n();
  const displayName = app.names?.[locale] ?? app.name;
  const displayDesc = app.descriptions?.[locale] ?? app.description;

  const rankStyle = rank && rank <= 3
    ? "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white " +
      (rank === 1 ? "bg-amber-400" : rank === 2 ? "bg-gray-400" : "bg-amber-700")
    : "";

  return (
    <button
      className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
      onClick={onClick}
    >
      {rank != null && (
        rankStyle
          ? <span className={rankStyle}>{rank}</span>
          : <span className="w-6 text-center text-[12px] font-medium" style={{ color: "var(--fs-text-secondary)" }}>{rank}</span>
      )}
      <AppIcon icon={app.icon} appId={app.appId} name={displayName} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate" style={{ color: "var(--fs-text)" }}>{displayName}</div>
        <div className="text-[11px] truncate" style={{ color: "var(--fs-text-secondary)" }}>{displayDesc}</div>
      </div>
      <div className="flex flex-col items-end shrink-0 text-[11px]" style={{ color: "var(--fs-text-secondary)" }}>
        <div className="flex items-center gap-0.5">
          <span className="text-amber-500">★</span>
          <span>{app.avgRating > 0 ? app.avgRating.toFixed(1) : "—"}</span>
        </div>
        {app.downloadCount > 0 && (
          <span>{app.downloadCount >= 1000 ? `${(app.downloadCount / 1000).toFixed(1)}k` : app.downloadCount}</span>
        )}
      </div>
    </button>
  );
}
