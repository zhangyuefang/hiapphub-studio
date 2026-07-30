import { t } from './i18n';
import { getPorts } from './server';

let trayId: string | null = null;
let unlistenFn: (() => void) | null = null;

function halTray(fn: string, params?: Record<string, any>): Promise<any> {
  return (window as any).__TAURI_INTERNALS__.invoke('hap_call_function', {
    moduleName: 'tray',
    symbolName: 'hap_tray_' + fn,
    paramsJson: JSON.stringify(params || {})
  }).then((r: string) => { try { return JSON.parse(r); } catch { return r; } });
}

export async function setupTray() {
  try {
    const result = await halTray('create', {
      tooltip: `HAP DevTools - Port ${getPorts().http}`
    });
    trayId = result?.tray_id || result;
    if (trayId) {
      const ports = getPorts();
      await halTray('set_menu', {
        tray_id: trayId,
        items: [
          { id: 'show', label: t('tray.show') },
          { id: 'sep1', label: '-' },
          { id: 'api_status', label: `API: localhost:${ports.http}`, enabled: false },
          { id: 'ws_status', label: `WS: localhost:${ports.ws}`, enabled: false },
          { id: 'sep2', label: '-' },
          { id: 'quit', label: t('tray.quit') }
        ]
      });
      startEventListener();
    }
  } catch (e) {
    console.warn('[tray] setup failed:', e);
  }
}

function startEventListener() {
  const internals = (window as any).__TAURI_INTERNALS__;
  if (!internals?.listen) return;
  internals.listen('hap:tray-event', (event: any) => {
    const payload = event.payload;
    if (typeof payload === 'string') {
      handleTrayEvent(payload);
    }
  }).then((unlisten: () => void) => {
    unlistenFn = unlisten;
  });
}

function handleTrayEvent(raw: string) {
  const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invoke) return;

  try {
    const ev = JSON.parse(raw);
    if (ev.type === 'tray_click' && ev.button === 'left') {
      activateWindow(invoke);
      return;
    }
    if (ev.type === 'menu_click') {
      handleMenuItem(ev.id, invoke);
      return;
    }
  } catch { /* not JSON */ }
}

function handleMenuItem(itemId: string, invoke: Function) {
  switch (itemId) {
    case 'show':
      activateWindow(invoke);
      break;
    case 'quit':
      destroyTray().then(() => {
        invoke('plugin:window|destroy', { label: 'plugin-hiapphub-devtools' }).catch(() => {
          invoke('plugin:window|close', { label: 'plugin-hiapphub-devtools' }).catch(() => {});
        });
      });
      break;
  }
}

function activateWindow(invoke: Function) {
  const label = 'plugin-hiapphub-devtools';
  invoke('plugin:window|unminimize', { label }).catch(() => {});
  invoke('plugin:window|show', { label }).catch(() => {});
  invoke('plugin:window|set_focus', { label }).catch(() => {});
}

export async function destroyTray() {
  if (unlistenFn) { unlistenFn(); unlistenFn = null; }
  if (!trayId) return;
  try {
    await halTray('destroy', { tray_id: trayId });
  } catch { /* ignore */ }
  trayId = null;
}
