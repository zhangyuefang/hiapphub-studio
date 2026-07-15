import type { PluginRecord } from "../types";
import { useI18n } from "../i18n";
import { useAppStore } from "../store/app-store";

const ICONS: Record<string, string> = {
  braces: "{ }",
  calculator: "🧮",
  lock: "🔐",
  palette: "🎨",
  file: "📄",
  image: "🖼️",
  music: "🎵",
  video: "🎬",
  globe: "🌐",
  database: "🗃️",
  terminal: "⌨️",
  chart: "📊",
  mail: "📧",
  calendar: "📅",
  clock: "⏰",
  book: "📖",
};

function getIcon(icon?: string): string {
  return icon ? (ICONS[icon] ?? "📦") : "📦";
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  plugins: PluginRecord[];
  onOpen: (id: string) => void;
}

export function ToolGrid({ plugins, onOpen }: Props) {
  const { locale } = useI18n();
  const { theme } = useAppStore();
  const isDark = theme === "dark";

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
      {plugins.map((p) => {
        const displayName = p.manifest.names?.[locale] ?? p.manifest.name;
        const displayDesc = p.manifest.descriptions?.[locale] ?? p.manifest.description;
        const hue = hashCode(p.manifest.id) % 360;
        return (
          <button
            key={p.manifest.id}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all duration-150 cursor-pointer group"
            onClick={() => onOpen(p.manifest.id)}
            title={displayDesc}
          >
            <div
              className="w-12 h-12 rounded-[14px] flex items-center justify-center text-xl transition-shadow group-hover:shadow-md"
              style={{
                background: isDark
                  ? `hsl(${hue}, 40%, 25%)`
                  : `hsl(${hue}, 60%, 92%)`,
                boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {getIcon(p.manifest.icon)}
            </div>
            <span
              className="text-[11px] text-center leading-tight line-clamp-2 w-full"
              style={{ color: "var(--fs-text)", opacity: 0.75 }}
            >
              {displayName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
