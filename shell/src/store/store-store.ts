import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface AppSummary {
  uuid: string;
  appId: string;
  name: string;
  names: Record<string, string> | null;
  description: string;
  descriptions: Record<string, string> | null;
  category: string;
  icon: string | null;
  downloadCount: number;
  avgRating: number;
  ratingCount: number;
  tags: string[];
  platforms?: string[];
  publishedAt: string | null;
}

interface StoreState {
  featured: AppSummary[];
  popular: AppSummary[];
  newest: AppSummary[];
  discoverLoading: boolean;
  discoverError: string | null;
  discoverFetchedAt: number;

  fetchDiscover: () => Promise<void>;
}

const DISCOVER_TTL = 5 * 60 * 1000;

export const useStoreStore = create<StoreState>((set, get) => ({
  featured: [],
  popular: [],
  newest: [],
  discoverLoading: false,
  discoverError: null,
  discoverFetchedAt: 0,

  fetchDiscover: async () => {
    const now = Date.now();
    if (now - get().discoverFetchedAt < DISCOVER_TTL && get().featured.length > 0) return;

    set({ discoverLoading: true, discoverError: null });
    try {
      const [featuredRes, popularRes, newestRes] = await Promise.all([
        apiFetch<{ list: AppSummary[] }>("/apps/featured"),
        apiFetch<{ list: AppSummary[] }>("/apps?sort=popular&pageSize=6"),
        apiFetch<{ list: AppSummary[] }>("/apps?sort=newest&pageSize=6"),
      ]);
      set({
        featured: featuredRes.list,
        popular: popularRes.list,
        newest: newestRes.list,
        discoverLoading: false,
        discoverFetchedAt: now,
      });
    } catch (e: any) {
      set({ discoverLoading: false, discoverError: e.message || "Failed to load" });
    }
  },
}));
