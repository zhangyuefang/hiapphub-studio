interface HapBridgeApp {
  id: string;
  version: string;
  readonly dataDir: Promise<string>;
}

interface HapBridgeDb {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface HapBridgeSystem {
  listHalModules(): Promise<any[]>;
  callHalFunction(mod: string, fn: string, params?: any): Promise<any>;
  reloadModules(): Promise<any>;
  listPlugins(): Promise<any[]>;
  openApp(appId: string, params?: any): Promise<any>;
  stopApp(appId: string): Promise<any>;
  installPlugin(url: string): Promise<any>;
  revealInFolder(path: string): Promise<void>;
  setLocale(locale: string): Promise<void>;
  loadPluginHtml(pluginId: string, file?: string): Promise<string>;
  libUsageStats(): Promise<Record<string, { id: string; name: string }[]>>;
  storeAuth(data: string | object): Promise<void>;
  loadAuth(): Promise<string | null>;
  clearAuth(): Promise<void>;
  getVersions(): Promise<Record<string, string>>;
  replaceHap(appId: string, hapPath: string): Promise<{ appId: string; version: string; backedUp: boolean }>;
  rollbackHap(appId: string): Promise<{ appId: string; version?: string; rolledBack: boolean }>;
  checkForUpdates(): Promise<{ updates: any[]; offline?: boolean; error?: string }>;
  downloadUpdate(url: string, appId: string): Promise<{ appId: string; version: string; backedUp: boolean }>;
  capabilities?(): Promise<{ features?: { multiWindow?: boolean; customTitleBar?: boolean } }>;
}

interface HapBridgeWindow {
  label: string;
  close(): Promise<void>;
  setTitle(title: string, target?: string): Promise<void>;
  startDragging(): Promise<void>;
  minimize(target?: string): Promise<void>;
  maximize(target?: string): Promise<void>;
  unmaximize(target?: string): Promise<void>;
  isMaximized(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  setFullscreen(v: boolean): Promise<void>;
  setSize(w: number, h: number, target?: string): Promise<void>;
  setAlwaysOnTop(v: boolean, target?: string): Promise<void>;
  setResizable(v: boolean, target?: string): Promise<void>;
  setDecorations(v: boolean, target?: string): Promise<void>;
  setMinimizable(v: boolean, target?: string): Promise<void>;
  setMaximizable(v: boolean, target?: string): Promise<void>;
  setClosable(v: boolean, target?: string): Promise<void>;
  center(target?: string): Promise<void>;
  setMinSize(w: number, h: number, target?: string): Promise<void>;
  setMaxSize(w: number, h: number, target?: string): Promise<void>;
  setPosition(x: number, y: number, target?: string): Promise<void>;
  setTitleBarStyle(style: string, target?: string): Promise<void>;
  setHiddenTitle(v: boolean, target?: string): Promise<void>;
  setTransparent(v: boolean, target?: string): Promise<void>;
  setTrafficLightPosition(x: number, y: number, target?: string): Promise<void>;
  setIcon(iconPath: string, target?: string): Promise<void>;
  setOpacity(value: number, target?: string): Promise<void>;
  setSkipTaskbar(v: boolean, target?: string): Promise<void>;
  setShadow(v: boolean, target?: string): Promise<void>;
  setAspectRatio(ratio: string, target?: string): Promise<void>;
  setVibrancy(material: string, target?: string): Promise<void>;
  focus(target?: string): Promise<void>;
  getPosition(target?: string): Promise<{ x: number; y: number }>;
  getSize(target?: string): Promise<{ width: number; height: number }>;
  getBounds(target?: string): Promise<{ x: number; y: number; width: number; height: number }>;
  onResized(handler: (e: any) => void): Promise<() => void>;
  getScreenInfo(): { width: number; height: number; availWidth: number; availHeight: number };
  create(opts: any): Promise<any>;
  closeChild(label: string): Promise<void>;
  screenshot(target?: string): Promise<string>;
  postMessage(label: string, data: any): Promise<void>;
  onMessage(handler: (data: any) => void): number;
}

interface HapBridgeFs {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<any[]>;
  createDir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  remove(path: string): Promise<void>;
}

interface HapBridgeEvent {
  on(event: string, handler: (payload: any) => void): number;
  off(event: string, id: number): void;
  _dispatch(event: string, payload: any): void;
}

interface HapBridgeDialog {
  openFile(opts?: { title?: string; filters?: any[]; multiple?: boolean; defaultPath?: string }): Promise<string | string[] | null>;
  openDirectory(opts?: { title?: string; defaultPath?: string }): Promise<string | null>;
  saveFile(opts?: { title?: string; filters?: any[]; defaultPath?: string }): Promise<string | null>;
  messageBox(title: string, message: string, opts?: { buttons?: string[]; type?: string }): Promise<any>;
  confirm(title: string, message: string): Promise<boolean>;
}

interface HapBridgeNotification {
  show(title: string, body?: string): Promise<void>;
}

interface HapBridge {
  app: HapBridgeApp;
  db: HapBridgeDb;
  system: HapBridgeSystem;
  window: HapBridgeWindow;
  fs: HapBridgeFs;
  event: HapBridgeEvent;
  dialog: HapBridgeDialog;
  notification: HapBridgeNotification;
  hal(moduleName: string, functionName: string, params?: any): Promise<any>;
}

declare const hap: HapBridge;

interface Window {
  hap: HapBridge;
}
