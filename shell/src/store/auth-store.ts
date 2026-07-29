import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface OAuthAccount {
  id: string;
  provider: string;
  createdAt: string;
}

export interface UserInfo {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  githubUsername: string | null;
  emailVerified: boolean;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  oauthAccounts?: OAuthAccount[];
}

interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: Pick<UserInfo, "id" | "username" | "email" | "name">;
}

async function saveAuthData(data: AuthData) {
  localStorage.setItem("shell_token", data.accessToken);
  localStorage.setItem("shell_refreshToken", data.refreshToken);
  try {
    await hap.system.storeAuth(JSON.stringify(data));
  } catch { /* Bridge not available */ }
}

async function loadAuthData(): Promise<AuthData | null> {
  try {
    const raw = await hap.system.loadAuth();
    if (raw) {
      const data = JSON.parse(raw) as AuthData;
      localStorage.setItem("shell_token", data.accessToken);
      localStorage.setItem("shell_refreshToken", data.refreshToken);
      return data;
    }
  } catch { /* fallback to localStorage */ }
  const token = localStorage.getItem("shell_token");
  const refresh = localStorage.getItem("shell_refreshToken");
  const userStr = localStorage.getItem("shell_user");
  if (token && refresh && userStr) {
    try {
      return { accessToken: token, refreshToken: refresh, user: JSON.parse(userStr) };
    } catch { /* ignore */ }
  }
  return null;
}

async function clearAuthData() {
  localStorage.removeItem("shell_token");
  localStorage.removeItem("shell_refreshToken");
  localStorage.removeItem("shell_user");
  try {
    await hap.system.clearAuth();
  } catch { /* ignore */ }
}

export interface AuthState {
  user: UserInfo | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;

  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  loadFromStorage: () => void;
  clearError: () => void;
  updateProfile: (data: { name?: string; avatar?: string; bio?: string; phone?: string; website?: string; githubUsername?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoggedIn: false,
  isLoading: false,
  error: null,

  loginWithTokens: async (accessToken, refreshToken) => {
    set({ isLoading: true, error: null });
    try {
      await saveAuthData({ accessToken, refreshToken, user: { id: "", username: null, email: null, name: null } });
      set({ isLoggedIn: true, isLoading: false });
      await get().fetchProfile();
    } catch (e: any) {
      set({ isLoading: false, error: e.message || "Login failed" });
      throw e;
    }
  },

  logout: () => {
    clearAuthData();
    set({ user: null, isLoggedIn: false, error: null });
  },

  fetchProfile: async () => {
    try {
      const profile = await apiFetch<UserInfo>("/user/profile");
      localStorage.setItem("shell_user", JSON.stringify(profile));
      set({ user: profile, isLoggedIn: true });
    } catch {
      set({ user: null, isLoggedIn: false });
      clearAuthData();
    }
  },

  loadFromStorage: () => {
    loadAuthData().then((data) => {
      if (data) {
        set({ user: data.user as any, isLoggedIn: true });
      }
    });
  },

  clearError: () => set({ error: null }),

  updateProfile: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiFetch<{ user: UserInfo }>("/user/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      const current = get().user;
      if (current) {
        const updated = { ...current, ...res.user };
        set({ user: updated, isLoading: false });
        localStorage.setItem("shell_user", JSON.stringify(updated));
      }
    } catch (e: any) {
      set({ isLoading: false, error: e.message || "Update failed" });
      throw e;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      await apiFetch("/user/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      set({ isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message || "Password change failed" });
      throw e;
    }
  },
}));
