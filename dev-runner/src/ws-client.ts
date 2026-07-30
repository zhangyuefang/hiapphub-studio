const WS_PORT = 19768;
const RETRY_DELAY = 3000;
const MAX_RETRIES = 10;
const CONNECT_TIMEOUT = 5000;
const PING_INTERVAL = 5000;

type StatusListener = (connected: boolean) => void;
type MessageListener = (msg: any) => void;

let ws: WebSocket | null = null;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let destroyed = false;

const statusListeners = new Set<StatusListener>();
const messageListeners = new Set<MessageListener>();

function notify(connected: boolean) {
  statusListeners.forEach(fn => fn(connected));
}

function handleMessage(ev: MessageEvent) {
  try {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'reconnect') {
      console.warn('[ws-client] server requested reconnect');
      if (ws) { ws.close(); ws = null; }
      retries = 0;
      setTimeout(tryConnect, 500);
      return;
    }
    messageListeners.forEach(fn => fn(msg));
  } catch {}
}

function tryConnect() {
  if (destroyed || retries >= MAX_RETRIES) return;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  } catch {
    scheduleRetry();
    return;
  }

  const connectTimer = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      ws.close();
    }
  }, CONNECT_TIMEOUT);

  ws.onopen = () => {
    clearTimeout(connectTimer);
    retries = 0;
    notify(true);
    ws!.send(JSON.stringify({
      type: 'register',
      role: _role,
      appId: _appId,
      manifestPath: _manifestPath,
      label: (window as any).hap?.app?.id || 'dev-runner',
    }));
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try { ws.send('{"type":"ping"}'); } catch { ws?.close(); }
      }
    }, PING_INTERVAL);
  };

  ws.onmessage = handleMessage;

  ws.onclose = () => {
    clearTimeout(connectTimer);
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    ws = null;
    notify(false);
    scheduleRetry();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleRetry() {
  if (destroyed) return;
  retries++;
  if (retries < MAX_RETRIES) {
    retryTimer = setTimeout(tryConnect, RETRY_DELAY);
  } else {
    console.warn('[ws-client] DevTools unreachable, closing window');
    try { (window as any).__HOST_IPC__?.('window_close', { __wl: 'main' }); } catch {}
  }
}

let _role = 'runner';
let _appId = '';
let _manifestPath = '';

export function connectDevTools(role?: string, appId?: string, manifestPath?: string) {
  if (ws || retryTimer) {
    disconnectDevTools();
  }
  if (role) _role = role;
  if (appId) _appId = appId;
  if (manifestPath) _manifestPath = manifestPath;
  if (!_appId) {
    const hash = window.location.hash || '';
    const m = hash.match(/[?&]appId=([^&]*)/);
    if (m) _appId = decodeURIComponent(m[1]);
  }
  if (!_manifestPath) {
    const hash = window.location.hash || '';
    const m = hash.match(/[?&]manifestPath=([^&]*)/);
    if (m) _manifestPath = decodeURIComponent(m[1]);
  }
  if (!_appId) _appId = (window as any).hap?.app?.id || '';
  destroyed = false;
  retries = 0;
  tryConnect();
}

export function disconnectDevTools() {
  destroyed = true;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (ws) { ws.close(); ws = null; }
  notify(false);
}

export function onStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function onMessage(fn: MessageListener): () => void {
  messageListeners.add(fn);
  return () => messageListeners.delete(fn);
}

export function sendMessage(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}
