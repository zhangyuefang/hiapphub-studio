const WS_PORT = 19768;
const RETRY_DELAY = 2000;
const APP_ID = 'hiapphub-shell';

let ws: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let destroyed = false;

function tryConnect() {
  if (destroyed) return;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  } catch {
    scheduleRetry();
    return;
  }

  ws.onopen = () => {
    console.log('[automation-client] connected');
    ws!.send(JSON.stringify({ type: 'register', role: 'runner', appId: APP_ID, label: 'Shell' }));
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      if (msg.type === 'api:request' && msg.requestId) {
        handleApiRequest(msg.requestId, msg.action, msg.params);
      }
    } catch {}
  };

  ws.onclose = () => {
    console.log('[automation-client] disconnected, retrying...');
    ws = null;
    scheduleRetry();
  };
  ws.onerror = () => { try { ws?.close(); } catch {} };
}

function scheduleRetry() {
  if (destroyed) return;
  retryTimer = setTimeout(tryConnect, RETRY_DELAY);
}

async function handleApiRequest(requestId: string, action: string, params?: any) {
  let data: any = {};
  const currentWs = ws;
  try {
    if (action === 'get_bounds') {
      const win = (window as any).__TAURI__?.window?.getCurrentWindow?.();
      if (win) {
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        data = { x: pos.x, y: pos.y, width: size.width, height: size.height };
      } else {
        data = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
      }
    } else if (action === 'eval') {
      try {
        const res = (0, eval)(params?.code || 'null');
        if (res && typeof res.then === 'function') {
          const v = await res;
          data = { result: v === undefined ? null : v };
        } else {
          data = { result: res === undefined ? null : res };
        }
      } catch (e: any) {
        data = { result: 'ERROR: ' + (e?.message || e) };
      }
    } else if (action === 'screenshot') {
      data = { error: 'screenshot not supported for Shell' };
    } else if (action === 'resize') {
      const win = (window as any).__TAURI__?.window?.getCurrentWindow?.();
      if (win) {
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        await win.setSize(new LogicalSize(params.width, params.height));
        data = { success: true };
      } else {
        data = { error: 'window API unavailable' };
      }
    } else if (action === 'move') {
      const win = (window as any).__TAURI__?.window?.getCurrentWindow?.();
      if (win) {
        const { LogicalPosition } = await import('@tauri-apps/api/dpi');
        await win.setPosition(new LogicalPosition(params.x, params.y));
        data = { success: true };
      } else {
        data = { error: 'window API unavailable' };
      }
    } else {
      data = { error: `unknown action: ${action}` };
    }
  } catch (e: any) {
    data = { error: e?.message || 'unknown error' };
  }
  const sendWs = currentWs || ws;
  if (sendWs && sendWs.readyState === WebSocket.OPEN) {
    sendWs.send(JSON.stringify({ type: 'api:response', requestId, data }));
  }
}

export function startAutomationClient() {
  destroyed = false;
  tryConnect();
}

export function stopAutomationClient() {
  destroyed = true;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (ws) { ws.close(); ws = null; }
}
