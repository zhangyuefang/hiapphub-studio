import { useState, useEffect, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Languages, Sun, Moon, Monitor, Minus, Square, X, FolderOpen, FilePlus, CheckCircle, XCircle, Loader, ArrowLeft, Package, Library, Settings, Plus, LayoutTemplate } from 'lucide-react';
import { t, setLocale, getLocale, SUPPORTED_LOCALES, LOCALE_LABELS } from './i18n';
import { setTheme, getTheme, ThemeMode } from './theme';
import { startServer, stopServer, wsBroadcast, wsSendToRole, hasPluginConnected, isWsServerRunning, getPorts, restartServer, getWsClients, onWsMessage } from './server';
import { setupTray, destroyTray } from './tray';
import { addProject, createWorkspace, runPnpmInstall, readWorkspace, saveWorkspace, WorkspaceConfig, ProjectType, ID_REGEX } from './scaffold';
import { createProject } from './create-project';
import { ProjectEditor } from './ProjectEditor';
import { ProgressDialog, ProgressStep } from './ProgressDialog';

type AppView = 'env-check' | 'welcome' | 'project' | 'create-workspace' | 'add-project';

function initDragDialog(el: HTMLElement | null) {
  if (!el || el.dataset.dragInit) return;
  el.dataset.dragInit = '1';
  let ox = 0, oy = 0, sx = 0, sy = 0;
  const onMove = (e: MouseEvent) => { el.style.left = (sx + e.clientX - ox) + 'px'; el.style.top = (sy + e.clientY - oy) + 'px'; el.style.transform = 'none'; };
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  const title = el.querySelector('.dialog-title') as HTMLElement;
  if (title) title.addEventListener('mousedown', (e) => { ox = e.clientX; oy = e.clientY; const r = el.getBoundingClientRect(); sx = r.left; sy = r.top; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); });
}

const IS_MAC = navigator.userAgent.includes('Mac');
const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  system: <Monitor size={14} />,
  light: <Sun size={14} />,
  dark: <Moon size={14} />,
};
const THEME_ORDER: ThemeMode[] = ['system', 'light', 'dark'];

interface EnvItem { name: string; ok: boolean; version: string; hint: string; installable?: boolean; }

async function checkCommand(cmd: string): Promise<{ ok: boolean; version: string }> {
  try {
    const r = await (window as any).hap?.hal?.('process', 'exec', { command: `${cmd} --version` });
    const out = typeof r === 'string' ? r : r?.stdout || r?.output || '';
    const ver = out.trim().split('\n')[0] || '';
    return { ok: true, version: ver };
  } catch { return { ok: false, version: '' }; }
}

async function installTool(name: string): Promise<{ ok: boolean; msg: string }> {
  const hal = (m: string, f: string, p?: any) => (window as any).hap?.hal?.(m, f, p || {});
  try {
    if (name === 'Node.js') {
      const hasFnm = await checkCommand('fnm');
      if (hasFnm.ok) {
        await hal('process', 'exec', { command: 'fnm install --lts', timeout_ms: 120000 });
        await hal('process', 'exec', { command: 'fnm default lts-latest', timeout_ms: 10000 });
        return { ok: true, msg: 'Node.js installed via fnm' };
      }
      const hasNvm = await checkCommand('nvm');
      if (hasNvm.ok) {
        await hal('process', 'exec', { command: 'nvm install --lts', timeout_ms: 120000 });
        return { ok: true, msg: 'Node.js installed via nvm' };
      }
      const hasBrew = await checkCommand('brew');
      if (hasBrew.ok) {
        await hal('process', 'exec', { command: 'brew install node', timeout_ms: 300000 });
        return { ok: true, msg: 'Node.js installed via Homebrew' };
      }
      return { ok: false, msg: 'Please install fnm/nvm/Homebrew first, or download from https://nodejs.org' };
    }
    if (name === 'pnpm') {
      await hal('process', 'exec', { command: 'npm install -g pnpm', timeout_ms: 60000 });
      return { ok: true, msg: 'pnpm installed' };
    }
    return { ok: false, msg: `${name} cannot be auto-installed` };
  } catch (e: any) {
    return { ok: false, msg: e?.message || String(e) };
  }
}

export function App() {
  const [view, setView] = useState<AppView>('env-check');
  const [envItems, setEnvItems] = useState<EnvItem[]>([]);
  const [envChecking, setEnvChecking] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(getTheme());
  const [locale, setLocaleState] = useState(getLocale());
  const [wsDir, setWsDir] = useState('');
  const [wsConfig, setWsConfig] = useState<WorkspaceConfig | null>(null);
  const [wsDisplayName, setWsDisplayName] = useState('');
  const [projId, setProjId] = useState('');
  const [projType, setProjType] = useState<ProjectType>('hap');
  const [projStep, setProjStep] = useState<1 | 2 | 3>(1);
  const [idError, setIdError] = useState('');
  const [wizardTemplates, setWizardTemplates] = useState<any[]>([]);
  const [wizardSelectedTpl, setWizardSelectedTpl] = useState<any>(null);  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wsNameDraft, setWsNameDraft] = useState('');
  const [autoOpen, setAutoOpen] = useState(false);
  const [pluginConnected, setPluginConnected] = useState(false);
  const [wsRunning, setWsRunning] = useState(false);
  const [wsPopoverOpen, setWsPopoverOpen] = useState(false);
  const [editHttpPort, setEditHttpPort] = useState(getPorts().http);
  const [editWsPort, setEditWsPort] = useState(getPorts().ws);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTitle, setProgressTitle] = useState('');
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [progressError, setProgressError] = useState('');
  const [progressDone, setProgressDone] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [openProjOverlay, setOpenProjOverlay] = useState(false);
  const serverStarted = useRef(false);

  const kvGet = async (k: string) => { try { const v = await (window as any).hap?.db?.get?.(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const kvSet = async (k: string, v: any) => { try { await (window as any).hap?.db?.set?.(k, JSON.stringify(v)); } catch {} };

  const pendingRestore = useRef<{ dir: string; tabs: string[] } | null>(null);

  useEffect(() => {
    if (!serverStarted.current) {
      serverStarted.current = true;
      startServer().then(ok => {
        if (ok) console.log('[DevTools] server started');
      });
      setupTray();
      onWsMessage((msg) => {
        if (msg.type === 'project-created' && msg.manifestPath) {
          launchCreatedProject(msg.manifestPath);
        }
      });
      kvGet('devtools_auto_open').then(v => {
        if (v) {
          setAutoOpen(true);
          kvGet('devtools_last_ws').then((last: any) => {
            if (last?.dir) pendingRestore.current = { dir: last.dir, tabs: last.tabs || [] };
          });
        }
      });
    }
    const pollId = setInterval(() => { hasPluginConnected().then(v => setPluginConnected(v)); setWsRunning(isWsServerRunning()); }, 2000);
    const onBeforeUnload = () => { wsSendToRole('runner', { type: 'devtools:shutdown' }); (window as any).hap?.system?.stopApp?.('*runners*'); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { clearInterval(pollId); window.removeEventListener('beforeunload', onBeforeUnload); stopServer(); destroyTray(); };
  }, []);

  useEffect(() => {
    const onState = () => {
      const s = (window as any).__hapWindowState;
      if (s) setIsFullscreen(s.isFullscreen);
    };
    window.addEventListener('hap-window-state', onState);
    onState();
    return () => window.removeEventListener('hap-window-state', onState);
  }, []);

  useEffect(() => {
    const id = (window as any).hap?.window?.onMessage?.((data: any) => {
      if (data?.type === 'open-project' && data.id) {
        openProjectTab(data.id);
      }
    });
    return () => { void id; };
  }, [openTabs]);

  useEffect(() => {
    window.hap?.system?.capabilities?.().then((caps: any) => {
      if (caps?.platform === 'ohos') {
        setView('welcome');
      } else {
        runEnvCheck();
      }
    }).catch(() => runEnvCheck());
  }, []);

  async function runEnvCheck() {
    setEnvChecking(true);
    const checks = [
      { name: 'Node.js', cmd: 'node', hint: 'https://nodejs.org' },
      { name: 'npm', cmd: 'npm', hint: 'Node.js 自带' },
      { name: 'pnpm', cmd: 'pnpm', hint: 'npm install -g pnpm' },
    ];
    const results: EnvItem[] = [];
    for (const c of checks) {
      const r = await checkCommand(c.cmd);
      results.push({ name: c.name, ok: r.ok, version: r.version, hint: c.hint, installable: !r.ok && c.cmd !== 'npm' });
    }
    setEnvItems(results);
    setEnvChecking(false);
    if (results.every(i => i.ok)) {
      setTimeout(() => setView('welcome'), 4000);
    }
  }

  const pickDir = async (): Promise<string | null> => {
    try {
      console.log('[pickDir] calling dialog...');
      const r = await (window as any).hap?.hal?.('dialog', 'open_directory', {});
      console.log('[pickDir] result:', typeof r, JSON.stringify(r));
      if (typeof r === 'string' && r) return r;
      if (r && typeof r === 'object') return r.path || r.directory || r[0] || null;
      return null;
    } catch (e: any) {
      console.error('[pickDir] error:', e?.message || e);
      return null;
    }
  };

  const handleOpen = async () => {
    const dir = await pickDir();
    if (!dir) return;
    const cfg = await readWorkspace(dir);
    if (cfg) {
      setWsDir(dir);
      setWsConfig(cfg);
      setOpenTabs([]);
      setActiveTab(null);
      setView('project');
      kvSet('devtools_last_ws', { dir, tabs: [] });
    } else {
      console.warn('[workspace] not found:', dir);
      setToastMsg(`${t('workspace.not_found')}\n${dir}`);
      setTimeout(() => setToastMsg(''), 5000);
    }
  };

  const handleCreateWorkspace = async () => {
    const dir = await pickDir();
    if (dir) {
      setWsDir(dir);
      setWsDisplayName('');
      setView('create-workspace');
    }
  };

  const handleFinishWorkspace = async () => {
    if (!wsDir || !wsDisplayName.trim()) return;
    const logLines: string[] = [];
    const addLog = (msg: string) => { logLines.push(msg); setProgressLogs([...logLines]); };

    setProgressOpen(true);
    setProgressTitle(t('progress.init_ws'));
    setProgressDone(false);
    setProgressError('');
    setProgressLogs([]);
    setProgressSteps([
      { label: t('progress.step_files'), status: 'active' },
      { label: t('progress.step_install'), status: 'pending' },
    ]);

    try {
      const cfg = await createWorkspace(wsDir, wsDisplayName.trim(), addLog);
      setProgressSteps([
        { label: t('progress.step_files'), status: 'done' },
        { label: t('progress.step_install'), status: 'active' },
      ]);
      addLog('');
      const ok = await runPnpmInstall(wsDir, addLog);
      if (!ok) {
        setProgressSteps([
          { label: t('progress.step_files'), status: 'done' },
          { label: t('progress.step_install'), status: 'error' },
        ]);
        setProgressError(t('progress.install_fail'));
      } else {
        setProgressSteps([
          { label: t('progress.step_files'), status: 'done' },
          { label: t('progress.step_install'), status: 'done' },
        ]);
      }
      setProgressDone(true);
      setWsConfig(cfg);
      setOpenTabs([]);
      setActiveTab(null);
      setProjId('');
      setProjType('hap');
      setProjStep(1);
      setIdError('');
      setTimeout(() => {
        setProgressOpen(false);
        setWizardSelectedTpl(null);
        setView('add-project');
        fetchTemplates();
      }, 1800);
    } catch (e: any) {
      console.error('[workspace] create failed:', e?.message || e);
      setProgressSteps(s => s.map(st => st.status === 'active' ? { ...st, status: 'error' as const } : st));
      setProgressError(e?.message || t('progress.create_fail'));
    }
  };

  const fetchTemplates = (retries = 2) => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3102';
    fetch(`${serverUrl}/api/templates?pageSize=100&sort=name`)
      .then(r => r.json())
      .then(d => {
        const list = (d.templates || []).sort((a: any, b: any) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.templateCode.localeCompare(b.templateCode));
        setWizardTemplates(list);
      })
      .catch(() => { if (retries > 0) setTimeout(() => fetchTemplates(retries - 1), 2000); else setWizardTemplates([]); });
  };

  const handleStartAddProject = () => {
    setProjId('');
    setProjType('hap');
    setProjStep(1);
    setIdError('');
    setWizardSelectedTpl(null);
    setView('add-project');
    fetchTemplates();
  };

  const launchCreatedProject = async (manifestPath: string) => {
    try {
      const hfs = (window as any).hap?.fs;
      if (!hfs) return;
      const raw = await hfs.readTextFile(manifestPath);
      const manifest = JSON.parse(raw);
      const projectDir = manifestPath.replace(/\/manifest\.json$/, '');
      if (wsConfig && wsDir) {
        const cfg = await readWorkspace(wsDir);
        if (cfg) setWsConfig(cfg);
      }
      (window as any).__devtools__?.openProject?.(manifest.id);
    } catch (e: any) {
      console.error('[DevTools] launchCreatedProject error:', e?.message);
    }
  };

  const validateProjId = (v: string) => {
    setProjId(v);
    if (v && !ID_REGEX.test(v)) setIdError(t('wizard.id_error'));
    else setIdError('');
  };

  const handleFinishAddProject = async () => {
    if (!wsDir || !projId || !ID_REGEX.test(projId)) return;
    const logLines: string[] = [];
    const addLog = (msg: string) => { logLines.push(msg); setProgressLogs([...logLines]); };

    setProgressOpen(true);
    setProgressTitle(t('progress.init_project'));
    setProgressDone(false);
    setProgressError('');
    setProgressLogs([]);
    setProgressSteps([
      { label: t('progress.step_proj_files'), status: 'active' },
      { label: t('progress.step_install'), status: 'pending' },
    ]);

    try {
      if (wizardSelectedTpl) {
        const targetDir = `${wsDir}/packages/${projId}`;
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3102';
        await createProject({
          templateId: wizardSelectedTpl.id,
          appId: projId,
          name: projId,
          targetDir,
          serverUrl,
        }, (step) => addLog(step));
        const cfg = await readWorkspace(wsDir);
        if (cfg) {
          const exists = cfg.projects.some((p: any) => p.id === projId);
          if (!exists) {
            cfg.projects.push({ id: projId, type: 'hap', path: `packages/${projId}` });
            await saveWorkspace(wsDir, cfg);
          }
        }
        setProgressSteps([
          { label: t('progress.step_proj_files'), status: 'done' },
          { label: t('progress.step_install'), status: 'done' },
        ]);
      } else {
        await addProject(wsDir, projId, projType, undefined, addLog);
        setProgressSteps([
          { label: t('progress.step_proj_files'), status: 'done' },
          { label: t('progress.step_install'), status: 'active' },
        ]);
        addLog('');
        const ok = await runPnpmInstall(wsDir, addLog);
        if (!ok) {
          setProgressSteps([
            { label: t('progress.step_proj_files'), status: 'done' },
            { label: t('progress.step_install'), status: 'error' },
          ]);
          setProgressError(t('progress.install_fail'));
        } else {
          setProgressSteps([
            { label: t('progress.step_proj_files'), status: 'done' },
            { label: t('progress.step_install'), status: 'done' },
          ]);
        }
      }
      setProgressDone(true);
      const cfg = await readWorkspace(wsDir);
      if (cfg) {
        setWsConfig(cfg);
        if (!openTabs.includes(projId)) setOpenTabs([...openTabs, projId]);
        setActiveTab(projId);
      }
      setTimeout(() => {
        setProgressOpen(false);
        setView('project');
      }, 1800);
    } catch (e: any) {
      console.error('[project] add failed:', e?.message || e);
      setProgressSteps(s => s.map(st => st.status === 'active' ? { ...st, status: 'error' as const } : st));
      setProgressError(e?.message || t('progress.create_fail'));
    }
  };

  const closeTab = (id: string) => {
    const next = openTabs.filter(t => t !== id);
    setOpenTabs(next);
    if (activeTab === id) setActiveTab(next[0] || null);
  };

  useEffect(() => {
    if (wsDir) kvSet('devtools_last_ws', { dir: wsDir, tabs: openTabs });
  }, [openTabs, wsDir]);

  const openProjectTab = (id: string) => {
    if (!openTabs.includes(id)) setOpenTabs([...openTabs, id]);
    setActiveTab(id);
  };

  const handleOpenSettings = () => {
    if (wsConfig) setWsNameDraft(wsConfig.name);
    setSettingsOpen(true);
  };
  const handleSaveSettings = async () => {
    if (wsConfig && wsDir && wsNameDraft.trim()) {
      const updated = { ...wsConfig, name: wsNameDraft.trim() };
      await saveWorkspace(wsDir, updated);
      setWsConfig(updated);
    }
    await kvSet('devtools_auto_open', autoOpen);
    setSettingsOpen(false);
  };
  const wsTitle = wsConfig
    ? `${t("titlebar.title")} - ${t('tab.project')}: ${wsConfig.name} (${wsConfig.projects.length})`
    : t("titlebar.title");

  useEffect(() => {
    if (view === 'project' && wsConfig) {
      (window as any).hap?.window?.setTitle?.(wsTitle);
    }
  }, [wsConfig?.name, wsConfig?.projects.length, view, locale]);

  useEffect(() => {
    const dt: any = {};
    dt.getState = () => {
      const statusEl = document.querySelector('.pe-run-status');
      let viteStatus = 'stopped';
      if (statusEl) {
        if (statusEl.classList.contains('running')) viteStatus = 'running';
        else if (statusEl.classList.contains('starting')) viteStatus = 'starting';
        else if (statusEl.classList.contains('error')) viteStatus = 'error';
      }
      const pidEl = document.querySelector('.pe-run-pid');
      const vitePid = pidEl ? parseInt(pidEl.textContent?.replace('PID: ', '') || '0') || null : null;
      const urlEl = document.querySelector('.pe-detected-url');
      return { view, workspaceDir: wsDir, workspaceName: wsConfig?.name || '', activeTab, openTabs, viteStatus, vitePid, detectedUrl: urlEl?.textContent || null };
    };
    dt.getProjects = () => ({
      workspaceDir: wsDir,
      projects: (wsConfig?.projects || []).map((p: any) => {
        const isOpen = openTabs.includes(p.id);
        const isActive = activeTab === p.id;
        let viteStatus = 'stopped';
        if (isActive) {
          const statusEl = document.querySelector('.pe-run-status');
          if (statusEl?.classList.contains('running')) viteStatus = 'running';
          else if (statusEl?.classList.contains('starting')) viteStatus = 'starting';
          else if (statusEl?.classList.contains('error')) viteStatus = 'error';
        }
        const pidEl = isActive ? document.querySelector('.pe-run-pid') : null;
        return { id: p.id, type: p.type || 'hap', isOpen, isActive, viteStatus, vitePid: pidEl ? parseInt(pidEl.textContent?.replace('PID: ', '') || '0') || null : null };
      })
    });
    dt.openWorkspace = async (dir: string) => {
      const cfg = await readWorkspace(dir);
      if (!cfg) return { success: false, error: 'not_a_workspace', message: 'hiapphub.workspace.json not found' };
      setWsDir(dir); setWsConfig(cfg); setOpenTabs([]); setActiveTab(null); setView('project');
      kvSet('devtools_last_ws', { dir, tabs: [] });
      return { success: true, name: cfg.name, projects: cfg.projects.map((p: any) => p.id) };
    };
    dt.createWorkspace = async (dir: string, name: string) => {
      try {
        const cfg = await createWorkspace(dir, name, () => {});
        await runPnpmInstall(dir, () => {});
        setWsDir(dir); setWsConfig(cfg); setOpenTabs([]); setActiveTab(null); setView('project');
        kvSet('devtools_last_ws', { dir, tabs: [] });
        return { success: true, dir, name };
      } catch (e: any) { return { success: false, error: 'create_failed', message: e?.message || 'Unknown error' }; }
    };
    dt.closeWorkspace = () => { setWsDir(''); setWsConfig(null); setOpenTabs([]); setActiveTab(null); setView('welcome'); return { success: true }; };
    dt.addProject = async (id: string, type: string) => {
      if (!wsDir) return { success: false, error: 'no_workspace', message: 'No workspace is open' };
      if (!ID_REGEX.test(id)) return { success: false, error: 'invalid_id', message: 'ID must match [a-z0-9-_]+' };
      try {
        await addProject(wsDir, id, type as any, undefined, () => {});
        await runPnpmInstall(wsDir, () => {});
        const cfg = await readWorkspace(wsDir);
        if (cfg) { setWsConfig(cfg); if (!openTabs.includes(id)) setOpenTabs([...openTabs, id]); setActiveTab(id); }
        setView('project');
        return { success: true, projectId: id };
      } catch (e: any) { return { success: false, error: 'add_failed', message: e?.message || 'Unknown error' }; }
    };
    dt.openProject = (id: string) => {
      if (!wsConfig?.projects.some((p: any) => p.id === id)) return { success: false, error: 'not_found', message: `Project "${id}" not in workspace` };
      if (!openTabs.includes(id)) setOpenTabs([...openTabs, id]);
      setActiveTab(id);
      return { success: true };
    };
    dt.closeProject = (id: string) => {
      const next = openTabs.filter(t => t !== id);
      setOpenTabs(next);
      if (activeTab === id) setActiveTab(next[0] || null);
      return { success: true };
    };
    dt.startProject = async (id?: string) => {
      if (id && id !== activeTab) {
        if (!openTabs.includes(id)) setOpenTabs([...openTabs, id]);
        setActiveTab(id);
        await new Promise(r => setTimeout(r, 100));
      }
      const btn = document.querySelector('.pe-run-btn.start') as HTMLElement;
      if (!btn) return { success: false, error: 'no_start_btn', message: 'Start button not found (Vite may already be running)' };
      btn.click();
      return { success: true };
    };
    dt.stopProject = async (id?: string) => {
      if (id && id !== activeTab) {
        if (!openTabs.includes(id)) setOpenTabs([...openTabs, id]);
        setActiveTab(id);
        await new Promise(r => setTimeout(r, 100));
      }
      const btn = document.querySelector('.pe-run-btn.stop') as HTMLElement;
      if (!btn) return { success: false, error: 'no_stop_btn', message: 'Stop button not found (Vite may not be running)' };
      btn.click();
      return { success: true };
    };
    (window as any).__devtools__ = dt;
  }, [view, wsDir, wsConfig, openTabs, activeTab]);

  const titlebar = (
    <header className="titlebar" data-tauri-drag-region style={{ paddingLeft: IS_MAC ? (isFullscreen ? 12 : 78) : 12, paddingRight: IS_MAC ? 12 : 0 }}>
      <div className="titlebar-title" data-tauri-drag-region>{wsTitle}</div>
      <div className="titlebar-actions">
        {view === 'project' && (
          <>
            <button className="titlebar-btn" title={t('workspace.create')} onClick={handleCreateWorkspace}><FilePlus size={13} /></button>
            <button className="titlebar-btn" title={t('workspace.open')} onClick={handleOpen}><FolderOpen size={13} /></button>
            <button className="titlebar-btn" title={t('workspace.settings')} onClick={handleOpenSettings}><Settings size={13} /></button>
          </>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="titlebar-btn" title={t('lang.label')} style={{ fontSize: 10, width: 'auto', padding: '0 6px', gap: 3 }}>
              <Languages size={13} /> {LOCALE_LABELS[locale]?.slice(0, 4) || locale}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-content" sideOffset={4} align="end">
              {SUPPORTED_LOCALES.map(loc => (
                <DropdownMenu.Item key={loc} className={`dropdown-item ${locale === loc ? 'active' : ''}`}
                  onSelect={() => {
                    setLocale(loc); setLocaleState(loc);
                    wsBroadcast({ type: 'locale', locale: loc });
                  }}>
                  {LOCALE_LABELS[loc] || loc}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="titlebar-btn" title={t(`theme.${theme}`)}>{THEME_ICONS[theme]}</button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-content" sideOffset={4} align="end">
              {THEME_ORDER.map(m => (
                <DropdownMenu.Item key={m} className={`dropdown-item ${theme === m ? 'active' : ''}`}
                  onSelect={() => { setTheme(m); setThemeState(m); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {THEME_ICONS[m]} {t(`theme.${m}`)}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {!IS_MAC && (
          <>
            <button className="titlebar-btn minimize" onClick={() => (window as any).hap?.window?.minimize?.()}><Minus size={14} /></button>
            <button className="titlebar-btn maximize" onClick={() => (window as any).hap?.window?.maximize?.()}><Square size={12} /></button>
            <button className="titlebar-btn close" onClick={() => (window as any).hap?.window?.close?.()}><X size={14} /></button>
          </>
        )}
      </div>
    </header>
  );

  return (
    <div className="app">
      {titlebar}

      {view === 'env-check' && (
        <main className="main-content center-view">
          <div className="env-check">
            <h2>{t('env.title')}</h2>
            {envChecking ? (
              <div className="env-loading"><Loader size={20} className="spin" /> {t('env.checking')}</div>
            ) : (
              <>
                <div className="env-list">
                  {envItems.map((item, idx) => (
                    <div key={item.name} className={`env-row ${item.ok ? 'ok' : 'err'} env-animate`} style={{ animationDelay: `${idx * 200}ms` }}>
                      <span className={`env-icon-wrap ${item.ok ? 'pop-in' : 'shake-in'}`} style={{ animationDelay: `${idx * 200 + 300}ms` }}>
                        {item.ok ? <CheckCircle size={18} /> : <XCircle size={18} />}
                      </span>
                      <span className="env-name">{item.name}</span>
                      <span className="env-ver">{item.ok ? item.version : t('env.not_installed')}</span>
                      {!item.ok && <span className="env-hint">{item.hint}</span>}
                      {item.installable && !installing && (
                        <button className="btn btn-sm" onClick={async () => {
                          setInstalling(item.name);
                          const r = await installTool(item.name);
                          setInstalling(null);
                          if (r.ok) runEnvCheck();
                        }}>{t('env.install')}</button>
                      )}
                      {installing === item.name && <span className="env-hint"><Loader size={14} className="spin" /> {t('env.installing')}</span>}
                    </div>
                  ))}
                </div>
                {envItems.every(i => i.ok) && (
                  <div className="env-success env-animate" style={{ animationDelay: `${envItems.length * 200 + 400}ms` }}>
                    <CheckCircle size={24} /> {t('env.all_pass')}
                  </div>
                )}
                {envItems.some(i => !i.ok) && !installing && (
                  <button className="btn" onClick={runEnvCheck} style={{ marginTop: 16 }}>{t('env.recheck')}</button>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {view === 'welcome' && (
        <WelcomeView
          pendingRestore={pendingRestore}
          onOpen={handleOpen}
          onCreate={handleCreateWorkspace}
          onRestore={(dir, cfg, tabs) => {
            setWsDir(dir);
            setWsConfig(cfg);
            setOpenTabs(tabs);
            setActiveTab(tabs[0] || null);
            setView('project');
          }}
          readWorkspace={readWorkspace}
        />
      )}

      {view === 'create-workspace' && (
        <main className="main-content center-view">
          <div className="wizard">
            <button className="wizard-back" onClick={() => setView('welcome')}>
              <ArrowLeft size={16} /> {t('wizard.back')}
            </button>
            <h2>{t('wizard.ws_title')}</h2>
            <p className="wizard-dir">{wsDir}</p>
            <div className="wizard-step">
              <label className="wizard-label">{t('wizard.ws_name_label')}</label>
              <input className="wizard-input" value={wsDisplayName} onChange={e => setWsDisplayName(e.target.value)}
                placeholder={t('wizard.ws_name_placeholder')} autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && wsDisplayName.trim()) handleFinishWorkspace(); }} />
              <button className="wizard-create-btn" style={{ width: '100%', marginTop: 16 }} disabled={!wsDisplayName.trim() || progressOpen} onClick={handleFinishWorkspace}>
                {t('wizard.next')}
              </button>
            </div>
          </div>
        </main>
      )}

      {view === 'add-project' && (
        <main className={`main-content ${projStep === 1 ? 'tpl-select-view' : 'center-view'}`}>
          <div className={`wizard${projStep === 1 ? ' wizard-tpl' : ''}`}>
            <button className="wizard-back" onClick={() => setView(wsConfig?.projects?.length ? 'project' : 'welcome')}>
              <ArrowLeft size={16} /> {t('wizard.back')}
            </button>
            <h2>{t('wizard.add_project')}</h2>
            <p className="wizard-dir">{wsDir}</p>

            {projStep === 1 && (
              <div className="wizard-step">
                <label className="wizard-label">选择模板</label>
                <div className="tpl-grid">
                  <div
                    className={`tpl-card${!wizardSelectedTpl ? ' tpl-card-selected' : ''}`}
                    onClick={() => { setWizardSelectedTpl(null); setProjType('hap'); }}
                  >
                    <div className="tpl-card-thumb">
                      <div className="tpl-card-placeholder"><Package size={24} /></div>
                    </div>
                    <div className="tpl-card-body">
                      <div className="tpl-card-code">空白</div>
                      <div className="tpl-card-name">空白项目</div>
                      <div className="tpl-card-desc">基础 HAP 框架，从零开始</div>
                    </div>
                  </div>
                  {wizardTemplates.map((tpl: any) => (
                    <div
                      key={tpl.id}
                      className={`tpl-card${wizardSelectedTpl?.id === tpl.id ? ' tpl-card-selected' : ''}`}
                      onClick={() => { setWizardSelectedTpl(tpl); setProjType('hap'); }}
                    >
                      <div className="tpl-card-thumb">
                        {tpl.thumbnail ? <img src={tpl.thumbnail.startsWith('http') ? tpl.thumbnail : `${import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3102'}${tpl.thumbnail}`} alt="" /> : <div className="tpl-card-placeholder"><LayoutTemplate size={24} /></div>}
                      </div>
                      <div className="tpl-card-body">
                        <div className="tpl-card-code">{tpl.templateCode}</div>
                        <div className="tpl-card-name">{tpl.name}</div>
                        <div className="tpl-card-desc">{tpl.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {projStep === 1 && (
              <button className="wizard-next wizard-next-fixed" onClick={() => setProjStep(2)}>{t('wizard.next')}</button>
            )}

            {projStep === 2 && (
              <div className="wizard-step">
                <label className="wizard-label">{t('wizard.id_label')}</label>
                <input className="wizard-input" value={projId} onChange={e => validateProjId(e.target.value.toLowerCase())}
                  placeholder="my-app" autoFocus onKeyDown={e => { if (e.key === 'Enter' && projId && !idError) handleFinishAddProject(); }} />
                {idError && <span className="wizard-error">{idError}</span>}
                <p className="wizard-hint">{t('wizard.id_hint')}</p>
                <div className="wizard-actions">
                  <button className="wizard-back-btn" onClick={() => setProjStep(1)}>{t('wizard.prev')}</button>
                  <button className="wizard-create-btn" disabled={!projId || !!idError || progressOpen} onClick={handleFinishAddProject}>
                    {t('wizard.create')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {view === 'project' && wsConfig && (() => {
        const activeProj = wsConfig.projects.find(p => p.id === activeTab);
        return (
          <main className="main-content project-view">
            <div className="proj-toolbar">
              <div className="proj-toolbar-left">
                <button className="proj-toolbar-btn" onClick={handleStartAddProject}><Plus size={14} /> {t('project.add')}</button>
                <button className="proj-toolbar-btn" disabled={!wsConfig.projects.length || openTabs.length >= wsConfig.projects.length} onClick={async () => {
                    const canCreate = typeof (window as any).hap?.window?.create === 'function';
                    if (!canCreate) {
                      setOpenProjOverlay(true);
                      return;
                    }
                    const projData = encodeURIComponent(JSON.stringify(wsConfig.projects));
                    const openedData = encodeURIComponent(JSON.stringify(openTabs));
                    try {
                      const r = await (window as any).hap?.window?.create?.({
                        route: `/open-project?projects=${projData}&opened=${openedData}`,
                        width: 380, height: 420, title: t('project.open'),
                        label: 'open-project', decorations: true, resizable: false, modal: true,
                        hiddenTitle: true, titleBarStyle: 'overlay',
                      });
                      if (!r) { setOpenProjOverlay(true); return; }
                      console.log('[open-project] child:', r);
                    } catch (e: any) {
                      console.error('[open-project] error:', e?.message || e);
                      setOpenProjOverlay(true);
                    }
                  }}>
                  <FolderOpen size={14} /> {t('project.open')}
                </button>
              </div>
              <button className="ws-server-status ws-clickable" onClick={() => { const p = getPorts(); console.log('[WS Dialog] ports:', p); setEditHttpPort(p.http); setEditWsPort(p.ws); setWsPopoverOpen(true); }}>
                <span className={`ws-dot ${wsRunning ? 'running' : ''}`} />
                WS :{getPorts().ws}
              </button>
              <Dialog.Root open={wsPopoverOpen} onOpenChange={setWsPopoverOpen}>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="dialog-content dialog-draggable" ref={initDragDialog}>
                    <Dialog.Title className="dialog-title dialog-drag-handle">{t('ws.settings')}</Dialog.Title>
                    <div className="dialog-body">
                      <div className="ws-popover-row">
                        <label>HTTP {t('ws.port')}</label>
                        <input type="number" className="ws-popover-input" value={editHttpPort} onChange={e => setEditHttpPort(Number(e.target.value))} />
                      </div>
                      <div className="ws-popover-row">
                        <label>WS {t('ws.port')}</label>
                        <input type="number" className="ws-popover-input" value={editWsPort} onChange={e => setEditWsPort(Number(e.target.value))} />
                      </div>
                    </div>
                    <p className="dialog-hint">{t('ws.restart_warn')}</p>
                    <div className="dialog-actions">
                      <button className="wizard-create-btn" onClick={async () => {
                        await restartServer(editHttpPort, editWsPort);
                        setWsPopoverOpen(false);
                      }}>{t('ws.restart')}</button>
                    </div>
                    <Dialog.Close asChild>
                      <button className="dialog-close"><X size={14} /></button>
                    </Dialog.Close>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>

            <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content dialog-draggable" ref={initDragDialog}>
                  <Dialog.Title className="dialog-title dialog-drag-handle">{t('workspace.settings')}</Dialog.Title>
                  <div className="dialog-body">
                    <label className="dialog-label">{t('wizard.ws_name_label')}</label>
                    <input className="wizard-input" value={wsNameDraft} onChange={e => setWsNameDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveSettings(); }} />
                    <label className="dialog-switch-row">
                      <span>{t('settings.auto_open')}</span>
                      <label className="pe-switch">
                        <input type="checkbox" checked={autoOpen} onChange={e => setAutoOpen(e.target.checked)} />
                        <span className="pe-slider" />
                      </label>
                    </label>
                  </div>
                  <div className="dialog-actions">
                    <button className="wizard-create-btn" onClick={handleSaveSettings}>{t('workspace.save')}</button>
                  </div>
                  <Dialog.Close asChild>
                    <button className="dialog-close"><X size={14} /></button>
                  </Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            {openTabs.length > 0 && (
              <div className="tab-bar">
                {openTabs.map(id => {
                  const p = wsConfig.projects.find(pp => pp.id === id);
                  return (
                    <div key={id} className={`tab-item ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                      {p?.type === 'hap' ? <Package size={12} /> : <Library size={12} />}
                      <span className="tab-label">{id}</span>
                      <button className="tab-close" onClick={e => { e.stopPropagation(); closeTab(id); }}><X size={10} /></button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="tab-content">
              {!activeProj && (
                <div className="empty-projects">{t('project.empty')}</div>
              )}
              {activeProj && (
                <ProjectEditor
                  key={activeProj.id}
                  projectId={activeProj.id}
                  projectType={activeProj.type}
                  workspaceDir={wsDir}
                  projectPath={activeProj.path}
                />
              )}
            </div>
          </main>
        );
      })()}

      <footer className="status-bar">
        <span className={`status-dot ${wsRunning ? (pluginConnected ? 'connected' : 'running') : ''}`} />
        {!wsRunning ? t("status.ws_stopped") : pluginConnected ? t("status.connected") : t("status.ws_ready")}
        <span style={{marginLeft:'auto',opacity:0.7,fontSize:11}}>WS :{getPorts().ws}</span>
      </footer>

      <ProgressDialog
        open={progressOpen}
        title={progressTitle}
        steps={progressSteps}
        logs={progressLogs}
        error={progressError}
        done={progressDone}
        doneLabel={t('progress.done')}
        waitingLabel={t('progress.waiting')}
        onClose={() => setProgressOpen(false)}
      />
      {toastMsg && <div className="toast-msg">{toastMsg}</div>}
      {openProjOverlay && wsConfig && (
        <div className="open-proj-overlay" onClick={() => setOpenProjOverlay(false)}>
          <div className="open-proj-panel" onClick={e => e.stopPropagation()}>
            <div className="open-proj-title">{t('project.open')}<button className="open-proj-close" onClick={() => setOpenProjOverlay(false)}><X size={14}/></button></div>
            <div className="open-proj-list">
              {wsConfig.projects.filter((p: any) => !openTabs.includes(p.id)).map((p: any) => (
                <div key={p.id} className="open-proj-item" onClick={() => { openProjectTab(p.id); setOpenProjOverlay(false); }}>
                  <Package size={16}/> <span>{p.displayName || p.id}</span>
                </div>
              ))}
              {wsConfig.projects.filter((p: any) => !openTabs.includes(p.id)).length === 0 && (
                <div className="open-proj-empty">{t('project.empty')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WelcomeView({ pendingRestore, onOpen, onCreate, onRestore, readWorkspace }: {
  pendingRestore: React.RefObject<{ dir: string; tabs: string[] } | null>;
  onOpen: () => void;
  onCreate: () => void;
  onRestore: (dir: string, cfg: WorkspaceConfig, tabs: string[]) => void;
  readWorkspace: (dir: string) => Promise<WorkspaceConfig | null>;
}) {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    const r = pendingRestore.current;
    if (!r) return;
    tried.current = true;
    pendingRestore.current = null;
    readWorkspace(r.dir).then(cfg => {
      if (cfg) {
        const validTabs = r.tabs.filter(id => cfg.projects?.some(p => p.id === id));
        onRestore(r.dir, cfg, validTabs);
      }
    });
  }, []);

  return (
    <main className="main-content center-view">
      <div className="welcome">
        <h2>{t('welcome.title')}</h2>
        <div className="welcome-actions">
          <button className="welcome-btn" onClick={onOpen}>
            <FolderOpen size={20} /><span>{t('workspace.open')}</span>
          </button>
          <button className="welcome-btn" onClick={onCreate}>
            <FilePlus size={20} /><span>{t('workspace.create')}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
