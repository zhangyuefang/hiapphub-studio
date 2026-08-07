import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { apiFetch } from "@/lib/api";

interface Category {
  id: string;
  slug: string;
  name: string;
  nameI18n: Record<string, string> | null;
  icon: string | null;
  appCount?: number;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  tools: "🛠️", games: "🎮", productivity: "📐", design: "🎨",
  education: "📚", security: "🔒", data: "📊", social: "💬",
  media: "🎵", finance: "💰", developer: "👨‍💻", utilities: "⚡",
};

export default function CategoriesPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ list: Category[] }>("/apps/categories")
      .then((res) => setCategories(res.list))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-[var(--fs-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-4">{t("nav.categories")}</h1>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        {categories.map((cat) => {
          const displayName = cat.nameI18n?.[locale] ?? cat.name;
          const emoji = CATEGORY_EMOJIS[cat.slug] || "📁";
          return (
            <button
              key={cat.id}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border hover:shadow-md transition-all cursor-pointer"
              style={{ borderColor: "var(--fs-border)" }}
              onClick={() => navigate(`/category/${cat.slug}`)}
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-[13px] font-medium text-center">{displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
