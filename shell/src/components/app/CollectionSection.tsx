import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { getServerBase } from "@/lib/api";
import { AppCard } from "@/components/app/AppCard";
import type { AppCollection } from "@/store/store-store";

function resolveImg(url: string | null): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `${getServerBase()}${url}`;
}

function isImageUrl(icon: string | null): boolean {
  if (!icon) return false;
  return icon.startsWith("http") || icon.startsWith("/");
}

function renderIcon(icon: string | null, name: string, _locale: string, size: number) {
  if (icon && isImageUrl(icon)) {
    return <img src={resolveImg(icon)} className={`rounded-lg object-cover`} style={{ width: size, height: size }} alt="" loading="lazy" />;
  }
  if (icon) {
    return (
      <div className="flex items-center justify-center rounded-lg" style={{ width: size, height: size, background: "var(--fs-bg-secondary)" }}>
        <span style={{ fontSize: size * 0.5 }}>{icon}</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-gray-300 flex items-center justify-center font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function SceneCard({ collection }: { collection: AppCollection }) {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const title = collection.titleI18n?.[locale] ?? collection.title;
  const subtitle = collection.subtitleI18n?.[locale] ?? collection.subtitle;
  const apps = collection.items.filter((i) => i.app).map((i) => i.app!);

  return (
    <div
      className="shrink-0 w-[280px] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer"
      style={{ borderColor: "var(--fs-border)", background: "var(--fs-bg-secondary)" }}
    >
      <h4 className="text-[13px] font-semibold truncate" style={{ color: "var(--fs-text)" }}>{title}</h4>
      {subtitle && <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--fs-text-secondary)" }}>{subtitle}</p>}
      <div className="flex gap-2 mt-3">
        {apps.slice(0, 4).map((app) => (
          <button key={app.uuid} className="flex flex-col items-center gap-1" onClick={() => navigate(`/app/${app.uuid}`)}>
            {renderIcon(app.icon, app.names?.[locale] ?? app.name, locale, 40)}
            <span className="text-[10px] w-10 text-center truncate" style={{ color: "var(--fs-text-secondary)" }}>
              {app.names?.[locale] ?? app.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StoryCard({ collection }: { collection: AppCollection }) {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const title = collection.titleI18n?.[locale] ?? collection.title;
  const subtitle = collection.subtitleI18n?.[locale] ?? collection.subtitle;
  const coverSrc = resolveImg(collection.coverImage);
  const apps = collection.items.filter((i) => i.app).map((i) => i.app!);

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer border" style={{ borderColor: "var(--fs-border)" }}>
      {coverSrc ? (
        <div className="relative overflow-hidden" style={{ height: 200 }}>
          <img src={coverSrc} className="w-full h-full object-cover" alt={title} loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <h3 className="text-base font-semibold" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>{title}</h3>
            {subtitle && <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden" style={{ height: 140, background: "linear-gradient(135deg, var(--fs-primary), #667eea)" }}>
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle && <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      )}
      {apps.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--fs-bg-secondary)" }}>
          {apps.slice(0, 4).map((app) => (
            <button key={app.uuid} className="flex items-center gap-2" onClick={() => navigate(`/app/${app.uuid}`)}>
              {renderIcon(app.icon, app.names?.[locale] ?? app.name, locale, 32)}
              <span className="text-[11px] font-medium hidden sm:inline" style={{ color: "var(--fs-text)" }}>
                {app.names?.[locale] ?? app.name}
              </span>
            </button>
          ))}
          {apps.length > 4 && (
            <span className="ml-auto text-[11px]" style={{ color: "var(--fs-primary)" }}>+{apps.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

function CuratedCard({ collection }: { collection: AppCollection }) {
  const { locale, t } = useI18n();
  const title = collection.titleI18n?.[locale] ?? collection.title;
  const coverSrc = resolveImg(collection.coverImage);
  const count = collection.items.filter((i) => i.app).length;

  return (
    <div className="rounded-xl overflow-hidden border hover:shadow-md transition-all group" style={{ borderColor: "var(--fs-border)" }}>
      {coverSrc ? (
        <div className="aspect-[4/3] overflow-hidden">
          <img src={coverSrc} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={title} loading="lazy" />
        </div>
      ) : (
        <div className="aspect-[4/3] flex items-center justify-center" style={{ background: "var(--fs-bg-secondary)" }}>
          <span className="text-3xl">📦</span>
        </div>
      )}
      <div className="p-3">
        <h4 className="text-[13px] font-medium truncate" style={{ color: "var(--fs-text)" }}>{title}</h4>
        <span className="text-[11px]" style={{ color: "var(--fs-text-secondary)" }}>{t("discover.app_count").replace("{{count}}", String(count))}</span>
      </div>
    </div>
  );
}

function DynamicSection({ collection }: { collection: AppCollection }) {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const title = collection.titleI18n?.[locale] ?? collection.title;
  const apps = collection.items.filter((i) => i.app).map((i) => i.app!);

  if (apps.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--fs-text)" }}>{title}</h3>
      {collection.layout === "carousel" ? (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
          {apps.map((app) => (
            <div key={app.uuid} className="snap-start shrink-0 w-[140px]">
              <AppCard app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
            </div>
          ))}
        </div>
      ) : collection.layout === "list" ? (
        <div className="space-y-1">
          {apps.map((app) => (
            <button key={app.uuid} className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-black/[0.03] transition-colors" onClick={() => navigate(`/app/${app.uuid}`)}>
              {renderIcon(app.icon, app.names?.[locale] ?? app.name, locale, 36)}
              <span className="text-[13px] font-medium truncate" style={{ color: "var(--fs-text)" }}>{app.names?.[locale] ?? app.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {apps.map((app) => (
            <AppCard key={app.uuid} app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CollectionSection({ collections }: { collections: AppCollection[] }) {
  const scenes = collections.filter((c) => c.type === "scene");
  const stories = collections.filter((c) => c.type === "story");
  const curated = collections.filter((c) => c.type === "collection");
  const dynamic = collections.filter((c) => c.type === "dynamic");

  return (
    <>
      {/* Editor Stories */}
      {stories.length > 0 && (
        <section>
          <div className="grid gap-4" style={{ gridTemplateColumns: stories.length > 1 ? "repeat(auto-fill, minmax(320px, 1fr))" : "1fr" }}>
            {stories.map((s) => <StoryCard key={s.id} collection={s} />)}
          </div>
        </section>
      )}

      {/* Scene Cards */}
      {scenes.length > 0 && (
        <section>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
            {scenes.map((s) => <SceneCard key={s.id} collection={s} />)}
          </div>
        </section>
      )}

      {/* Curated Collections */}
      {curated.length > 0 && (
        <section>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            {curated.map((c) => (
              <CuratedCard key={c.id} collection={c} />
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Sections */}
      {dynamic.map((d) => <DynamicSection key={d.id} collection={d} />)}
    </>
  );
}
