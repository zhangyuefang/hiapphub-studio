const API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:3102/api"
  : "https://hiapphub.com/api";

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("shell_refreshToken");
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newRefresh = data.refreshToken || refreshToken;
    localStorage.setItem("shell_token", data.accessToken);
    localStorage.setItem("shell_refreshToken", newRefresh);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const userStr = localStorage.getItem("shell_user");
      const user = userStr ? JSON.parse(userStr) : { id: "", username: null, email: null, name: null };
      await invoke("store_auth_data", { data: JSON.stringify({ accessToken: data.accessToken, refreshToken: newRefresh, user }) });
    } catch { /* Tauri not available */ }
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("shell_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && localStorage.getItem("shell_refreshToken")) {
    if (!refreshPromise) refreshPromise = tryRefreshToken();
    const newToken = await refreshPromise;
    refreshPromise = null;
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("shell_token");
      localStorage.removeItem("shell_refreshToken");
      localStorage.removeItem("shell_user");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export function getApiBase() {
  return API_BASE;
}

export function getWebBase() {
  return import.meta.env.DEV
    ? "http://127.0.0.1:5500"
    : "https://hiapphub.com";
}
