import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Check, ImageIcon, FolderOpen, Play, Square, Circle, RefreshCw } from 'lucide-react';
import { t } from './i18n';
import { readManifest, saveManifest, HapManifestData } from './scaffold';

interface Props {
  projectId: string;
  projectType: 'hap' | 'hpl';
  workspaceDir: string;
  projectPath?: string;
}

type PageId = 'info' | 'build' | 'build_win';
type ViteStatus = 'stopped' | 'starting' | 'running' | 'error';

function hal(mod: string, fn: string, params?: Record<string, any>): Promise<any> {
  return (window as any).hap?.hal?.(mod, fn, params || {});
}

export function ProjectEditor({ projectId, projectType, workspaceDir, projectPath }: Props) {
  const [manifest, setManifest] = useState<HapManifestData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('info');
  const projectDir = projectPath ? `${workspaceDir}/${projectPath}` : `${workspaceDir}/apps/${projectId}`;

  const [viteStatus, setViteStatus] = useState<ViteStatus>('stopped');
  const [vitePid, setVitePid] = useState<number | null>(null);
  const [viteLog, setViteLog] = useState<string[]>([]);
  const viteLogRef = useRef<HTMLDivElement>(null);
  const vitePidRef = useRef<number | null>(null);
  const detectedUrlRef = useRef<string | null>(null);
  const loadTriggeredRef = useRef(false);
  const manifestRef = useRef<HapManifestData | null>(null);
  const dirtyRef = useRef(false);
  const hostPidRef = useRef<number | null>(null);
  const hostAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHostAliveCheck = useCallback(() => {
    if (hostAliveTimerRef.current) clearInterval(hostAliveTimerRef.current);
    hostAliveTimerRef.current = setInterval(async () => {
      const pid = hostPidRef.current;
      const vitePid = vitePidRef.current;
      if (!pid || !vitePid) {
        if (hostAliveTimerRef.current) { clearInterval(hostAliveTimerRef.current); hostAliveTimerRef.current = null; }
        return;
      }
      try {
        const alive = await hal('process', 'is_running', { pid });
        if (!alive) {
          hal('process', 'kill', { pid: vitePid }).catch(() => {});
          setViteStatus('stopped');
          setVitePid(null);
          vitePidRef.current = null;
          hostPidRef.current = null;
          detectedUrlRef.current = null;
          loadTriggeredRef.current = false;
          if (hostAliveTimerRef.current) { clearInterval(hostAliveTimerRef.current); hostAliveTimerRef.current = null; }
        }
      } catch { /* HAL call failed — treat as host dead */ }
    }, 3000);
  }, []);

  useEffect(() => {
    setDirty(false);
    setSaved(false);
    setViteStatus('stopped');
    setVitePid(null);
    setViteLog([]);
    vitePidRef.current = null;
    detectedUrlRef.current = null;
    loadTriggeredRef.current = false;
    manifestRef.current = null;
    readManifest(projectDir).then(m => { if (m) { setManifest(m); manifestRef.current = m; } });
    const onExternalChange = (e: Event) => {
      const { manifest: m, root } = (e as CustomEvent).detail || {};
      if (m && (!root || root === projectDir) && !dirtyRef.current) {
        setManifest(m); manifestRef.current = m;
      }
    };
    const onRunnerDisconnected = (e: Event) => {
      const { appId } = (e as CustomEvent).detail || {};
      if (appId && manifestRef.current?.id === appId && vitePidRef.current) {
        hal('process', 'kill', { pid: vitePidRef.current }).catch(() => {});
        setViteStatus('stopped');
        setVitePid(null);
        vitePidRef.current = null;
        detectedUrlRef.current = null;
        loadTriggeredRef.current = false;
      }
    };
    window.addEventListener('devtools:manifest:changed', onExternalChange);
    window.addEventListener('devtools:runner:disconnected', onRunnerDisconnected);
    return () => {
      window.removeEventListener('devtools:manifest:changed', onExternalChange);
      window.removeEventListener('devtools:runner:disconnected', onRunnerDisconnected);
      if (hostAliveTimerRef.current) { clearInterval(hostAliveTimerRef.current); hostAliveTimerRef.current = null; }
      if (vitePidRef.current) {
        hal('process', 'kill', { pid: vitePidRef.current }).catch(() => {});
        vitePidRef.current = null;
      }
      hostPidRef.current = null;
    };
  }, [projectDir]);

  useEffect(() => {
    manifestRef.current = manifest;
    if (manifest && detectedUrlRef.current && !loadTriggeredRef.current) {
      triggerLoadApp(detectedUrlRef.current);
    }
  }, [manifest]);

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!vitePid) return;
    const outputId = setInterval(async () => {
      try {
        const out = await hal('process', 'read_output', { pid: vitePid });
        if (out?.stdout) out.stdout.split('\n').filter((l: string) => l.trim()).forEach((l: string) => {
          appendLog(l);
          tryDetectUrl(l);
        });
        if (out?.stderr) out.stderr.split('\n').filter((l: string) => l.trim()).forEach((l: string) => appendLog(`[stderr] ${l}`));
      } catch {}
    }, 500);
    const statusId = setInterval(async () => {
      try {
        const running = await hal('process', 'is_running', { pid: vitePid });
        if (!running) {
          setViteStatus('stopped');
          setVitePid(null);
          vitePidRef.current = null;
          detectedUrlRef.current = null;
          loadTriggeredRef.current = false;
          appendLog(t('run.stopped'));
        }
      } catch {}
    }, 3000);
    return () => { clearInterval(outputId); clearInterval(statusId); };
  }, [vitePid]);

  const appendLog = useCallback((line: string) => {
    setViteLog(prev => {
      const next = [...prev, `[${new Date().toLocaleTimeString()}] ${line}`];
      return next.length > 200 ? next.slice(-200) : next;
    });
    setTimeout(() => viteLogRef.current?.scrollTo(0, viteLogRef.current.scrollHeight), 50);
  }, []);

  const tryDetectUrl = useCallback((line: string) => {
    if (detectedUrlRef.current || loadTriggeredRef.current) return;
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
    const match = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\/?/);
    if (match) {
      detectedUrlRef.current = match[0].replace(/\/$/, '');
      triggerLoadApp(detectedUrlRef.current);
    }
  }, []);

  const triggerLoadApp = useCallback(async (url: string) => {
    if (loadTriggeredRef.current) { console.log('[triggerLoadApp] already triggered, skip'); return; }
    const m = manifestRef.current;
    if (!m) { console.log('[triggerLoadApp] no manifest yet'); return; }
    loadTriggeredRef.current = true;
    console.log('[triggerLoadApp] url=', url);

    const portMatch = url.match(/:(\d+)/);
    const port = portMatch ? Number(portMatch[1]) : 5173;
    const win: any = { ...(m.windows?.[0] || { width: 800, height: 600 }) };
    const hap = (window as any).hap;
    try {
      appendLog(`[load-app] launching dev-runner with --url ${url}`);
      const hostResult = await hap.system.openApp('hap-dev-runner', {
        entry: url,
        appId: m.id,
        name: m.name || m.id,
        devPort: port,
        manifestPath: projectDir + '/manifest.json',
        windowConfig: win
      });
      const hostPid = typeof hostResult === 'object' ? hostResult?.pid : (typeof hostResult === 'number' ? hostResult : undefined);
      appendLog(`[load-app] dev-runner launched (host PID: ${hostPid || 'unknown'})`);
      if (typeof hostPid === 'number') {
        hostPidRef.current = hostPid;
        startHostAliveCheck();
      }
    } catch (e: any) {
      appendLog(`[load-app] ERROR: ${e?.message || e}`);
    }
    appendLog(`[load-app] → ${url}`);
  }, [appendLog]);

  const startVite = useCallback(async () => {
    if (viteStatus === 'running' || viteStatus === 'starting') return;
    setViteStatus('starting');
    setViteLog([]);
    appendLog(t('run.starting'));
    try {
      const hasPkg = await hal('fs', 'exists', { path: `${projectDir}/package.json` });
      if (!hasPkg) {
        appendLog('静态项目，启动本地服务');
        const mp = `${projectDir}/manifest.json`;
        const mExists = await hal('fs', 'exists', { path: mp });
        if (!mExists) { setViteStatus('error'); appendLog('manifest.json 不存在'); return; }
        const port = 9100 + Math.floor(Math.random() * 900);
        const handle = await hal('process', 'spawn', {
          command: 'python3',
          args: ['-m', 'http.server', String(port)],
          cwd: projectDir,
        });
        const pid = handle?.pid || handle;
        if (typeof pid === 'number') {
          setVitePid(pid); vitePidRef.current = pid;
          setViteStatus('running');
          appendLog(`已启动本地服务 (PID: ${pid}, port: ${port})`);
          detectedUrlRef.current = `http://localhost:${port}`;
          setTimeout(() => triggerLoadApp(`http://localhost:${port}`), 800);
        } else {
          setViteStatus('error');
          appendLog('启动失败');
        }
        return;
      }
      const npmResult = await hal('process', 'which', { command: 'pnpm' });
      const cmd = npmResult ? 'pnpm' : 'npx';
      const args = cmd === 'pnpm' ? ['dev'] : ['vite'];
      appendLog(`$ ${cmd} ${args.join(' ')}`);
      const handle = await hal('process', 'spawn', { command: cmd, args, cwd: projectDir });
      const pid = handle?.pid || handle;
      if (typeof pid === 'number') {
        setVitePid(pid);
        vitePidRef.current = pid;
        setViteStatus('running');
        appendLog(`${t('run.started')} (PID: ${pid})`);
      } else {
        setViteStatus('error');
        appendLog(t('run.error') + ': unexpected spawn result');
      }
    } catch (e: any) {
      setViteStatus('error');
      appendLog(`${t('run.error')}: ${e?.message || e}`);
    }
  }, [viteStatus, projectDir, appendLog]);

  const stopVite = useCallback(async () => {
    if (!vitePid) return;
    appendLog(t('run.stopping'));
    try {
      const appId = manifestRef.current?.id;
      if (appId) {
        try { await (window as any).hap?.system?.stopApp?.(appId); } catch {}
      }
      await hal('process', 'kill', { pid: vitePid });
      setViteStatus('stopped');
      setVitePid(null);
      vitePidRef.current = null;
      detectedUrlRef.current = null;
      loadTriggeredRef.current = false;
      appendLog(t('run.stopped'));
    } catch (e: any) {
      appendLog(`${t('run.error')}: ${e?.message || e}`);
    }
  }, [vitePid, appendLog]);

  const update = useCallback((fn: (m: HapManifestData) => HapManifestData) => {
    setManifest(prev => {
      if (!prev) return prev;
      setDirty(true);
      setSaved(false);
      return fn({ ...prev });
    });
  }, []);

  const handleSave = async () => {
    if (!manifest) return;
    await saveManifest(projectDir, manifest);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!manifest) return <div className="pe-loading">Loading...</div>;

  const pages: { id: PageId; label: string }[] = [
    { id: 'info', label: 'section.info' },
    { id: 'build', label: 'section.build' },
    ...(projectType === 'hap' ? [{ id: 'build_win' as PageId, label: 'section.window' }] : []),
  ];

  return (
    <div className="project-editor-root">
      <nav className="pe-sidebar">
        {pages.map(p => (
          <button key={p.id}
            className={`pe-sidebar-item ${activePage === p.id ? 'active' : ''}`}
            onClick={() => setActivePage(p.id)}>
            {t(p.label)}
          </button>
        ))}
        <div className="pe-sidebar-spacer" />
        <button className={`pe-save-btn ${dirty ? 'dirty' : ''} ${saved ? 'saved' : ''}`}
          disabled={!dirty} onClick={handleSave}>
          {saved ? <><Check size={12} /> {t('project.saved')}</> : <><Save size={12} /> {t('project.save')}</>}
        </button>
      </nav>
      <div className="pe-page-area">
        {activePage === 'info' && <InfoPage
          manifest={manifest} projectDir={projectDir} projectType={projectType}
          update={update}
          viteStatus={viteStatus} vitePid={vitePid} viteLog={viteLog}
          viteLogRef={viteLogRef} startVite={startVite} stopVite={stopVite}
          detectedUrlRef={detectedUrlRef} appendLog={appendLog} manifestRef={manifestRef}
        />}
        {activePage === 'build' && <BuildPage
          manifest={manifest} projectType={projectType} update={update} projectDir={projectDir}
        />}
        {activePage === 'build_win' && <WindowPage manifest={manifest} />}
      </div>
    </div>
  );
}

/* ---- 项目信息页 ---- */
function InfoPage({ manifest, projectDir, projectType, update, viteStatus, vitePid, viteLog, viteLogRef, startVite, stopVite, detectedUrlRef, appendLog, manifestRef }: {
  manifest: HapManifestData; projectDir: string; projectType: string;
  update: (fn: (m: HapManifestData) => HapManifestData) => void;
  viteStatus: ViteStatus; vitePid: number | null; viteLog: string[];
  viteLogRef: React.RefObject<HTMLDivElement | null>; startVite: () => void; stopVite: () => void;
  detectedUrlRef: React.RefObject<string | null>; appendLog: (msg: string) => void; manifestRef: React.RefObject<HapManifestData | null>;
}) {
  return (
    <div className="pe-page">
      <div className="pe-two-col">
        <div className="pe-col">
          <h4 className="pe-sub-title"><FolderOpen size={12} /> {t('section.info_dir')}</h4>
          <div className="pe-grid">
            <label>{t('project.dir')}</label>
            <input value={projectDir} disabled className="pe-input disabled" />
            <label>{t('project.id')}</label>
            <input value={manifest.id} disabled className="pe-input disabled" />
            <label>{t('project.type')}</label>
            <input value={manifest.hapType} disabled className="pe-input disabled" />
          </div>
        </div>
        <div className="pe-col">
          <h4 className="pe-sub-title"><Play size={12} /> {t('section.run')}</h4>
          <div className="pe-run-area">
            <div className="pe-run-toolbar">
              <span className={`pe-run-status ${viteStatus}`}>
                <Circle size={8} fill={viteStatus === 'running' ? '#22c55e' : viteStatus === 'starting' ? '#eab308' : viteStatus === 'error' ? '#ef4444' : '#6b7280'} />
                {t(`run.status_${viteStatus}`)}
              </span>
              {vitePid && <span className="pe-run-pid">PID: {vitePid}</span>}
              <div className="pe-run-btns">
                {viteStatus === 'stopped' || viteStatus === 'error' ? (
                  <button className="pe-run-btn start" onClick={startVite}>
                    <Play size={12} /> {t('run.start')}
                  </button>
                ) : viteStatus === 'running' ? (
                  <>
                    <button className="pe-run-btn stop" onClick={stopVite}>
                      <Square size={10} /> {t('run.stop')}
                    </button>
                    <button className="pe-run-btn" onClick={async () => {
                      const url = detectedUrlRef.current;
                      if (!url) { appendLog('[test] no URL detected yet'); return; }
                      const m = manifestRef.current;
                      if (!m) { appendLog('[test] no manifest loaded'); return; }
                      const portMatch = url.match(/:(\d+)/);
                      const port = portMatch ? Number(portMatch[1]) : 5173;
                      const win: any = { ...(m.windows?.[0] || { width: 800, height: 600 }) };
                      try {
                        await (window as any).hap.system.openApp('hap-dev-runner', {
                          entry: url,
                          appId: m.id,
                          name: m.name || m.id,
                          devPort: port,
                          manifestPath: projectDir + '/manifest.json',
                          windowConfig: win
                        });
                        appendLog('[test] dev-runner launched');
                      } catch (e: any) { appendLog(`[test] ERROR: ${e?.message || e}`); }
                    }} style={{ marginLeft: 4 }}>
                      <RefreshCw size={12} /> Dev Runner
                    </button>
                  </>
                ) : (
                  <button className="pe-run-btn" disabled>
                    <RefreshCw size={12} className="pe-spin" /> {t('run.starting')}
                  </button>
                )}
              </div>
            </div>
            <div className="pe-run-log" ref={viteLogRef}>
              {viteLog.length === 0 && <p className="pe-run-hint">{t('run.hint')}</p>}
              {viteLog.map((line, i) => <div key={i} className="pe-log-line">{line}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div className="pe-subsection">
        <h4 className="pe-sub-title">{t('section.deps')}</h4>
        <div className="pe-deps-list">
          {(!Array.isArray(manifest.dependencies) || manifest.dependencies.length === 0) && (
            <p className="pe-run-hint">{t('deps.empty')}</p>
          )}
          {(Array.isArray(manifest.dependencies) ? manifest.dependencies : []).map((dep, i) => (
            <div key={i} className="pe-dep-row readonly">
              <span className="pe-dep-name">{dep.name || dep.uuid}</span>
              <span className="pe-dep-uuid">{dep.uuid}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconPreview({ projectDir, icon }: { projectDir: string; icon: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const p = `${projectDir}/public/${icon}`;
    hal('fs', 'read_binary', { path: p }).then((b64: string) => {
      if (b64) setSrc(`data:image/png;base64,${b64}`);
    }).catch(() => setSrc(''));
  }, [projectDir, icon]);
  if (!src) return null;
  return <img src={src} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover' }} />;
}

/* ---- 编译配置页 ---- */
function BuildPage({ manifest, projectType, update, projectDir }: {
  manifest: HapManifestData; projectType: string;
  update: (fn: (m: HapManifestData) => HapManifestData) => void;
  projectDir: string;
}) {
  return (
    <div className="pe-page">
      <div className="pe-subsection">
        <h4 className="pe-sub-title">{t('section.basic')}</h4>
        <div className="pe-grid">
          <label>{t('project.name')}</label>
          <input value={manifest.name} className="pe-input"
            onChange={e => update(m => ({ ...m, name: e.target.value }))} />
          {projectType === 'hap' && (
            <>
              <label>{t('project.icon')}</label>
              <div className="pe-icon-row">
                {manifest.icon && <IconPreview projectDir={projectDir} icon={manifest.icon} />}
                <input value={manifest.icon || ''} className="pe-input" readOnly placeholder="icon.png" />
                <button className="pe-icon-btn" onClick={async () => {
                  try {
                    const r = await (window as any).hap?.hal?.('dialog', 'open_file', {
                      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'svg', 'ico'] }]
                    });
                    const p = typeof r === 'string' ? r : r?.path || '';
                    if (p) {
                      const basename = p.replace(/.*[/\\]/, '');
                      const pubDir = projectDir + '/public';
                      await hal('fs', 'create_dir', { path: pubDir }).catch(() => {});
                      await hal('fs', 'copy', { source: p, dest: pubDir + '/' + basename });
                      update(m => ({ ...m, icon: basename }));
                    }
                  } catch {}
                }}><ImageIcon size={14} /></button>
              </div>
            </>
          )}
          <label>{t('project.version')}</label>
          <input value={manifest.version} className="pe-input"
            onChange={e => update(m => ({ ...m, version: e.target.value }))} />
          <label>{t('project.description')}</label>
          <input value={manifest.description} className="pe-input"
            onChange={e => update(m => ({ ...m, description: e.target.value }))} />
          <label>{t('project.company')}</label>
          <input value={(manifest as any).company || ''} className="pe-input"
            onChange={e => update(m => ({ ...m, company: e.target.value }))} />
          <label>{t('project.author')}</label>
          <input value={manifest.author} className="pe-input"
            onChange={e => update(m => ({ ...m, author: e.target.value }))} />
          <label>{t('project.license')}</label>
          <input value={manifest.license} className="pe-input"
            onChange={e => update(m => ({ ...m, license: e.target.value }))} />
        </div>
      </div>

      {projectType === 'hap' && (
        <div className="pe-subsection">
          <h4 className="pe-sub-title">{t('section.advanced')}</h4>
          <div className="pe-grid">
            <label>{t('project.single_instance')}</label>
            <label className="pe-switch">
              <input type="checkbox" checked={!!manifest.singleInstance}
                onChange={e => update(m => ({ ...m, singleInstance: e.target.checked }))} />
              <span className="pe-slider" />
            </label>
          </div>
        </div>
      )}

    </div>
  );
}

function WindowPage({ manifest }: { manifest: HapManifestData }) {
  return (
    <div className="pe-page">
      <div className="pe-subsection">
        <h4 className="pe-sub-title">{t('section.window')} <span className="pe-readonly-badge">{t('project.readonly')}</span></h4>
        <p className="pe-run-hint" style={{margin: '0 0 8px 0'}}>{t('project.win_hint')}</p>
        {manifest.windows && manifest.windows.length > 0
          ? <WindowList windows={manifest.windows} />
          : <p className="pe-run-hint">{t('project.no_windows')}</p>}
      </div>
    </div>
  );
}

function WindowList({ windows }: { windows: any[] }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  return (
    <div className="pe-win-list">
      {windows.map((w, i) => (
        <div key={i} className="pe-win-item">
          <button className={`pe-win-header ${expanded === i ? 'open' : ''}`}
            onClick={() => setExpanded(expanded === i ? null : i)}>
            <span className="pe-win-arrow">{expanded === i ? '▾' : '▸'}</span>
            <span>{w.label || `Window ${i}`}</span>
          </button>
          {expanded === i && (
            <div className="pe-grid" style={{padding: '8px 12px'}}>
              <label>{t('project.win_label')}</label>
              <input value={w.label || ''} className="pe-input disabled" disabled />
              <label>{t('project.win_title')}</label>
              <input value={w.title || ''} className="pe-input disabled" disabled />
              <label>{t('project.win_width')}</label>
              <input type="number" value={w.width || 800} className="pe-input disabled" disabled />
              <label>{t('project.win_height')}</label>
              <input type="number" value={w.height || 600} className="pe-input disabled" disabled />
              <label>{t('project.win_resizable')}</label>
              <label className="pe-switch"><input type="checkbox" checked={!!w.resizable} disabled /><span className="pe-slider" /></label>
              <label>{t('project.win_url')}</label>
              <input value={w.url || ''} className="pe-input disabled" disabled />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
