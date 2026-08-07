import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { apiFetch } from "@/lib/api";
import { AppListItem } from "@/components/app/AppCard";
import type { AppSummary } from "@/store/store-store";

export default function SearchPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ list: AppSummary[]; total: number }>(`/apps?search=${encodeURIComponent(q)}&sort=popular&page=${p}&pageSize=20`);
      if (p === 1) { setApps(res.list); setTotal(res.total); }
      else setApps((prev) => [...prev, ...res.list]);
      setHasMore(res.list.length === 20);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { setApps([]); setPage(1); setTotal(0); fetchPage(query, 1); }, [query]);

  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setPage((p) => { const next = p + 1; fetchPage(query, next); return next; });
      }
    }, { threshold: 0.1 });
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, query, fetchPage]);

  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-64" style={{ color: "var(--fs-text-secondary)" }}>
        <p className="text-sm">{t("search.placeholder")}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-base font-semibold mb-4">
        "{query}" — {total} {t("search.results_count").replace("{{count}}", String(total))}
      </h1>

      {loading && apps.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40" style={{ color: "var(--fs-text-secondary)" }}>
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm">{t("search.no_results")}</p>
          <p className="text-xs mt-1">{t("search.no_results_tip")}</p>
        </div>
      ) : (
        <div className="space-y-0">
          {apps.map((app) => (
            <AppListItem key={app.uuid} app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
          ))}
        </div>
      )}
      {hasMore && <div ref={observerRef} className="h-10" />}
    </div>
  );
}
