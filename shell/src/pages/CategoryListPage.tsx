import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { apiFetch } from "@/lib/api";
import { AppCard } from "@/components/app/AppCard";
import type { AppSummary } from "@/store/store-store";

export default function CategoryListPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (p: number) => {
    try {
      const res = await apiFetch<{ list: AppSummary[]; total: number }>(`/apps?category=${slug}&page=${p}&pageSize=20`);
      if (p === 1) setApps(res.list);
      else setApps((prev) => [...prev, ...res.list]);
      setHasMore(res.list.length === 20);
    } catch {}
    setLoading(false);
  }, [slug]);

  useEffect(() => { setApps([]); setPage(1); setLoading(true); fetchPage(1); }, [slug]);

  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setPage((p) => { const next = p + 1; fetchPage(next); return next; });
      }
    }, { threshold: 0.1 });
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, fetchPage]);

  return (
    <div className="p-6">
      <button onClick={() => navigate(-1)} className="text-sm mb-3 flex items-center gap-1" style={{ color: "var(--fs-text-secondary)" }}>
        ← {t("plugin.back")}
      </button>
      <h1 className="text-lg font-semibold mb-4">{slug}</h1>
      {loading && apps.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {apps.map((app) => (
            <AppCard key={app.uuid} app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
          ))}
        </div>
      )}
      {hasMore && <div ref={observerRef} className="h-10" />}
    </div>
  );
}
