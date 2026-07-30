import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Minus,
  Monitor, Palette, Settings2, Apple, Pin, PinOff, Play
} from 'lucide-react';
import { t, setLocale } from './i18n';
import { initTheme } from './theme';
import { connectDevTools, disconnectDevTools, onStatus, onMessage, sendMessage } from './ws-client';

interface GroupProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Group({ title, icon, defaultOpen = true, children }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="settings-group">
      <div className="group-header" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="group-icon">{icon}</span>
        <span>{title}</span>
      </div>
      {open && <div className="group-body">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-value">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input className="settings-input" type="number"
      value={value} onChange={e => onChange(+e.target.value)} />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />;
}

const isMac = navigator.platform.toUpperCase().includes('MAC');
const isWin = navigator.platform.toUpperCase().includes('WIN');
const currentOS: 'macos' | 'windows' | 'linux' = isMac ? 'macos' : isWin ? 'windows' : 'linux';
const NORMAL_W = 278, NORMAL_H = 780;
const MINI_SIZE = 120;
const TARGET = 'main';

interface Props {
  devPort: number;
  appId: string;
  manifestPath: string;
}

export function SettingsPanel({ devPort, appId, manifestPath }: Props) {
  const [miniMode, setMiniMode] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [minW, setMinW] = useState(400);
  const [minH, setMinH] = useState(300);
  const [maxW, setMaxW] = useState(0);
  const [maxH, setMaxH] = useState(0);
  const [posX, setPosX] = useState(100);
  const [posY, setPosY] = useState(100);
  const [decorations, setDecorations] = useState(true);
  const [resizable, setResizable] = useState(true);
  const [maximizable, setMaximizable] = useState(true);
  const [minimizable, setMinimizable] = useState(true);
  const [closable, setClosable] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [titleBarStyle, setTitleBarStyle] = useState('standard');
  const [hiddenTitle, setHiddenTitle] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [shadow, setShadow] = useState(true);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [icon, setIcon] = useState('');
  const [minEnabled, setMinEnabled] = useState(true);
  const [maxEnabled, setMaxEnabled] = useState(false);
  const [trafficX, setTrafficX] = useState(13);
  const [trafficY, setTrafficY] = useState(24);
  const [startPosition, setStartPosition] = useState<'center' | 'custom'>('center');
  const [startState, setStartState] = useState<'normal' | 'minimized' | 'maximized' | 'fullscreen'>('normal');
  const [opacity, setOpacity] = useState(100);
  const [skipTaskbar, setSkipTaskbar] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('');
  const [vibrancy, setVibrancy] = useState('');
  const [iconPreview, setIconPreview] = useState('');
  const [previewPlatform, setPreviewPlatform] = useState<'macos' | 'windows' | 'linux'>(currentOS);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherWindowsRef = useRef<any[]>([]);

  const hap = (window as any).hap;

  const changePlatform = useCallback((p: 'macos' | 'windows' | 'linux') => {
    setPreviewPlatform(p);
    const shouldShow = !decorations || titleBarStyle !== 'standard';
    if (shouldShow) {
      hap?.window?.postMessage?.('main', { type: '__platform_overlay__', platform: p, titleBarStyle, title, icon });
      if (p === 'macos') {
        hap?.window?.setDecorations?.(true, TARGET);
      } else {
        hap?.window?.setDecorations?.(false, TARGET);
      }
    }
  }, [hap, titleBarStyle, decorations, title, icon]);

  const unmountedRef = useRef(false);
  const manifestLoadedRef = useRef(false);
  const loadManifest = useCallback(async () => {
    if (!manifestPath) { console.error('[settings] loadManifest: manifestPath is empty'); return; }
    try {
      console.error('[settings] loadManifest: reading', manifestPath);
      const content = await hap?.fs?.readTextFile?.(manifestPath);
      if (!content || typeof content !== 'string') {
        console.error('[settings] loadManifest: content invalid', typeof content, content);
        return;
      }
      manifestLoadedRef.current = true;
      applyManifest(JSON.parse(content));
    } catch (e: any) {
      console.error('[settings] loadManifest failed:', e?.message || e);
    }
  }, [manifestPath, hap]);

  const applyManifest = (manifest: any) => {
    const win = manifest.windows?.[0] || {};
    otherWindowsRef.current = (manifest.windows || []).slice(1);
    if (win.width) setWidth(win.width);
    if (win.height) setHeight(win.height);
    if (win.minWidth) { setMinW(win.minWidth); setMinEnabled(true); }
    if (win.minHeight) setMinH(win.minHeight);
    if (win.maxWidth) { setMaxW(win.maxWidth); setMaxEnabled(true); }
    if (win.maxHeight) setMaxH(win.maxHeight);
    if (!win.minWidth && !win.minHeight) setMinEnabled(false);
    if (!win.maxWidth && !win.maxHeight) setMaxEnabled(false);
    if (win.title) setTitle(win.title);
    if (win.decorations !== undefined) setDecorations(win.decorations);
    if (win.resizable !== undefined) setResizable(win.resizable);
    if (win.maximizable !== undefined) setMaximizable(win.maximizable);
    if (win.minimizable !== undefined) setMinimizable(win.minimizable);
    if (win.closable !== undefined) setClosable(win.closable);
    if (win.alwaysOnTop !== undefined) setAlwaysOnTop(win.alwaysOnTop);
    if (win.titleBarStyle) {
      const mapped = win.titleBarStyle === 'overlay' ? 'custom' : win.titleBarStyle;
      setTitleBarStyle(mapped);
    }
    if (win.hiddenTitle !== undefined) setHiddenTitle(win.hiddenTitle);
    if (win.transparent !== undefined) setTransparent(win.transparent);
    if (win.shadow !== undefined) setShadow(win.shadow);
    if (win.backgroundColor) setBgColor(win.backgroundColor);
    if (win.icon) setIcon(win.icon);
    if (win.x !== undefined && win.y !== undefined) {
      setStartPosition('custom');
      setPosX(win.x);
      setPosY(win.y);
    } else {
      setStartPosition('center');
    }
    if (win.startState) setStartState(win.startState);
    if (win.opacity !== undefined) setOpacity(win.opacity);
    if (win.skipTaskbar !== undefined) setSkipTaskbar(win.skipTaskbar);
    if (win.aspectRatio) setAspectRatio(win.aspectRatio);
    if (win.vibrancy) setVibrancy(win.vibrancy);
    if (win.trafficLightPosition) {
      if (win.trafficLightPosition.x !== undefined) setTrafficX(win.trafficLightPosition.x);
      if (win.trafficLightPosition.y !== undefined) setTrafficY(win.trafficLightPosition.y);
    }
    if (win.macos) {
      if (win.macos.vibrancy) setVibrancy(win.macos.vibrancy);
      if (win.macos.trafficLightPosition) {
        if (win.macos.trafficLightPosition.x !== undefined) setTrafficX(win.macos.trafficLightPosition.x);
        if (win.macos.trafficLightPosition.y !== undefined) setTrafficY(win.macos.trafficLightPosition.y);
      }
    }
    if (manifest.name) setTitle(prev => prev || manifest.name);
    if (manifest.icon) setIcon(prev => prev || manifest.icon);

    syncToMainWindow(win, manifest);

    const shouldShowOverlay = !win.decorations || (win.titleBarStyle && win.titleBarStyle !== 'standard');
    if (shouldShowOverlay) {
      const mappedStyle = win.titleBarStyle === 'overlay' ? 'custom' : (win.titleBarStyle || 'custom');
      hap?.window?.postMessage?.('main', {
        type: '__platform_overlay__',
        platform: currentOS,
        titleBarStyle: mappedStyle,
        title: win.title || manifest.name || '',
        icon: win.icon || manifest.icon || ''
      });
    }
  };

  const syncToMainWindow = (win: any, manifest: any) => {
    const t = TARGET;
    const title = win.title || manifest.name || '';
    if (title) {
      hap?.window?.setTitle?.(title, t);
      hap?.window?.postMessage?.(t, { type: '__set_document_title__', title });
    }
    if (win.width && win.height) hap?.window?.setSize?.(win.width, win.height, t);
    if (win.minWidth && win.minHeight) hap?.window?.setMinSize?.(win.minWidth, win.minHeight, t);
    if (win.maxWidth && win.maxHeight) hap?.window?.setMaxSize?.(win.maxWidth, win.maxHeight, t);
    if (win.resizable !== undefined) hap?.window?.setResizable?.(win.resizable, t);
    if (win.maximizable !== undefined) hap?.window?.setMaximizable?.(win.maximizable, t);
    if (win.minimizable !== undefined) hap?.window?.setMinimizable?.(win.minimizable, t);
    if (win.closable !== undefined) hap?.window?.setClosable?.(win.closable, t);
    if (win.alwaysOnTop !== undefined) hap?.window?.setAlwaysOnTop?.(win.alwaysOnTop, t);
    if (win.titleBarStyle) {
      const mapped = win.titleBarStyle === 'overlay' ? 'custom' : win.titleBarStyle;
      hap?.window?.setTitleBarStyle?.(mapped, t);
    }
    if (win.decorations !== undefined && win.titleBarStyle !== 'custom' && win.titleBarStyle !== 'overlay') {
      hap?.window?.setDecorations?.(win.decorations, t);
    }
    if (win.hiddenTitle !== undefined) hap?.window?.setHiddenTitle?.(win.hiddenTitle, t);
    if (win.shadow !== undefined) hap?.window?.setShadow?.(win.shadow, t);
    if (win.opacity !== undefined) hap?.window?.setOpacity?.(win.opacity, t);
    if (win.icon || manifest.icon) hap?.window?.setIcon?.(win.icon || manifest.icon, t);
  };

  const buildFullWindow = useCallback((overrides: Record<string, any>) => {
    const win: Record<string, any> = {
      width, height, minWidth: minW, minHeight: minH,
      title, decorations, resizable, maximizable, minimizable, closable,
      alwaysOnTop, titleBarStyle, hiddenTitle, transparent, shadow,
    };
    if (maxEnabled && maxW) win.maxWidth = maxW;
    if (maxEnabled && maxH) win.maxHeight = maxH;
    if (!minEnabled) { win.minWidth = 0; win.minHeight = 0; }
    if (bgColor && bgColor !== '#ffffff') win.backgroundColor = bgColor;
    if (icon) win.icon = icon;
    if (startPosition === 'custom') { win.x = posX; win.y = posY; }
    else win.center = true;
    if (startState !== 'normal') win.startState = startState;
    if (opacity < 100) win.opacity = opacity;
    if (skipTaskbar) win.skipTaskbar = true;
    if (aspectRatio) win.aspectRatio = aspectRatio;
    if (trafficX !== 13 || trafficY !== 24 || vibrancy) {
      win.macos = {};
      if (trafficX !== 13 || trafficY !== 24) win.macos.trafficLightPosition = { x: trafficX, y: trafficY };
      if (vibrancy) win.macos.vibrancy = vibrancy;
    }
    return { ...win, ...overrides };
  }, [width, height, minW, minH, maxW, maxH, maxEnabled, minEnabled, title, decorations, resizable, maximizable, minimizable, closable, alwaysOnTop, titleBarStyle, hiddenTitle, transparent, shadow, bgColor, icon, startPosition, posX, posY, startState, opacity, skipTaskbar, aspectRatio, vibrancy, trafficX, trafficY]);

  const savingRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const saveToManifestRef = useRef<(u: Record<string, any>) => void>(() => {});
  const saveToManifest = useCallback((windowUpdates: Record<string, any>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!manifestPath || savingRef.current) return;
      savingRef.current = true;
      try {
        const raw = await hap?.fs?.readTextFile?.(manifestPath);
        if (!raw || typeof raw !== 'string') return;
        const current = JSON.parse(raw);
        const allWindows = [buildFullWindow(windowUpdates), ...otherWindowsRef.current];
        current.windows = allWindows;
        await hap?.fs?.writeTextFile?.(manifestPath, JSON.stringify(current, null, 2));
      } catch (e: any) {
        console.error('[settings] saveToManifest failed:', e?.message || e);
      } finally { savingRef.current = false; lastSavedAtRef.current = Date.now(); }
    }, 300);
  }, [buildFullWindow, manifestPath, hap]);
  saveToManifestRef.current = saveToManifest;
  const suppressRef = useRef(0);

  const evalCallbacks = useRef<Map<string, (result: any) => void>>(new Map());

  const handleApiRequest = async (requestId: string, action: string, params?: any) => {
    await new Promise(r => setTimeout(r, 0));
    const TARGET = 'main';
    let data: any = {};
    try {
      if (action === 'get_bounds') {
        const pos = await hap?.window?.getPosition?.(TARGET) || { x: 0, y: 0 };
        const size = await hap?.window?.getSize?.(TARGET) || { width: 0, height: 0 };
        data = { x: pos.x, y: pos.y, width: size.width, height: size.height };
      } else if (action === 'eval') {
        const evalId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const result = await new Promise<any>((resolve) => {
          const timer = setTimeout(() => { evalCallbacks.current.delete(evalId); resolve({ error: 'eval timeout' }); }, 8000);
          evalCallbacks.current.set(evalId, (r) => { clearTimeout(timer); resolve(r); });
          hap?.window?.postMessage?.(TARGET, { type: '__eval_request__', requestId: evalId, code: params?.code || '' });
        });
        data = { result };
      } else if (action === 'screenshot') {
        const dataUrl: string = await hap?.window?.screenshot?.(params?.label || 'main') || '';
        if (dataUrl && dataUrl.startsWith('data:image/')) {
          const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          data = { base64: b64 };
        } else {
          data = { error: dataUrl || 'screenshot failed' };
        }
      } else if (action === 'resize') {
        await hap?.window?.setSize?.(params.width, params.height, TARGET);
        data = { success: true };
      } else if (action === 'move') {
        await hap?.window?.setPosition?.(params.x, params.y, TARGET);
        data = { success: true };
      } else {
        data = { error: `unknown action: ${action}` };
      }
    } catch (e: any) {
      data = { error: e?.message || 'unknown error' };
    }
    sendMessage({ type: 'api:response', requestId, data });
  };

  useEffect(() => {
    initTheme();
    document.documentElement.classList.add('settings-page');
    loadManifest();
    const offStatus = onStatus(() => {});
    const offMsg = onMessage((msg: any) => {
      if (msg.type === 'devtools:shutdown') {
        try { (window as any).__HOST_IPC__?.('window_close', { __wl: 'main' }); } catch {}
        return;
      }
      if (msg.type === 'locale' && msg.locale) {
        setLocale(msg.locale);
        window.location.reload();
      }
      if (msg.type === 'manifest:changed' && msg.manifest) {
        if (Date.now() - lastSavedAtRef.current < 2000) return;
        manifestLoadedRef.current = true;
        applyManifest(msg.manifest);
        syncToMainWindow(msg.manifest.windows?.[0] || {}, msg.manifest);
      }
      if (msg.type === 'api:request' && msg.requestId) {
        handleApiRequest(msg.requestId, msg.action, msg.params);
      }
    });
    connectDevTools('runner', appId, manifestPath);

    const evalMsgId = hap?.event?.on?.('__window_message__', (data: any) => {
      if (data?.type === '__eval_response__' && data.requestId) {
        const cb = evalCallbacks.current.get(data.requestId);
        if (cb) { evalCallbacks.current.delete(data.requestId); cb(data.result); }
      }
    });

    const resizeId = hap?.event?.on?.('window:resized', (ev: any) => {
      if (ev.label !== 'main') return;
      if (Date.now() - suppressRef.current < 300) return;
      setWidth(Math.round(ev.width));
      setHeight(Math.round(ev.height));
      saveToManifestRef.current({ width: Math.round(ev.width), height: Math.round(ev.height) });
    });
    const moveId = hap?.event?.on?.('window:moved', (ev: any) => {
      if (ev.label !== 'main') return;
      if (Date.now() - suppressRef.current < 300) return;
      setPosX(Math.round(ev.x));
      setPosY(Math.round(ev.y));
      saveToManifestRef.current({ x: Math.round(ev.x), y: Math.round(ev.y) });
    });

    hap?.window?.getSize?.('main').then((s: any) => {
      if (s && !manifestLoadedRef.current) { setWidth(Math.round(s.width)); setHeight(Math.round(s.height)); }
    });
    hap?.window?.getPosition?.('main').then((p: any) => {
      if (p && !manifestLoadedRef.current) { setPosX(Math.round(p.x)); setPosY(Math.round(p.y)); }
    });

    return () => {
      unmountedRef.current = true;
      offStatus(); offMsg();
      disconnectDevTools();
      if (evalMsgId !== undefined) hap?.event?.off?.('__window_message__', evalMsgId);
      if (resizeId !== undefined) hap?.event?.off?.('window:resized', resizeId);
      if (moveId !== undefined) hap?.event?.off?.('window:moved', moveId);
    };
  }, [loadManifest, appId]);

  const toggleMini = () => {
    if (miniMode) {
      setMiniMode(false);
      hap?.window?.setSize?.(NORMAL_W, NORMAL_H);
    } else {
      setMiniMode(true);
      hap?.window?.setSize?.(MINI_SIZE, MINI_SIZE);
    }
  };

  const startConstrainedDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select')) return;
    e.preventDefault();
    const startMX = e.screenX, startMY = e.screenY;
    const winX = e.screenX - e.clientX, winY = e.screenY - e.clientY;
    const sw = window.screen.availWidth, sh = window.screen.availHeight;
    const ow = window.outerWidth || NORMAL_W, oh = window.outerHeight || NORMAL_H;
    const onMove = (ev: MouseEvent) => {
      let nx = winX + (ev.screenX - startMX), ny = winY + (ev.screenY - startMY);
      if (nx < 0) nx = 0; if (ny < 0) ny = 0;
      if (nx + ow > sw) nx = sw - ow;
      if (ny + oh > sh) ny = sh - oh;
      hap?.window?.setPosition?.(nx, ny);
    };
    const onUp = () => document.removeEventListener('mousemove', onMove);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  };

  if (miniMode) {
    return (
      <div className="mini-wrap">
        <div className="mini-ball" onMouseDown={(e) => { e.preventDefault(); toggleMini(); }}
          title={t('settings.title')}>
          <Settings2 size={22} />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-root">
      <div className="settings-header" onMouseDown={startConstrainedDrag}>
        <span>{t('settings.title')}: {appId.split('.').pop()}</span>
        <div className="settings-header-actions" style={{ display: 'flex', gap: 2 }}>
          <button className={`header-icon-btn${pinned ? ' pinned-active' : ''}`} onClick={() => {
              const next = !pinned;
              setPinned(next);
              hap?.window?.setAlwaysOnTop?.(next);
            }}
            title={pinned ? 'Unpin' : 'Pin'}>
            {pinned ? <PinOff size={11} /> : <Pin size={11} />}
          </button>
          <button className="header-icon-btn" onClick={toggleMini} title="Mini">
            <Minus size={11} />
          </button>
        </div>
      </div>
      <div className="settings-body">
        <div className="platform-bar">
          <span className="platform-label">{t('platform.current')}: {currentOS === 'macos' ? 'macOS' : currentOS === 'windows' ? 'Windows' : 'Linux'}</span>
          <select className="settings-input platform-select" value={previewPlatform}
            onChange={e => changePlatform(e.target.value as typeof previewPlatform)}>
            <option value="macos">macOS</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
        </div>
        <Group title={t('group.basic')} icon={<Monitor size={12} />}>
          <Row label={t('prop.title')}>
            <input className="settings-input" value={title} onChange={e => {
              const v = e.target.value;
              setTitle(v);
              hap?.window?.setTitle?.(v, TARGET);
              saveToManifest({ title: v });
            }} />
          </Row>
          <Row label={t('prop.icon')}>
            {iconPreview && <img src={iconPreview} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover' }} />}
            <span className="settings-input settings-input-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{icon || '—'}</span>
            <label className="settings-action-btn" style={{ margin: 0, padding: '2px 6px', cursor: 'pointer', fontSize: 10 }}>
              ↑
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  setIcon(f.name);
                  setIconPreview(URL.createObjectURL(f));
                  hap?.window?.setIcon?.(f.name, TARGET);
                  saveToManifest({ icon: f.name });
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const b64 = (reader.result as string).split(',')[1];
                    if (manifestPath) {
                      const dir = manifestPath.replace(/\/[^/]+$/, '');
                      const pubDir = dir + '/public';
                      try { await hap?.hal?.('fs', 'mkdir', { path: pubDir }); } catch {}
                      await hap?.hal?.('fs', 'write_binary', { path: pubDir + '/' + f.name, data: b64 });
                    }
                  };
                  reader.readAsDataURL(f);
                }
                e.target.value = '';
              }} />
            </label>
            {icon && <button className="settings-action-btn" style={{ margin: 0, padding: '2px 6px', fontSize: 10 }} onClick={() => { setIcon(''); setIconPreview(''); hap?.window?.setIcon?.('', TARGET); saveToManifest({ icon: '' }); }}>✕</button>}
          </Row>
          <Row label={t('settings.size')}>
            <NumInput value={width} onChange={v => { setWidth(v); suppressRef.current = Date.now(); hap?.window?.setSize?.(v, height, TARGET); saveToManifest({ width: v, height }); }} />
            <span>×</span>
            <NumInput value={height} onChange={v => { setHeight(v); suppressRef.current = Date.now(); hap?.window?.setSize?.(width, v, TARGET); saveToManifest({ width, height: v }); }} />
          </Row>
          <Row label={t('prop.minSize')}>
            <Toggle checked={minEnabled} onChange={v => {
              setMinEnabled(v);
              if (!v) { hap?.window?.setMinSize?.(0, 0, TARGET); saveToManifest({ minWidth: 0, minHeight: 0 }); }
              else { hap?.window?.setMinSize?.(minW, minH, TARGET); saveToManifest({ minWidth: minW, minHeight: minH }); }
            }} />
            {minEnabled && <>
              <NumInput value={minW} onChange={v => { setMinW(v); hap?.window?.setMinSize?.(v, minH, TARGET); saveToManifest({ minWidth: v, minHeight: minH }); }} />
              <span>×</span>
              <NumInput value={minH} onChange={v => { setMinH(v); hap?.window?.setMinSize?.(minW, v, TARGET); saveToManifest({ minWidth: minW, minHeight: v }); }} />
            </>}
          </Row>
          <Row label={t('prop.maxSize')}>
            <Toggle checked={maxEnabled} onChange={v => {
              setMaxEnabled(v);
              if (!v) { hap?.window?.setMaxSize?.(0, 0, TARGET); saveToManifest({ maxWidth: 0, maxHeight: 0 }); }
              else { hap?.window?.setMaxSize?.(maxW, maxH, TARGET); saveToManifest({ maxWidth: maxW, maxHeight: maxH }); }
            }} />
            {maxEnabled && <>
              <NumInput value={maxW} onChange={v => { setMaxW(v); hap?.window?.setMaxSize?.(v, maxH, TARGET); saveToManifest({ maxWidth: v, maxHeight: maxH }); }} />
              <span>×</span>
              <NumInput value={maxH} onChange={v => { setMaxH(v); hap?.window?.setMaxSize?.(maxW, v, TARGET); saveToManifest({ maxWidth: maxW, maxHeight: v }); }} />
            </>}
          </Row>
          <Row label={t('prop.coordinates')}>
            <NumInput value={posX} onChange={v => { setPosX(v); suppressRef.current = Date.now(); hap?.window?.setPosition?.(v, posY, TARGET); }} />
            <span>,</span>
            <NumInput value={posY} onChange={v => { setPosY(v); suppressRef.current = Date.now(); hap?.window?.setPosition?.(posX, v, TARGET); }} />
          </Row>
        </Group>

        <Group title={t('group.appearance')} icon={<Palette size={12} />}>
          <Row label={t('settings.titleBarStyle')}>
            <select className="settings-input" value={titleBarStyle}
              onChange={e => { const v = e.target.value; setTitleBarStyle(v); hap?.window?.setTitleBarStyle?.(v, TARGET); saveToManifest({ titleBarStyle: v }); if (!decorations || v !== 'standard') { hap?.window?.postMessage?.('main', { type: '__platform_overlay__', platform: previewPlatform, titleBarStyle: v, title, icon }); } else { hap?.window?.postMessage?.('main', { type: '__platform_overlay__', platform: previewPlatform, titleBarStyle: 'none' }); } }}>
              <option value="standard">{t('prop.titleBar.standard')}</option>
              <option value="custom">{t('prop.titleBar.custom')}</option>
              <option value="none">{t('prop.titleBar.none')}</option>
            </select>
          </Row>
          <Row label={t('prop.hiddenTitle')}><Toggle checked={hiddenTitle} onChange={v => { setHiddenTitle(v); hap?.window?.setHiddenTitle?.(v, TARGET); saveToManifest({ hiddenTitle: v }); }} /></Row>
          <Row label={t('prop.transparent')}><Toggle checked={transparent} onChange={v => { setTransparent(v); hap?.window?.setTransparent?.(v, TARGET); saveToManifest({ transparent: v }); }} /></Row>
          <Row label={t('prop.shadow')}><Toggle checked={shadow} onChange={v => { setShadow(v); hap?.window?.setShadow?.(v, TARGET); saveToManifest({ shadow: v }); }} /></Row>
          <Row label={t('prop.bgColor')}>
            <input type="color" className="settings-color" value={bgColor} onChange={e => { setBgColor(e.target.value); saveToManifest({ backgroundColor: e.target.value }); }} />
            <input className="settings-input settings-input-sm" value={bgColor} onChange={e => { setBgColor(e.target.value); saveToManifest({ backgroundColor: e.target.value }); }} />
          </Row>
          <Row label={t('prop.opacity')}>
            <input type="range" min={0} max={100} value={opacity} className="settings-range"
              onChange={e => { const v = +e.target.value; setOpacity(v); hap?.window?.setOpacity?.(v, TARGET); saveToManifest({ opacity: v }); }} />
            <span style={{ fontSize: 10, minWidth: 28, textAlign: 'right' }}>{opacity}%</span>
          </Row>
        </Group>

        <Group title={t('group.behavior')} icon={<Settings2 size={12} />}>
          <Row label={t('settings.resizable')}><Toggle checked={resizable} onChange={v => { setResizable(v); hap?.window?.setResizable?.(v, TARGET); saveToManifest({ resizable: v }); }} /></Row>
          <Row label={t('prop.maximizable')}><Toggle checked={maximizable} onChange={v => { setMaximizable(v); hap?.window?.setMaximizable?.(v, TARGET); saveToManifest({ maximizable: v }); }} /></Row>
          <Row label={t('prop.minimizable')}><Toggle checked={minimizable} onChange={v => { setMinimizable(v); hap?.window?.setMinimizable?.(v, TARGET); saveToManifest({ minimizable: v }); }} /></Row>
          <Row label={t('prop.closable')}><Toggle checked={closable} onChange={v => { setClosable(v); hap?.window?.setClosable?.(v, TARGET); saveToManifest({ closable: v }); }} /></Row>
          <Row label={t('prop.alwaysOnTop')}><Toggle checked={alwaysOnTop} onChange={v => { setAlwaysOnTop(v); hap?.window?.setAlwaysOnTop?.(v, TARGET); saveToManifest({ alwaysOnTop: v }); }} /></Row>
          <Row label={t('prop.skipTaskbar')}><Toggle checked={skipTaskbar} onChange={v => { setSkipTaskbar(v); hap?.window?.setSkipTaskbar?.(v, TARGET); saveToManifest({ skipTaskbar: v }); }} /></Row>
          <Row label={t('prop.aspectRatio')}>
            <input className="settings-input" value={aspectRatio} placeholder="16:9"
              onChange={e => { const v = e.target.value; setAspectRatio(v); hap?.window?.setAspectRatio?.(v, TARGET); saveToManifest({ aspectRatio: v || undefined }); }} />
          </Row>
        </Group>

        <Group title={t('group.startup')} icon={<Play size={12} />}>
          <Row label={t('prop.startPosition')}>
            <select className="settings-input" value={startPosition} onChange={e => {
              const v = e.target.value as 'center' | 'custom';
              setStartPosition(v);
              if (v === 'center') saveToManifest({ center: true, x: undefined, y: undefined });
              else saveToManifest({ center: false, x: posX, y: posY });
            }}>
              <option value="center">{t('prop.startPosition.center')}</option>
              <option value="custom">{t('prop.startPosition.custom')}</option>
            </select>
          </Row>
          <Row label={t('prop.startState')}>
            <select className="settings-input" value={startState} onChange={e => {
              const v = e.target.value as typeof startState;
              setStartState(v);
              saveToManifest({ startState: v === 'normal' ? undefined : v });
            }}>
              <option value="normal">{t('prop.startState.normal')}</option>
              <option value="minimized">{t('prop.startState.minimized')}</option>
              <option value="maximized">{t('prop.startState.maximized')}</option>
              <option value="fullscreen">{t('prop.startState.fullscreen')}</option>
            </select>
          </Row>
        </Group>

        {previewPlatform === 'macos' && (
          <Group title="macOS" icon={<Apple size={12} />} defaultOpen={false}>
            <Row label={t('prop.vibrancy')}>
              <select className="settings-input" value={vibrancy}
                onChange={e => { const v = e.target.value; setVibrancy(v); hap?.window?.setVibrancy?.(v, TARGET); saveToManifest({ macos: { vibrancy: v || undefined, ...(trafficX !== 13 || trafficY !== 24 ? { trafficLightPosition: { x: trafficX, y: trafficY } } : {}) } }); }}>
                <option value="">{t('prop.vibrancy.none')}</option>
                <option value="sidebar">Sidebar</option>
                <option value="content">Content</option>
                <option value="menu">Menu</option>
                <option value="popover">Popover</option>
                <option value="tooltip">Tooltip</option>
                <option value="under-window">Under Window</option>
              </select>
            </Row>
            <Row label={t('prop.trafficLightX')}>
              <NumInput value={trafficX} onChange={v => { setTrafficX(v); hap?.window?.setTrafficLightPosition?.(v, trafficY, TARGET); saveToManifest({ macos: { trafficLightPosition: { x: v, y: trafficY }, ...(vibrancy ? { vibrancy } : {}) } }); }} />
            </Row>
            <Row label={t('prop.trafficLightY')}>
              <NumInput value={trafficY} onChange={v => { setTrafficY(v); hap?.window?.setTrafficLightPosition?.(trafficX, v, TARGET); saveToManifest({ macos: { trafficLightPosition: { x: trafficX, y: v }, ...(vibrancy ? { vibrancy } : {}) } }); }} />
            </Row>
          </Group>
        )}
      </div>

      <div className="settings-actions">
        <button className="settings-action-btn" onClick={() => hap?.window?.center?.(TARGET)}>
          {t('settings.center')}
        </button>
        <button className="settings-action-btn" onClick={() => hap?.window?.minimize?.(TARGET)}>
          {t('settings.minimize')}
        </button>
        <button className="settings-action-btn" onClick={() => hap?.window?.maximize?.(TARGET)}>
          {t('settings.maximize')}
        </button>
      </div>
    </div>
  );
}
