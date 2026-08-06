import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore, type UserInfo, type OAuthAccount } from "@/store/auth-store";
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
  const { user, isLoggedIn, logout, loadFromStorage, fetchProfile } =
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
  const expireRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const deviceCodeRef = useRef("");
  const { loginWithTokens } = useAuthStore();

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (expireRef.current) { clearTimeout(expireRef.current); expireRef.current = null; }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; cleanup(); };
  }, [cleanup]);

  const startFlow = useCallback(async () => {
    setStep("pending");
    setError("");
    try {
      const res = await apiFetch<{ deviceCode: string; userCode: string; expiresIn: number; interval: number }>("/auth/device/code", { method: "POST" });
      if (!mountedRef.current) return;
      setUserCode(res.userCode);
      deviceCodeRef.current = res.deviceCode;
      const authUrl = `${getWebBase()}/device-auth?code=${res.userCode}`;
      window.open(authUrl, "_blank");
      const intervalMs = Math.max(res.interval * 1000, 3000);

      expireRef.current = setTimeout(() => {
        cleanup();
        if (mountedRef.current) { setStep("error"); setError(t("account.device_expired")); }
      }, (res.expiresIn || 600) * 1000);

      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) { cleanup(); return; }
        try {
          const tokenRes = await fetch(`${getApiBase()}/auth/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceCode: deviceCodeRef.current }),
          });
          if (tokenRes.status === 428) return;
          if (tokenRes.status === 410) { cleanup(); if (mountedRef.current) { setStep("error"); setError(t("account.device_expired")); } return; }
          if (tokenRes.ok) {
            cleanup();
            const data = await tokenRes.json();
            if (!mountedRef.current) return;
            if (data.accessToken && data.refreshToken) {
              setStep("done");
              await loginWithTokens(data.accessToken, data.refreshToken);
              try { await hap.window.focus(); } catch {}
            } else {
              console.error("[device-auth] token response missing fields:", data);
            }
          } else {
            console.warn("[device-auth] unexpected status:", tokenRes.status);
          }
        } catch (e) { console.error("[device-auth] poll error:", e); }
      }, intervalMs);
    } catch (e: any) {
      if (mountedRef.current) { setStep("error"); setError(e.message || t("account.device_error")); }
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

interface MemberLevelInfo {
  id: string;
  name: string;
  code: string;
  level: number;
  icon: string | null;
  color: string | null;
  description: string | null;
  discountRate: number | null;
  benefits: any;
}

function ProfileView({ user, theme, t, onLogout }: {
  user: UserInfo; theme: string; t: (k: string) => string; onLogout: () => void;
}) {
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [pwdMode, setPwdMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [memberLevel, setMemberLevel] = useState<MemberLevelInfo | null>(null);

  useEffect(() => {
    apiFetch<{ list: LoginHistory[] }>("/user/login-history")
      .catch(() => ({ list: [] }))
      .then((h) => setLoginHistory(h.list?.slice(0, 5) ?? []))
      .finally(() => setLoading(false));
    apiFetch<{ level: MemberLevelInfo | null }>("/user/member-level")
      .then((d) => setMemberLevel(d.level))
      .catch(() => {});
  }, []);

  const handleVerifyEmail = async () => {
    if (!user.email) { setVerifyMsg({ text: t("account.verify_email_no_email"), ok: false }); return; }
    setVerifyingEmail(true);
    try {
      await apiFetch("/auth/verify-email", { method: "POST" });
      setVerifyMsg({ text: t("account.verify_email_sent"), ok: true });
    } catch (e: any) {
      setVerifyMsg({ text: e.message || t("account.error"), ok: false });
    }
    setVerifyingEmail(false);
  };

  if (editMode) return <ProfileEditForm user={user} theme={theme} t={t} onBack={() => setEditMode(false)} />;
  if (pwdMode) return <PasswordChangeForm theme={theme} t={t} onBack={() => setPwdMode(false)} />;
  if (deleteMode) return <DeleteAccountForm theme={theme} t={t} onBack={() => setDeleteMode(false)} />;

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

      {memberLevel && (
        <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`} style={{ borderColor: memberLevel.color || undefined }}>
          <div className="flex items-center gap-3">
            {memberLevel.icon && <span className="text-2xl">{memberLevel.icon}</span>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: memberLevel.color || undefined }}>{memberLevel.name}</span>
                <span className="text-[10px] opacity-40">Lv.{memberLevel.level}</span>
              </div>
              {memberLevel.description && <p className="text-[10px] opacity-50 mt-0.5 truncate">{memberLevel.description}</p>}
            </div>
            {memberLevel.discountRate != null && memberLevel.discountRate < 1 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 shrink-0">
                {Math.round(memberLevel.discountRate * 10)}{t("account.member_discount")}
              </span>
            )}
          </div>
        </div>
      )}

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
          {user.phone && <InfoItem label={t("account.field_phone")} value={user.phone} />}
          <InfoItem label={t("account.field_status")} value={t(`account.status_${user.status}`)} />
          <InfoItem label={t("account.field_joined")} value={formatDate(user.createdAt)} />
          {user.lastLoginAt && <InfoItem label={t("account.field_last_login")} value={formatDate(user.lastLoginAt)} />}
          {user.website && <InfoItem label={t("account.field_website")} value={user.website} link />}
          {user.githubUsername && <InfoItem label={t("account.field_github")} value={user.githubUsername} />}
        </div>
        {user.email && !user.emailVerified && (
          <div className="mt-3 pt-3 border-t flex items-center gap-2" style={{ borderColor: "var(--fs-border)" }}>
            <button onClick={handleVerifyEmail} disabled={verifyingEmail}
              className="text-[10px] text-blue-500 hover:underline disabled:opacity-50">
              {verifyingEmail ? "..." : t("account.verify_email")}
            </button>
            {verifyMsg && <span className={`text-[10px] ${verifyMsg.ok ? "text-green-500" : "text-red-500"}`}>{verifyMsg.text}</span>}
          </div>
        )}
      </div>

      {/* OAuth 关联账号 */}
      {user.oauthAccounts && user.oauthAccounts.length > 0 && (
        <OAuthAccountsCard accounts={user.oauthAccounts} t={t} cardBg={cardBg} cardBorder={cardBorder} />
      )}

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

      {/* 安全设置区 */}
      <SecuritySection t={t} theme={theme} cardBg={cardBg} cardBorder={cardBorder} />

      {/* API Token 管理 */}
      <ApiTokenSection t={t} theme={theme} cardBg={cardBg} cardBorder={cardBorder} />

      {/* 危险操作区 */}
      <div className={`rounded-lg border p-4 ${cardBg} border-red-500/20`}>
        <h4 className="text-xs font-medium text-red-500 mb-2">{t("account.danger_zone")}</h4>
        <button onClick={() => setDeleteMode(true)}
          className="text-xs text-red-500 hover:underline">
          {t("account.delete_account")}
        </button>
      </div>

      <div className="text-center pt-2">
        <a href={`${getWebBase()}/account`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
          {t("account.go_website")} →
        </a>
      </div>
    </div>
  );
}

function OAuthAccountsCard({ accounts, t, cardBg, cardBorder }: {
  accounts: OAuthAccount[]; t: (k: string) => string; cardBg: string; cardBorder: string;
}) {
  const { fetchProfile } = useAuthStore();
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState("");

  const providerIcon: Record<string, string> = { google: "🔵", github: "⚫" };
  const providerName: Record<string, string> = { google: "Google", github: "GitHub" };

  const handleUnlink = async (accountId: string) => {
    if (!confirm(t("account.unlink_confirm"))) return;
    setUnlinking(accountId);
    setUnlinkError("");
    try {
      await apiFetch(`/user/oauth/${accountId}`, { method: "DELETE" });
      await fetchProfile();
    } catch (e: any) {
      setUnlinkError(e.message || t("account.error"));
    }
    setUnlinking(null);
  };

  return (
    <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`}>
      <h4 className="text-xs font-medium opacity-50 mb-2">{t("account.linked_accounts")}</h4>
      {unlinkError && <p className="text-[10px] text-red-500 mb-2">{unlinkError}</p>}
      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span>{providerIcon[a.provider] ?? "🔗"}</span>
              <span>{providerName[a.provider] ?? a.provider}</span>
              <span className="opacity-40">{formatDate(a.createdAt)}</span>
            </span>
            <button onClick={() => handleUnlink(a.id)} disabled={unlinking === a.id}
              className="text-red-500 hover:underline disabled:opacity-50">
              {unlinking === a.id ? "..." : t("account.unlink")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecuritySection({ t, theme, cardBg, cardBorder }: {
  t: (k: string) => string; theme: string; cardBg: string; cardBorder: string;
}) {
  const [twoFaStatus, setTwoFaStatus] = useState<{ enabled: boolean } | null>(null);
  const [setupMode, setSetupMode] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(() => {
    apiFetch<{ enabled: boolean }>("/user/two-factor/status")
      .then(setTwoFaStatus)
      .catch(() => setTwoFaStatus({ enabled: false }));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSetup = async () => {
    setLoading(true); setError("");
    try {
      const res = await apiFetch<{ secret: string; qrCode: string }>("/user/two-factor/setup", { method: "POST" });
      setSetupData(res);
      setSetupMode(true);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) return;
    setLoading(true); setError("");
    try {
      const res = await apiFetch<{ backupCodes: string[] }>("/user/two-factor/verify", {
        method: "POST", body: JSON.stringify({ code: verifyCode }),
      });
      setBackupCodes(res.backupCodes);
      setSetupMode(false); setSetupData(null); setVerifyCode("");
      fetchStatus();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const handleDisable = async () => {
    if (!disableCode) return;
    setLoading(true); setError("");
    try {
      await apiFetch("/user/two-factor/disable", {
        method: "POST", body: JSON.stringify({ code: disableCode }),
      });
      setDisableMode(false); setDisableCode("");
      fetchStatus();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-blue-500 ${
    theme === "dark" ? "bg-[#2a2a3e] border-[#444] text-white" : "bg-white border-gray-300 text-gray-900"
  }`;

  if (backupCodes) {
    return (
      <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`}>
        <h4 className="text-xs font-medium text-green-500 mb-2">{t("account.two_factor_success")}</h4>
        <p className="text-[10px] opacity-50 mb-3">{t("account.two_factor_backup_tip")}</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {backupCodes.map((c) => (
            <code key={c} className="text-[10px] font-mono text-center py-1 rounded bg-black/5 dark:bg-white/5">{c}</code>
          ))}
        </div>
        <button onClick={() => { navigator.clipboard.writeText(backupCodes.join("\n")); }}
          className="w-full py-2 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">
          {t("account.two_factor_copy_backup")}
        </button>
        <button onClick={() => setBackupCodes(null)}
          className="w-full py-2 mt-2 text-xs rounded-lg border transition-colors hover:bg-black/5" style={{ borderColor: "var(--fs-border)" }}>
          {t("account.two_factor_done")}
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`}>
      <h4 className="text-xs font-medium opacity-50 mb-3">{t("account.security")}</h4>
      {error && <p className="text-[10px] text-red-500 mb-2">{error}</p>}

      {setupMode && setupData ? (
        <div className="space-y-3">
          <p className="text-[10px] opacity-50">{t("account.two_factor_scan_qr")}</p>
          <div className="flex justify-center">
            <img src={setupData.qrCode} alt="2FA QR" className="w-40 h-40 rounded-lg" />
          </div>
          <div className="text-center">
            <p className="text-[10px] opacity-40 mb-1">{t("account.two_factor_manual_key")}</p>
            <code className="text-[10px] font-mono select-all break-all">{setupData.secret}</code>
          </div>
          <input className={inputCls} maxLength={6} placeholder={t("account.two_factor_enter_code")}
            value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))} />
          <div className="flex gap-2">
            <button onClick={() => { setSetupMode(false); setSetupData(null); setError(""); }}
              className="flex-1 py-2 text-xs rounded-lg border transition-colors" style={{ borderColor: "var(--fs-border)" }}>
              {t("account.cancel")}
            </button>
            <button onClick={handleVerify} disabled={loading || verifyCode.length !== 6}
              className="flex-1 py-2 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
              {loading ? "..." : t("account.two_factor_verify")}
            </button>
          </div>
        </div>
      ) : disableMode ? (
        <div className="space-y-3">
          <p className="text-[10px] opacity-50">{t("account.two_factor_disable_tip")}</p>
          <input className={inputCls} placeholder={t("account.two_factor_enter_code")}
            value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => { setDisableMode(false); setError(""); }}
              className="flex-1 py-2 text-xs rounded-lg border transition-colors" style={{ borderColor: "var(--fs-border)" }}>
              {t("account.cancel")}
            </button>
            <button onClick={handleDisable} disabled={loading || !disableCode}
              className="flex-1 py-2 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
              {loading ? "..." : t("account.two_factor_disable_btn")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs">
          <span>{t("account.two_factor")}</span>
          <div className="flex items-center gap-2">
            {twoFaStatus === null ? (
              <span className="opacity-40">...</span>
            ) : (
              <>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  twoFaStatus.enabled ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
                }`}>
                  {twoFaStatus.enabled ? t("account.two_factor_enabled") : t("account.two_factor_disabled")}
                </span>
                {twoFaStatus.enabled ? (
                  <button onClick={() => { setDisableMode(true); setError(""); }}
                    className="text-[10px] text-red-500 hover:underline">{t("account.two_factor_disable_btn")}</button>
                ) : (
                  <button onClick={handleSetup} disabled={loading}
                    className="text-[10px] text-blue-500 hover:underline">{t("account.two_factor_setup")}</button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ApiToken {
  id: string;
  name: string;
  scope: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function ApiTokenSection({ t, theme, cardBg, cardBorder }: {
  t: (k: string) => string; theme: string; cardBg: string; cardBorder: string;
}) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadTokens = useCallback(() => {
    apiFetch<{ list: ApiToken[] }>("/user/tokens")
      .then((d) => setTokens(d.list ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const handleCreate = async () => {
    if (!newTokenName.trim()) return;
    setCreateError("");
    try {
      const body: Record<string, unknown> = { name: newTokenName.trim() };
      if (expiryDays && parseInt(expiryDays) > 0) body.expiresInDays = parseInt(expiryDays);
      const res = await apiFetch<ApiToken & { token: string }>("/user/tokens", { method: "POST", body: JSON.stringify(body) });
      setCreatedToken(res.token);
      setNewTokenName("");
      setExpiryDays("");
      loadTokens();
    } catch (e: any) {
      setCreateError(e.message || t("account.token_create_error"));
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm(t("account.token_revoke_confirm"))) return;
    try {
      await apiFetch(`/user/tokens/${id}`, { method: "DELETE" });
      loadTokens();
    } catch { /* ignore */ }
  };

  const handleCopy = () => {
    if (!createdToken) return;
    navigator.clipboard.writeText(createdToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-blue-500 ${
    theme === "dark" ? "bg-[#2a2a3e] border-[#444] text-white" : "bg-white border-gray-300 text-gray-900"
  }`;

  return (
    <div className={`rounded-lg border p-4 ${cardBg} ${cardBorder}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-xs font-medium opacity-50">{t("account.api_tokens")}</h4>
          <p className="text-[10px] opacity-30 mt-0.5">{t("account.api_tokens_desc")}</p>
        </div>
        <button onClick={() => { setCreating(!creating); setCreatedToken(null); setCreateError(""); }}
          className="text-[10px] text-blue-500 hover:underline">{t("account.token_create")}</button>
      </div>

      {createdToken && (
        <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs space-y-1.5">
          <p className="text-green-600 font-medium">{t("account.token_created_tip")}</p>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 font-mono text-[10px] truncate select-all">{createdToken}</code>
            <button onClick={handleCopy} className="shrink-0 text-[10px] text-blue-500 hover:underline">
              {copied ? t("account.token_copied") : t("account.token_copy")}
            </button>
          </div>
        </div>
      )}

      {creating && !createdToken && (
        <div className="mb-3 space-y-2">
          <input className={inputCls} placeholder={t("account.token_name_placeholder")} value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} />
          <input className={inputCls} type="number" min="1" max="365" placeholder={t("account.token_expiry_days")} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
          {createError && <p className="text-[10px] text-red-500">{createError}</p>}
          <button onClick={handleCreate} disabled={!newTokenName.trim()}
            className="w-full py-2 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
            {t("account.token_create")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center"><div className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : tokens.length === 0 ? (
        <p className="text-[10px] opacity-30 text-center py-2">{t("account.token_none")}</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((tk) => (
            <div key={tk.id} className="flex items-center justify-between text-xs py-1.5 border-t" style={{ borderColor: "var(--fs-border)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{tk.name}</div>
                <div className="text-[10px] opacity-40 flex gap-3 mt-0.5">
                  <span>{tk.expiresAt ? formatDate(tk.expiresAt) : t("account.token_no_expiry")}</span>
                  <span>{tk.lastUsedAt ? formatDate(tk.lastUsedAt) : t("account.token_never")}</span>
                </div>
              </div>
              <button onClick={() => handleRevoke(tk.id)} className="text-[10px] text-red-500 hover:underline shrink-0 ml-2">{t("account.token_revoke")}</button>
            </div>
          ))}
        </div>
      )}
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
  const [phone, setPhone] = useState(user.phone || "");
  const [website, setWebsite] = useState(user.website || "");
  const [githubUsername, setGithubUsername] = useState(user.githubUsername || "");
  const [success, setSuccess] = useState(false);

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-blue-500 ${
    theme === "dark" ? "bg-[#2a2a3e] border-[#444] text-white" : "bg-white border-gray-300 text-gray-900"
  }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        avatar: avatar.trim(),
        phone: phone.trim(),
        website: website.trim(),
        githubUsername: githubUsername.trim(),
      });
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
      <div><label className="text-xs opacity-50 mb-1 block">{t("account.field_phone")}</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><label className="text-xs opacity-50 mb-1 block">{t("account.field_website")}</label><input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." /></div>
      <div><label className="text-xs opacity-50 mb-1 block">{t("account.field_github")}</label><input className={inputCls} value={githubUsername} onChange={(e) => setGithubUsername(e.target.value)} /></div>
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

function DeleteAccountForm({ theme, t, onBack }: {
  theme: string; t: (k: string) => string; onBack: () => void;
}) {
  const { logout } = useAuthStore();
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-blue-500 ${
    theme === "dark" ? "bg-[#2a2a3e] border-[#444] text-white" : "bg-white border-gray-300 text-gray-900"
  }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch("/user/account", { method: "DELETE", body: JSON.stringify({ password: pwd }) });
      logout();
    } catch (e: any) {
      setError(e.message || t("account.error"));
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} className="opacity-50 hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3 className="text-sm font-semibold text-red-500">{t("account.delete_account")}</h3>
      </div>
      <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
        {t("account.delete_confirm")}
      </div>
      {error && <ErrorBanner error={error} onClear={() => setError("")} />}
      <input className={inputCls} type="password" placeholder={t("account.delete_need_pwd")} value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
      <button type="submit" disabled={loading || !pwd}
        className="w-full py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {loading ? "..." : t("account.delete_account")}
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
