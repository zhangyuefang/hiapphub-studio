import { useState, useEffect } from "react";
import { useI18n } from "@/i18n";
import { apiFetch } from "@/lib/api";

interface Rating {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user?: { id: string; name: string | null; username: string | null };
  userId?: string;
}

interface RatingSectionProps {
  appUuid: string;
  initialRatings: Rating[];
  avgRating: number;
  ratingCount: number;
}

export function RatingSection({ appUuid, initialRatings, avgRating, ratingCount }: RatingSectionProps) {
  const { t } = useI18n();
  const [ratings, setRatings] = useState<Rating[]>(initialRatings);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(ratingCount > initialRatings.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isLoggedIn = !!localStorage.getItem("shell_token");

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await apiFetch<{ list: Rating[]; total: number }>(`/apps/${appUuid}/ratings?page=${nextPage}&pageSize=10`);
      setRatings((prev) => [...prev, ...res.list]);
      setPage(nextPage);
      setHasMore(ratings.length + res.list.length < res.total);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  const handleSubmit = async () => {
    if (myRating === 0) return;
    setSubmitting(true);
    try {
      await apiFetch(`/apps/${appUuid}/ratings`, {
        method: "POST",
        body: JSON.stringify({ rating: myRating, comment: myComment || undefined }),
      });
      setSubmitted(true);
      setShowForm(false);
      const res = await apiFetch<{ list: Rating[] }>(`/apps/${appUuid}/ratings?page=1&pageSize=10`);
      setRatings(res.list);
      setPage(1);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  useEffect(() => { setRatings(initialRatings); }, [initialRatings]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{t("rating.title")}</h2>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--fs-text-secondary)" }}>
          <span className="text-amber-500">★ {avgRating > 0 ? avgRating.toFixed(1) : "—"}</span>
          <span>{t("rating.count").replace("{{count}}", String(ratingCount))}</span>
        </div>
      </div>

      {/* Write Review */}
      {isLoggedIn && !submitted && !showForm && (
        <button
          className="text-[12px] mb-3 px-3 py-1 rounded-full border"
          style={{ borderColor: "var(--fs-primary)", color: "var(--fs-primary)" }}
          onClick={() => setShowForm(true)}
        >
          {t("rating.write")}
        </button>
      )}

      {showForm && (
        <div className="mb-4 p-3 rounded-lg border space-y-2" style={{ borderColor: "var(--fs-border)" }}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="text-xl transition-transform hover:scale-110"
                onClick={() => setMyRating(n)}
              >
                {n <= myRating ? "★" : "☆"}
              </button>
            ))}
          </div>
          <textarea
            className="w-full text-[12px] p-2 rounded border resize-none"
            style={{ borderColor: "var(--fs-border)", background: "var(--fs-bg-secondary)" }}
            rows={3}
            placeholder={t("rating.comment_placeholder")}
            value={myComment}
            onChange={(e) => setMyComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="text-[12px] px-3 py-1 rounded-full font-medium"
              style={{ background: myRating > 0 ? "var(--fs-primary)" : "var(--fs-border)", color: myRating > 0 ? "#fff" : "var(--fs-text-secondary)" }}
              disabled={myRating === 0 || submitting}
              onClick={handleSubmit}
            >
              {t("rating.submit")}
            </button>
            <button
              className="text-[12px] px-3 py-1 rounded-full"
              style={{ color: "var(--fs-text-secondary)" }}
              onClick={() => setShowForm(false)}
            >
              {t("rating.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Ratings List */}
      {ratings.length > 0 ? (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="text-[12px]">
              <div className="flex items-center gap-2">
                <span className="font-medium" style={{ color: "var(--fs-text)" }}>{r.user?.name || r.user?.username || "User"}</span>
                <span className="text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span style={{ color: "var(--fs-text-secondary)" }}>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {r.comment && <p className="mt-0.5" style={{ color: "var(--fs-text-secondary)" }}>{r.comment}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--fs-text-secondary)" }}>{t("rating.empty")}</p>
      )}

      {/* Load More */}
      {hasMore && (
        <button
          className="mt-3 text-[12px] font-medium"
          style={{ color: "var(--fs-primary)" }}
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "..." : t("rating.load_more")}
        </button>
      )}
    </section>
  );
}
