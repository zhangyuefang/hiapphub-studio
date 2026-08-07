import { getLocale } from './i18n';

let PORT = 19767;
let WS_PORT = 19768;
let API_PORT = 19769;
let serverRunning = false;
let callbackPollTimer: ReturnType<typeof setInterval> | null = null;
let internalPollTimer: ReturnType<typeof setInterval> | null = null;
let runnerWatchTimer: ReturnType<typeof setInterval> | null = null;
let knownRunners = new Map<string, string>();
let moduleCache: any[] | null = null;
let moduleCacheTime = 0;
const MODULE_CACHE_TTL = 5000;

const hap = (window as any).hap;

function halServer(fn: string, params?: Record<string, any>): Promise<any> {
  return hap.hal('devtools_server', fn, params || {});
}

async function getModules(): Promise<any[]> {
  const now = Date.now();
  if (moduleCache && now - moduleCacheTime < MODULE_CACHE_TTL) return moduleCache;
  try {
    moduleCache = await hap.system.listHalModules();
    moduleCacheTime = now;
  } catch (_) {
    moduleCache = [];
  }
  return moduleCache!;
}

let logBuffer: Array<{ time: number; module: string; fn: string; params: any; result: any }> = [];
export function pushLog(entry: { time: number; module: string; fn: string; params: any; result: any }) {
  logBuffer.push(entry);
  if (logBuffer.length > 500) logBuffer.shift();
}

type RequestHandler = (req: InternalRequest) => Promise<InternalResponse>;

interface InternalRequest {
  request_id: string;
  method: string;
  uri: string;
  headers: Record<string, string>;
  body: string;
  _params?: Record<string, string>;
}

interface InternalResponse {
  status?: number;
  headers?: Record<string, string>;
  body: any;
}

const routes: Array<{ method: string; pattern: RegExp; handler: RequestHandler }> = [];

function route(method: string, path: string, handler: RequestHandler) {
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method: method.toUpperCase(), pattern, handler });
}

function matchRoute(method: string, path: string): { handler: RequestHandler; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method.toUpperCase()) continue;
    const m = path.match(r.pattern);
    if (m) return { handler: r.handler, params: m.groups || {} };
  }
  return null;
}

route('GET', '/api/health', async () => ({
  body: JSON.stringify({
    status: 'ok',
    moduleCount: (await getModules()).length,
    port: PORT,
    locale: getLocale()
  })
}));

route('GET', '/api/modules', async () => {
  const mods = await getModules();
  const list = mods.map((m: any) => ({
    id: m.name,
    name: m.descriptions?.[getLocale()] || m.descriptions?.['en-US'] || m.name,
    version: m.version,
    description: m.overview || '',
    functionCount: m.functions?.length || 0,
    typeCount: m.types?.length || 0,
    constantCount: m.constants?.length || 0,
    eventCount: m.events?.length || 0
  }));
  return { body: JSON.stringify(list) };
});

route('GET', '/api/modules/:id', async (req) => {
  const mods = await getModules();
  const id = req._params?.id;
  const mod = mods.find((m: any) => m.name === id);
  if (!mod) return { status: 404, body: JSON.stringify({ error: 'module not found' }) };
  const groups: Record<string, any[]> = {};
  for (const fn of (mod.functions || [])) {
    const g = fn.group || '_default';
    (groups[g] ||= []).push(fn);
  }
  return { body: JSON.stringify({ ...mod, functionGroups: groups }) };
});

route('GET', '/api/modules/:id/types.d.ts', async (req) => {
  const mods = await getModules();
  const id = req._params?.id;
  const mod = mods.find((m: any) => m.name === id);
  if (!mod) return { status: 404, body: '// module not found' };
  return { headers: { 'content-type': 'text/plain' }, body: generateDts(mod) };
});

route('GET', '/api/types.d.ts', async () => {
  const mods = await getModules();
  const dts = mods.map(generateDts).join('\n\n');
  return { headers: { 'content-type': 'text/plain' }, body: dts };
});

route('GET', '/api/apps', async () => {
  try {
    const apps = await hap.system.shellInfo();
    return { body: JSON.stringify(apps) };
  } catch (_) {
    return { body: '[]' };
  }
});

route('GET', '/api/connection', async () => {
  try {
    const clients = await halServer('get_ws_clients');
    const connected = Array.isArray(clients) && clients.some((c: any) => c.role === 'plugin');
    return { body: JSON.stringify({ connected, clients }) };
  } catch {
    return { body: JSON.stringify({ connected: false, clients: [] }) };
  }
});

route('POST', '/api/manifest/validate', async (req) => {
  try {
    const manifest = JSON.parse(req.body);
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!manifest.id) errors.push('missing "id" field');
    else if (/[^a-z0-9\-]/.test(manifest.id)) errors.push('"id" should only contain lowercase letters, numbers, and hyphens');
    if (!manifest.name) errors.push('missing "name" field');
    if (!manifest.version) errors.push('missing "version" field');
    else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) errors.push('"version" should follow semver (e.g. 1.0.0)');
    if (!manifest.entry) errors.push('missing "entry" field');
    else if (!manifest.entry.endsWith('.html')) warnings.push('"entry" is typically an .html file');
    if (!manifest.icon) warnings.push('missing "icon" field (recommended)');
    if (manifest.windows) {
      if (!Array.isArray(manifest.windows)) errors.push('"windows" should be an array');
      else manifest.windows.forEach((w: any, i: number) => {
        if (!w.label) errors.push(`windows[${i}]: missing "label"`);
        if (w.width && typeof w.width !== 'number') errors.push(`windows[${i}]: "width" should be a number`);
        if (w.height && typeof w.height !== 'number') errors.push(`windows[${i}]: "height" should be a number`);
      });
    }
    if (manifest.permissions && !Array.isArray(manifest.permissions)) errors.push('"permissions" should be an array');
    return { body: JSON.stringify({ valid: errors.length === 0, errors, warnings }) };
  } catch (e: any) {
    return { status: 400, body: JSON.stringify({ valid: false, errors: ['invalid JSON: ' + e.message], warnings: [] }) };
  }
});

route('GET', '/api/logs', async (req) => {
  const qs = (req.uri || '').split('?')[1] || '';
  const sinceMatch = qs.match(/since=(\d+)/);
  const since = sinceMatch ? Number(sinceMatch[1]) : undefined;
  try {
    const logs = await (window as any).__TAURI_INTERNALS__.invoke('hap_get_call_logs', { since });
    return { body: JSON.stringify(logs) };
  } catch (_) {
    const filtered = since ? logBuffer.filter(l => l.time > since) : logBuffer.slice(-100);
    return { body: JSON.stringify(filtered) };
  }
});

route('GET', '/api/account', async () => {
  try {
    const info = await hap.db.get('account_info');
    return { body: info || '{}' };
  } catch (_) {
    return { body: '{}' };
  }
});

route('POST', '/api/call', async (req) => {
  try {
    const { module: mod, function: fn, params } = JSON.parse(req.body);
    const start = Date.now();
    const result = await hap.hal(mod, fn, params || {});
    return { body: JSON.stringify({ success: true, result, elapsed_ms: Date.now() - start }) };
  } catch (e: any) {
    return { status: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
});

function generateDts(mod: any): string {
  const ns = 'HapMod_' + (mod.name || '').replace(/-/g, '_');
  let out = `declare namespace ${ns} {\n`;
  if (mod.types) {
    for (const t of mod.types) {
      out += `  interface ${t.name} {\n`;
      if (t.fields) for (const f of t.fields) {
        out += `    ${f.name}: ${mapType(f.type)};\n`;
      }
      out += `  }\n`;
    }
  }
  if (mod.functions) {
    for (const fn of mod.functions) {
      const params = (fn.params || []).map((p: any) => `${p.name}${p.optional ? '?' : ''}: ${mapType(p.type)}`).join(', ');
      const ret = fn.returns?.type ? mapType(fn.returns.type) : 'void';
      out += `  function ${fn.name}(${params}): Promise<${ret}>;\n`;
    }
  }
  out += `}\n`;
  return out;
}

function mapType(t: string): string {
  if (!t) return 'any';
  if (['string', 'number', 'boolean', 'void'].includes(t)) return t;
  if (t === 'array') return 'any[]';
  return t;
}

let onPluginRegister: ((data: any) => void) | null = null;
let onPluginMessage: ((event: string, data: any) => void) | null = null;
let onPluginDisconnect: ((clientId: string, manifest: any) => void) | null = null;

export function setWsHandlers(
  onRegister: (data: any) => void,
  onMessage: (event: string, data: any) => void,
  onDisconnect?: (clientId: string, manifest: any) => void,
) {
  onPluginRegister = onRegister;
  onPluginMessage = onMessage;
  onPluginDisconnect = onDisconnect || null;
}

export async function getWsClients(): Promise<{ role?: string; label?: string; appId?: string; clientId?: string; manifestPath?: string }[]> {
  try {
    const clients = await halServer('get_ws_clients');
    return Array.isArray(clients) ? clients : [];
  } catch { return []; }
}

export function wsSendToClient(clientId: string, msg: object) {
  halServer('ws_send', { client_id: clientId, message: JSON.stringify(msg) }).catch(() => {});
}

export async function hasPluginConnected(): Promise<boolean> {
  const clients = await getWsClients();
  return clients.some(c => c.role === 'plugin');
}

export function isWsServerRunning(): boolean {
  return serverRunning;
}

export function wsBroadcast(msg: object) {
  halServer('ws_broadcast', { message: JSON.stringify(msg) }).catch(() => {});
}

export function wsSendToRole(role: string, msg: object) {
  halServer('ws_send_to_role', { role, message: JSON.stringify(msg) }).catch(() => {});
}

export async function startServer(): Promise<boolean> {
  try {
    const result = await halServer('start', {
      http_port: API_PORT,
      ws_port: WS_PORT,
      internal_port: PORT,
    });
    if (result?.token) {
      serverRunning = true;
      startCallbackPolling();
      startInternalPolling();
      startRunnerWatch();
      startWsMessagePolling();
      setStatus('Servers running (HTTP:' + API_PORT + ' WS:' + WS_PORT + ' Internal:' + PORT + ')');
      return true;
    }
    setStatus('Server start returned unexpected: ' + JSON.stringify(result));
    return false;
  } catch (e: any) {
    console.error('[server] start error:', e?.message || e);
    setStatus('Server error: ' + (e?.message || e));
    return false;
  }
}

function startCallbackPolling() {
  if (callbackPollTimer) return;
  callbackPollTimer = setInterval(pollCallbacks, 100);
}

async function pollCallbacks() {
  try {
    const callbacks = await halServer('poll_callbacks', { limit: 10 });
    if (!Array.isArray(callbacks) || callbacks.length === 0) return;

    for (const cb of callbacks) {
      const result = await handleDevtoolsCallback(cb.method, cb.path, cb.body);
      await halServer('respond_callback', {
        request_id: cb.request_id,
        status: result.status || 200,
        body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body),
      });
    }
  } catch {}
}

async function handleDevtoolsCallback(method: string, path: string, body: any): Promise<{ status?: number; body: any }> {
  const dt = (window as any).__devtools__;
  if (!dt) return { status: 503, body: JSON.stringify({ error: { code: 'NOT_READY', message: 'DevTools global not exposed yet' } }) };

  try {
    if (path === '/api/v1/devtools/state') return { body: JSON.stringify(dt.getState()) };
    if (path === '/api/v1/devtools/projects') return { body: JSON.stringify(dt.getProjects()) };
    if (path === '/api/v1/devtools/workspace/open') {
      if (!body?.dir) return { status: 400, body: JSON.stringify({ error: { code: 'MISSING_PARAM', message: '"dir" is required' } }) };
      const r = await dt.openWorkspace(body.dir);
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'OPEN_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/devtools/workspace/create') {
      if (!body?.dir || !body?.name) return { status: 400, body: JSON.stringify({ error: { code: 'MISSING_PARAM', message: '"dir" and "name" are required' } }) };
      const r = await dt.createWorkspace(body.dir, body.name);
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'CREATE_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/devtools/workspace/close') return { body: JSON.stringify(dt.closeWorkspace()) };
    if (path === '/api/v1/devtools/project/add') {
      if (!body?.id) return { status: 400, body: JSON.stringify({ error: { code: 'MISSING_PARAM', message: '"id" is required' } }) };
      const r = await dt.addProject(body.id, body.type || 'hap');
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'ADD_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/devtools/project/open') {
      if (!body?.id) return { status: 400, body: JSON.stringify({ error: { code: 'MISSING_PARAM', message: '"id" is required' } }) };
      const r = dt.openProject(body.id);
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'OPEN_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/devtools/project/close') {
      if (!body?.id) return { status: 400, body: JSON.stringify({ error: { code: 'MISSING_PARAM', message: '"id" is required' } }) };
      const r = dt.closeProject(body.id);
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'CLOSE_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/devtools/project/start') {
      const r = await dt.startProject(body?.id);
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'START_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/devtools/project/stop') {
      const r = await dt.stopProject(body?.id);
      return r.success ? { body: JSON.stringify(r) } : { status: 400, body: JSON.stringify({ error: { code: r.error || 'STOP_FAILED', message: r.message || 'Failed' } }) };
    }
    if (path === '/api/v1/projects/start') {
      if (!body?.projectDir) return { status: 400, body: JSON.stringify({ error: { code: 'MISSING_PARAM', message: 'projectDir required' } }) };
      launchProjectInBackground(body.projectDir);
      return { body: JSON.stringify({ started: true, appId: 'pending', status: 'launching', projectDir: body.projectDir }) };
    }
    return { status: 404, body: JSON.stringify({ error: 'unknown callback path' }) };
  } catch (e: any) {
    return { status: 500, body: JSON.stringify({ error: { code: 'INTERNAL', message: e?.message || 'unknown error' } }) };
  }
}

function launchProjectInBackground(projectDir: string) {
  setTimeout(async () => {
    try {
      const hfs = hap?.fs;
      const manifestPath = `${projectDir}/manifest.json`;
      const raw = await hfs.readTextFile(manifestPath);
      const manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const halCall = (mod: string, fn: string, params?: any) => hap.hal(mod, fn, params || {});
      const handle = await halCall('process', 'spawn', { command: 'pnpm', args: ['dev'], cwd: projectDir });
      const vitePid = handle?.pid || handle;
      let url: string | null = null;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const out = await halCall('process', 'read_output', { pid: vitePid });
          const text = typeof out === 'string' ? out : out?.stdout || '';
          const m = text.match(/Local:\s+(https?:\/\/[^\s]+)/);
          if (m) { url = m[1]; break; }
        } catch {}
      }
      if (!url) return;
      const portMatch = url.match(/:(\d+)/);
      const port = portMatch ? Number(portMatch[1]) : 5173;
      const win = manifest.windows?.[0] || { width: 800, height: 600 };
      await hap.system.openApp('hap-dev-runner', {
        entry: url, appId: manifest.id || 'unknown',
        name: manifest.name || manifest.id || 'app',
        devPort: port, manifestPath, windowConfig: win
      });
    } catch (e: any) { console.error('[projects/start bg]', e?.message); }
  }, 50);
}

function startRunnerWatch() {
  if (runnerWatchTimer) return;
  runnerWatchTimer = setInterval(async () => {
    try {
      const clients = await getWsClients();
      const current = new Map<string, string>();
      for (const c of clients) {
        if (c.role === 'runner' && c.clientId && c.appId) {
          current.set(c.clientId, c.appId);
        }
      }
      for (const [clientId, appId] of knownRunners) {
        if (!current.has(clientId)) {
          window.dispatchEvent(new CustomEvent('devtools:runner:disconnected', { detail: { appId, clientId } }));
        }
      }
      knownRunners = current;
    } catch {}
  }, 3000);
}

function startInternalPolling() {
  if (internalPollTimer) return;
  internalPollTimer = setInterval(pollInternalRequests, 100);
}

async function pollInternalRequests() {
  try {
    const requests = await halServer('poll_internal_requests', { limit: 10 });
    if (!Array.isArray(requests) || requests.length === 0) return;
    for (const req of requests) {
      const [pathname] = (req.uri || '/').split('?');
      const match = matchRoute(req.method, pathname);
      if (match) {
        (req as any)._params = match.params;
        const res = await match.handler(req);
        const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
        const headers = res.headers || {};
        if (!headers['content-type']) headers['content-type'] = 'application/json';
        await halServer('respond_internal', {
          request_id: req.request_id,
          status: res.status || 200,
          headers,
          body,
        });
      } else {
        await halServer('respond_internal', {
          request_id: req.request_id,
          status: 404,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'not found' }),
        });
      }
    }
  } catch {}
}

function setStatus(msg: string) {
  const el = document.getElementById('hap-server-status');
  if (el) el.textContent = msg;
  console.log('[DevTools Server]', msg);
}

export function getPorts() { return { http: PORT, ws: WS_PORT, api: API_PORT }; }

type WsMsgHandler = (msg: { type: string; [key: string]: any }, from: { role?: string; clientId?: string }) => void;
let wsMessageHandler: WsMsgHandler | null = null;
let wsMessagePollTimer: ReturnType<typeof setInterval> | null = null;

export function onWsMessage(handler: WsMsgHandler) {
  wsMessageHandler = handler;
}

function startWsMessagePolling() {
  if (wsMessagePollTimer) return;
  wsMessagePollTimer = setInterval(async () => {
    try {
      const msgs = await halServer('poll_ws_messages', { limit: 10 });
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      for (const m of msgs) {
        try {
          const parsed = typeof m.message === 'string' ? JSON.parse(m.message) : m.message;
          wsMessageHandler?.(parsed, { role: m.role, clientId: m.client_id });
        } catch {}
      }
    } catch {}
  }, 200);
}

function stopWsMessagePolling() {
  if (wsMessagePollTimer) { clearInterval(wsMessagePollTimer); wsMessagePollTimer = null; }
}

export async function restartServer(httpPort?: number, wsPort?: number) {
  await stopServer();
  if (httpPort && httpPort > 0) PORT = httpPort;
  if (wsPort && wsPort > 0) WS_PORT = wsPort;
  await new Promise(r => setTimeout(r, 800));
  return startServer();
}

export async function stopServer() {
  if (callbackPollTimer) { clearInterval(callbackPollTimer); callbackPollTimer = null; }
  if (internalPollTimer) { clearInterval(internalPollTimer); internalPollTimer = null; }
  if (runnerWatchTimer) { clearInterval(runnerWatchTimer); runnerWatchTimer = null; }
  stopWsMessagePolling();
  knownRunners.clear();
  try {
    await halServer('stop');
  } catch {}
  serverRunning = false;
}
