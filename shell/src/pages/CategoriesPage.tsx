import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { apiFetch } from "@/lib/api";
import { AppCard } from "@/components/app/AppCard";
import type { AppSummary } from "@/store/store-store";

interface Category {
  id: string;
  slug: string;
  names: Record<string, string> | null;
  icon: string | null;
  sortOrder?: number;
  appCount?: number;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  tools: "🛠️", games: "🎮", productivity: "📐", design: "🎨",
  education: "📚", security: "🔒", data: "📊", social: "💬",
  media: "🎵", finance: "💰", developer: "👨‍💻", utilities: "⚡",
};

interface CategoryRowData {
  category: Category;
  apps: AppSummary[];
  loading: boolean;
}

export default function CategoriesPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState<string>("__all__");
  const [filterMode, setFilterMode] = useState(false);
  const [rows, setRows] = useState<Map<string, CategoryRowData>>(new Map());
  const [filterApps, setFilterApps] = useState<AppSummary[]>([]);
  const [filterPage, setFilterPage] = useState(1);
  const [filterTotal, setFilterTotal] = useState(0);
  const [filterLoading, setFilterLoading] = useState(false);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    apiFetch<{ list: Category[] }>("/apps/categories")
      .then((res) => {
        setCategories(res.list);
        loadCategoryRows(res.list.slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCategoryRows = useCallback(async (cats: Category[]) => {
    const results = await Promise.all(
      cats.map((cat) =>
        apiFetch<{ list: AppSummary[] }>(`/apps?category=${cat.slug}&pageSize=8&sort=popular`)
          .then((res) => ({ slug: cat.slug, apps: res.list }))
          .catch(() => ({ slug: cat.slug, apps: [] as AppSummary[] }))
      )
    );
    setRows((prev) => {
      const next = new Map(prev);
      for (const r of results) {
        const cat = cats.find((c) => c.slug === r.slug)!;
        next.set(r.slug, { category: cat, apps: r.apps, loading: false });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (categories.length <= 8) return;
    const remaining = categories.slice(8);
    const timeout = setTimeout(() => loadCategoryRows(remaining), 500);
    return () => clearTimeout(timeout);
  }, [categories, loadCategoryRows]);

  const handleChipClick = (slug: string) => {
    if (slug === "__all__") {
      setActiveSlug("__all__");
      setFilterMode(false);
      return;
    }
    setActiveSlug(slug);
    setFilterMode(true);
    setFilterApps([]);
    setFilterPage(1);
    loadFilterApps(slug, 1);
  };

  const loadFilterApps = async (slug: string, page: number) => {
    setFilterLoading(true);
    try {
      const res = await apiFetch<{ list: AppSummary[]; total: number }>(`/apps?category=${slug}&page=${page}&pageSize=20&sort=popular`);
      setFilterApps((prev) => page === 1 ? res.list : [...prev, ...res.list]);
      setFilterTotal(res.total);
      setFilterPage(page);
    } catch { /* ignore */ }
    setFilterLoading(false);
  };

  useEffect(() => {
    if (!filterMode) return;
    const sentinel = document.getElementById("filter-sentinel");
    if (!sentinel) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && filterApps.length < filterTotal && !filterLoading) {
        loadFilterApps(activeSlug, filterPage + 1);
      }
    });
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [filterMode, filterApps.length, filterTotal, filterLoading, activeSlug, filterPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Category Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide sticky top-0 z-10 pt-1" style={{ background: "var(--fs-bg)" }}>
        <ChipButton
          active={activeSlug === "__all__" && !filterMode}
          onClick={() => handleChipClick("__all__")}
          label={t("categories.all")}
        />
        {categories.filter((cat) => {
          const row = rows.get(cat.slug);
          return row && row.apps.length > 0;
        }).map((cat) => (
          <ChipButton
            key={cat.id}
            active={activeSlug === cat.slug}
            onClick={() => handleChipClick(cat.slug)}
            label={cat.names?.[locale] ?? cat.names?.en ?? cat.slug}
            emoji={cat.icon || CATEGORY_EMOJIS[cat.slug] || "📁"}
          />
        ))}
      </div>

      {/* Filter Mode */}
      {filterMode ? (
        <div>
          <h2 className="text-base font-semibold mb-3" style={{ color: "var(--fs-text)" }}>
            {categories.find((c) => c.slug === activeSlug)?.names?.[locale] ?? activeSlug}
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {filterApps.map((app) => (
              <AppCard key={app.uuid} app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
            ))}
          </div>
          {filterLoading && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <div id="filter-sentinel" className="h-4" />
        </div>
      ) : (
        /* All Rows Mode */
        <div className="space-y-6">
          {Array.from(rows.entries()).map(([slug, row]) => {
            if (row.apps.length === 0) return null;
            const displayName = row.category.names?.[locale] ?? row.category.names?.en ?? row.category.slug;
            return (
              <section
                key={slug}
                ref={(el) => { if (el) rowRefs.current.set(slug, el); }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--fs-text)" }}>
                    {row.category.icon || CATEGORY_EMOJIS[slug] || "📁"} {displayName}
                  </h3>
                  <button
                    className="text-[12px] font-medium hover:underline"
                    style={{ color: "var(--fs-primary)" }}
                    onClick={() => navigate(`/category/${slug}`)}
                  >
                    {t("categories.view_all")} →
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                  {row.apps.map((app) => (
                    <div key={app.uuid} className="snap-start shrink-0 w-[140px]">
                      <AppCard app={app} onClick={() => navigate(`/app/${app.uuid}`)} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChipButton({ active, onClick, label, emoji }: { active: boolean; onClick: () => void; label: string; emoji?: string }) {
  return (
    <button
      className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all whitespace-nowrap"
      style={{
        borderColor: active ? "var(--fs-primary)" : "var(--fs-border)",
        background: active ? "var(--fs-primary)" : "transparent",
        color: active ? "#fff" : "var(--fs-text)",
      }}
      onClick={onClick}
    >
      {emoji && <span className="mr-1">{emoji}</span>}
      {label}
    </button>
  );
}
