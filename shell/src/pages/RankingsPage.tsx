import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { apiFetch } from "@/lib/api";
import { AppListItem } from "@/components/app/AppCard";
import type { AppSummary } from "@/store/store-store";

type SortType = "popular" | "rating" | "newest";

export default function RankingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortType>("popular");
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (s: SortType, p: number) => {
    try {
      const res = await apiFetch<{ list: AppSummary[] }>(`/apps?sort=${s}&page=${p}&pageSize=20`);
      if (p === 1) setApps(res.list);
      else setApps((prev) => [...prev, ...res.list]);
      setHasMore(res.list.length === 20);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { setApps([]); setPage(1); setLoading(true); fetchPage(sort, 1); }, [sort]);

  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setPage((p) => { const next = p + 1; fetchPage(sort, next); return next; });
      }
    }, { threshold: 0.1 });
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, sort, fetchPage]);

  const tabs: { key: SortType; label: string }[] = [
    { key: "popular", label: t("rankings.download") },
    { key: "rating", label: t("rankings.rating") },
    { key: "newest", label: t("rankings.new") },
  ];

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-4">{t("nav.rankings")}</h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-4 border-b" style={{ borderColor: "var(--fs-border)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`text-sm font-medium pb-2 border-b-2 transition-colors ${sort === tab.key ? "border-[var(--fs-primary)] text-[var(--fs-primary)]" : "border-transparent text-[var(--fs-text-secondary)]"}`}
            onClick={() => setSort(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && apps.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-0">
          {apps.map((app, i) => (
            <AppListItem key={app.uuid} app={app} rank={i + 1} onClick={() => navigate(`/app/${app.uuid}`)} />
          ))}
        </div>
      )}
      {hasMore && <div ref={observerRef} className="h-10" />}
    </div>
  );
}
