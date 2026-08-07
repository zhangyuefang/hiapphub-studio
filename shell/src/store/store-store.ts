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

export interface UpdateInfo {
  appId: string;
  uuid: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  fileUrl: string;
  fileSize: number;
}

export interface BannerItem {
  id: string;
  title: string;
  titleI18n: Record<string, string> | null;
  subtitle: string | null;
  subtitleI18n: Record<string, string> | null;
  imageUrl: string;
  linkType: string;
  linkTarget: string;
}

export interface CollectionItem {
  id: string;
  appUuid: string;
  sortOrder: number;
  app: AppSummary | null;
}

export interface AppCollection {
  id: string;
  type: string;
  title: string;
  titleI18n: Record<string, string> | null;
  subtitle: string | null;
  subtitleI18n: Record<string, string> | null;
  coverImage: string | null;
  description: string | null;
  descI18n: Record<string, string> | null;
  layout: string;
  items: CollectionItem[];
}

interface StoreState {
  featured: AppSummary[];
  popular: AppSummary[];
  newest: AppSummary[];
  banners: BannerItem[];
  collections: AppCollection[];
  discoverLoading: boolean;
  discoverError: string | null;
  discoverFetchedAt: number;

  updates: UpdateInfo[];
  updatesCheckedAt: number;

  fetchDiscover: () => Promise<void>;
  checkUpdates: (installed: { appId: string; version: string }[]) => Promise<void>;
}

const DISCOVER_TTL = 5 * 60 * 1000;

export const useStoreStore = create<StoreState>((set, get) => ({
  featured: [],
  popular: [],
  newest: [],
  banners: [],
  collections: [],
  discoverLoading: false,
  discoverError: null,
  discoverFetchedAt: 0,

  updates: [],
  updatesCheckedAt: 0,

  fetchDiscover: async () => {
    const now = Date.now();
    if (now - get().discoverFetchedAt < DISCOVER_TTL && get().featured.length > 0) return;

    set({ discoverLoading: true, discoverError: null });
    try {
      const [featuredRes, popularRes, newestRes, bannersRes, collectionsRes] = await Promise.all([
        apiFetch<{ list: AppSummary[] }>("/apps/featured"),
        apiFetch<{ list: AppSummary[] }>("/apps?sort=popular&pageSize=6"),
        apiFetch<{ list: AppSummary[] }>("/apps?sort=newest&pageSize=6"),
        apiFetch<{ list: BannerItem[] }>("/apps/banners").catch(() => ({ list: [] as BannerItem[] })),
        apiFetch<{ list: AppCollection[] }>("/apps/collections").catch(() => ({ list: [] as AppCollection[] })),
      ]);
      set({
        featured: featuredRes.list,
        popular: popularRes.list,
        newest: newestRes.list,
        banners: bannersRes.list,
        collections: collectionsRes.list,
        discoverLoading: false,
        discoverFetchedAt: now,
      });
    } catch (e: any) {
      set({ discoverLoading: false, discoverError: e.message || "Failed to load" });
    }
  },

  checkUpdates: async (installed) => {
    if (installed.length === 0) { set({ updates: [] }); return; }
    const now = Date.now();
    if (now - get().updatesCheckedAt < DISCOVER_TTL && get().updatesCheckedAt > 0) return;
    try {
      const res = await apiFetch<{ updates: UpdateInfo[] }>("/apps/check-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apps: installed }),
      });
      set({ updates: res.updates || [], updatesCheckedAt: now });
    } catch {
      set({ updates: [] });
    }
  },
}));
