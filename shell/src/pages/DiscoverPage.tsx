import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { useStoreStore } from "@/store/store-store";
import { AppCard, AppListItem } from "@/components/app/AppCard";
import { BannerCarousel } from "@/components/app/BannerCarousel";

export default function DiscoverPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { featured, popular, newest, banners, discoverLoading, discoverError, fetchDiscover } = useStoreStore();

  useEffect(() => { fetchDiscover(); }, []);

  if (discoverLoading && featured.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (discoverError && featured.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-sm" style={{ color: "var(--fs-text-secondary)" }}>{discoverError}</p>
        <button onClick={fetchDiscover} className="mt-3 px-4 py-1.5 text-sm bg-[var(--fs-primary)] text-white rounded-lg">
          {t("error.network_retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      {/* Banners */}
      {banners.length > 0 && <BannerCarousel banners={banners} />}

      {/* Featured */}
      {featured.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">{t("discover.featured")}</h2>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {featured.slice(0, 12).map((app) => (
              <AppCard key={app.uuid} app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Popular */}
      {popular.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">{t("discover.popular")}</h2>
            <button onClick={() => navigate("/rankings")} className="text-xs text-[var(--fs-primary)]">
              {t("discover.view_more")} →
            </button>
          </div>
          <div className="rounded-xl border" style={{ borderColor: "var(--fs-border)" }}>
            {popular.map((app, i) => (
              <div key={app.uuid} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--fs-border)" }}>
                <AppListItem app={app} rank={i + 1} onClick={() => navigate(`/app/${app.uuid}`)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Newest */}
      {newest.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">{t("discover.newest")}</h2>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {newest.map((app) => (
              <AppCard key={app.uuid} app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
