import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore, type UserInfo } from "@/store/auth-store";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/app-store";
import { apiFetch, getApiBase, getWebBase } from "@/lib/api";

interface LoginHistory {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function AccountPanel() {
  const { t } = useI18n();
  const { theme } = useAppStore();
  const { user, isLoggedIn, isLoading, error, logout, clearError, loadFromStorage, fetchProfile } =
    useAuthStore();
  const [showDeviceFlow, setShowDeviceFlow] = useState(false);

  useEffect(() => { loadFromStorage(); }, []);
  useEffect(() => { if (isLoggedIn) { fetchProfile(); setShowDeviceFlow(false); } }, [isLoggedIn]);

  if (isLoggedIn && user) {
    return <ProfileView user={user} theme={theme} t={t} onLogout={logout} />;
  }

  if (isLoggedIn && !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showDeviceFlow) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <DeviceFlowPanel t={t} theme={theme} onBack={() => setShowDeviceFlow(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="inline-flex w-20 h-20 bg-blue-500/10 rounded-3xl items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold tracking-tight">{t("account.login_title")}</h3>
          <p className="text-xs opacity-50 mt-2 leading-relaxed">{t("account.login_desc")}</p>
        </div>
        <button onClick={() => setShowDeviceFlow(true)}
          className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
          {t("account.login_btn")}
        </button>
        <a href={`${getWebBase()}/register`} target="_blank" rel="noreferrer" className="inline-block text-xs opacity-40 hover:opacity-70 transition-opacity">
          {t("account.no_account")}
        </a>
      </div>
    </div>
  );
}

function DeviceFlowPanel({ t, theme, onBack }: {
  t: (k: string) => string; theme: string; onBack: () => void;
}) {
  const [step, setStep] = useState<"init" | "pending" | "done" | "error">("init");
  const [userCode, setUserCode] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceCodeRef = useRef("");
  const { loginWithTokens } = useAuthStore();

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startFlow = useCallback(async () => {
    setStep("pending");
    setError("");
    try {
      const res = await apiFetch<{ deviceCode: string; userCode: string; expiresIn: number; interval: number }>("/auth/device/code", { method: "POST" });
      setUserCode(res.userCode);
      deviceCodeRef.current = res.deviceCode;
      const intervalMs = Math.max(res.interval * 1000, 3000);

      pollRef.current = setInterval(async () => {
        try {
          const tokenRes = await fetch(`${getApiBase()}/auth/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceCode: deviceCodeRef.current }),
          });
          if (tokenRes.status === 428) return;
          if (tokenRes.status === 410) { cleanup(); setStep("error"); setError(t("account.device_expired")); return; }
          if (tokenRes.ok) {
            cleanup();
            const data = await tokenRes.json();
            setStep("done");
            await loginWithTokens(data.accessToken, data.refreshToken);
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const win = getCurrentWindow();
              await win.setFocus();
            } catch { /* non-Tauri env */ }
          }
        } catch { /* retry next interval */ }
      }, intervalMs);
    } catch (e: any) {
      setStep("error");
      setError(e.message || t("account.device_error"));
    }
  }, [t, cleanup, loginWithTokens]);

  useEffect(() => { startFlow(); }, []);

  const webUrl = `${getWebBase()}/device-auth?code=${userCode}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={() => { cleanup(); onBack(); }} className="opacity-50 hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3 className="text-sm font-semibold">{t("account.device_title")}</h3>
      </div>
      <div className="text-center mb-4">
        <div className="inline-flex w-16 h-16 bg-blue-500/10 rounded-2xl items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <p className="text-xs opacity-50 mt-1">{t("account.device_desc")}</p>
      </div>

      {step === "pending" && userCode && (
        <div className="text-center space-y-5">
          <p className="text-xs opacity-60">{t("account.device_enter_code")}</p>
          <div className={`text-3xl font-mono font-black tracking-[0.3em] py-5 px-8 rounded-2xl border-2 border-dashed ${
            theme === "dark" ? "border-[#555] bg-[#2a2a3e]" : "border-gray-300 bg-gray-50"
          }`}>
            {userCode}
          </div>
          <p className="text-xs opacity-40 leading-relaxed">{t("account.device_instructions")}</p>
          <a href={webUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 font-medium transition-colors">
            {t("account.device_open_web")}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <div className="flex items-center justify-center gap-2 text-xs opacity-40 pt-2">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {t("account.device_waiting")}
          </div>
        </div>
      )}

      {step === "init" && (
        <div className="py-8 text-center">
          <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {step === "error" && (
        <div className="text-center space-y-4 py-4">
          <div className="inline-flex w-14 h-14 bg-red-500/10 rounded-full items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={() => { cleanup(); startFlow(); }} className="text-xs text-blue-500 hover:underline font-medium">{t("account.device_retry")}</button>
        </div>
      )}

    </div>
  );
}

function ProfileView({ user, theme, t, onLogout }: {
  user: UserInfo; theme: string; t: (k: string) => string; onLogout: () => void;
}) {
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [pwdMode, setPwdMode] = useState(false);

  useEffect(() => {
    apiFetch<{ list: LoginHistory[] }>("/user/login-history")
      .catch(() => ({ list: [] }))
      .then((h) => setLoginHistory(h.list?.slice(0, 5) ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (editMode) return <ProfileEditForm user={user} theme={theme} t={t} onBack={() => setEditMode(false)} />;
  if (pwdMode) return <PasswordChangeForm theme={theme} t={t} onBack={() => setPwdMode(false)} />;

  const avatarFallback = (user.name || user.username || "U").charAt(0).toUpperCase();
  const cardBg = theme === "dark" ? "bg-[#2a2a3e]" : "bg-gray-50";
  const cardBorder = theme === "dark" ? "border-[#444]" : "border-gray-200";

  return (
    <div className="space-y-5 px-1">
      <div className="flex items-center gap-4">
        {user.avatar ? (
          <img src={user.avatar} alt="" className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold">{avatarFallback}</div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold truncate">{user.name || user.username}</h3>
          <p className="text-xs opacity-50 truncate">{user.email || user.username}</p>
          {user.bio && <p className="text-xs opacity-40 mt-0.5 truncate">{user.bio}</p>}
        </div>
        <button onClick={onLogout} className="shrink-0 px-3 py-1.5 text-xs rounded-lg border transition-colors hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500" style={{ borderColor: "var(--fs-border)" }}>
          {t("account.logout")}
        </button>
      </div>

      <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium opacity-50">{t("account.info")}</h4>
          <div className="flex gap-2">
            <button onClick={() => setEditMode(true)} className="text-[10px] text-blue-500 hover:underline">{t("account.edit_profile")}</button>
            <button onClick={() => setPwdMode(true)} className="text-[10px] text-blue-500 hover:underline">{t("account.change_pwd")}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <InfoItem label={t("account.field_username")} value={user.username || "-"} />
          <InfoItem label={t("account.field_email")} value={user.email || "-"} verified={user.email ? user.emailVerified : undefined} t={t} />
          <InfoItem label={t("account.field_status")} value={t(`account.status_${user.status}`)} />
          <InfoItem label={t("account.field_joined")} value={formatDate(user.createdAt)} />
          {user.lastLoginAt && <InfoItem label={t("account.field_last_login")} value={formatDate(user.lastLoginAt)} />}
          {user.website && <InfoItem label={t("account.field_website")} value={user.website} link />}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center"><div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : loginHistory.length > 0 && (
        <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`}>
          <h4 className="text-xs font-medium opacity-50 mb-2">{t("account.login_history")}</h4>
          <div className="space-y-2">
            {loginHistory.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-xs">
                <span className="opacity-60">{h.ip || "-"}</span>
                <span className="opacity-40">{formatDateTime(h.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center pt-2">
        <a href={`${getWebBase()}/account`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
          {t("account.go_website")} →
        </a>
      </div>
    </div>
  );
}

function ProfileEditForm({ user, theme, t, onBack }: {
  user: UserInfo; theme: string; t: (k: string) => string; onBack: () => void;
}) {
  const { updateProfile, fetchProfile, isLoading, error, clearError } = useAuthStore();
  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [success, setSuccess] = useState(false);

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-blue-500 ${
    theme === "dark" ? "bg-[#2a2a3e] border-[#444] text-white" : "bg-white border-gray-300 text-gray-900"
  }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ name: name.trim(), bio: bio.trim(), avatar: avatar.trim() || undefined });
      await fetchProfile();
      setSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch { /* store handles error */ }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => { clearError(); onBack(); }} className="opacity-50 hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3 className="text-sm font-semibold">{t("account.edit_profile")}</h3>
      </div>
      <ErrorBanner error={error} onClear={clearError} />
      {success && <div className="px-3 py-2 rounded-lg bg-green-500/10 text-green-500 text-xs">{t("account.save_success")}</div>}
      <div><label className="text-xs opacity-50 mb-1 block">{t("account.field_name")}</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="text-xs opacity-50 mb-1 block">{t("account.field_bio")}</label><textarea className={`${inputCls} resize-none`} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={256} /></div>
      <div><label className="text-xs opacity-50 mb-1 block">{t("account.field_avatar_url")}</label><input className={inputCls} value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." /></div>
      <button type="submit" disabled={isLoading || !name.trim()} className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {isLoading ? "..." : t("account.save")}
      </button>
    </form>
  );
}

function PasswordChangeForm({ theme, t, onBack }: {
  theme: string; t: (k: string) => string; onBack: () => void;
}) {
  const { changePassword, isLoading, error, clearError } = useAuthStore();
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState(false);

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-blue-500 ${
    theme === "dark" ? "bg-[#2a2a3e] border-[#444] text-white" : "bg-white border-gray-300 text-gray-900"
  }`;
  const mismatch = confirm && newPwd !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !newPwd || newPwd !== confirm) return;
    try {
      await changePassword(current, newPwd);
      setSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch { /* store handles error */ }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => { clearError(); onBack(); }} className="opacity-50 hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3 className="text-sm font-semibold">{t("account.change_pwd")}</h3>
      </div>
      <ErrorBanner error={error} onClear={clearError} />
      {success && <div className="px-3 py-2 rounded-lg bg-green-500/10 text-green-500 text-xs">{t("account.pwd_changed")}</div>}
      <input className={inputCls} type="password" placeholder={t("account.current_pwd")} value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
      <input className={inputCls} type="password" placeholder={t("account.new_pwd")} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
      <div>
        <input className={`${inputCls} ${mismatch ? "border-red-500" : ""}`} type="password" placeholder={t("account.confirm_pwd")} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch && <p className="text-xs text-red-500 mt-1">{t("account.pwd_mismatch")}</p>}
      </div>
      <button type="submit" disabled={isLoading || !current || !newPwd || newPwd !== confirm}
        className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {isLoading ? "..." : t("account.change_pwd_btn")}
      </button>
    </form>
  );
}

function ErrorBanner({ error, onClear }: { error: string | null; onClear: () => void }) {
  if (!error) return null;
  return (
    <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between">
      <span>{error}</span>
      <button type="button" onClick={onClear} className="opacity-60 hover:opacity-100 ml-2">✕</button>
    </div>
  );
}

function InfoItem({ label, value, verified, link, t }: {
  label: string; value: string; verified?: boolean; link?: boolean; t?: (k: string) => string;
}) {
  return (
    <div>
      <span className="opacity-40">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        {link ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline truncate">{value}</a>
        ) : (
          <span className="truncate">{value}</span>
        )}
        {verified !== undefined && (
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${verified ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"}`}>
            {verified ? (t?.("account.verified") ?? "✓") : (t?.("account.unverified") ?? "!")}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}
function formatDateTime(iso: string): string {
  try { const d = new Date(iso); return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; } catch { return iso; }
}
