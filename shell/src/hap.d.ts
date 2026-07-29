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
  installPlugin(url: string): Promise<any>;
  revealInFolder(path: string): Promise<void>;
  setLocale(locale: string): Promise<void>;
  loadPluginHtml(pluginId: string, file?: string): Promise<string>;
  libUsageStats(): Promise<Record<string, { id: string; name: string }[]>>;
  storeAuth(data: string): Promise<void>;
  loadAuth(): Promise<string | null>;
  clearAuth(): Promise<void>;
  getVersions(): Promise<Record<string, string>>;
  replaceHap(appId: string, hapPath: string): Promise<{ appId: string; version: string; backedUp: boolean }>;
  rollbackHap(appId: string): Promise<{ appId: string; version?: string; rolledBack: boolean }>;
  checkForUpdates(): Promise<{ updates: any[]; offline?: boolean; error?: string }>;
  downloadUpdate(url: string, appId: string): Promise<{ appId: string; version: string; backedUp: boolean }>;
}

interface HapBridgeWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  setFullscreen(v: boolean): Promise<void>;
  setDecorations(v: boolean): Promise<void>;
  focus(): Promise<void>;
  setSize(w: number, h: number): Promise<void>;
  setPosition(x: number, y: number): Promise<void>;
  getBounds(): Promise<{ x: number; y: number; width: number; height: number }>;
  onResized(handler: (e: any) => void): Promise<() => void>;
}

interface HapBridgeFs {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<any[]>;
  createDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
}

interface HapBridgeEvent {
  on(event: string, handler: (payload: any) => void): number;
  off(event: string, id: number): void;
  emit(event: string, payload?: any): Promise<void>;
  _dispatch(event: string, payload: any): void;
}

interface HapBridge {
  app: HapBridgeApp;
  db: HapBridgeDb;
  system: HapBridgeSystem;
  window: HapBridgeWindow;
  fs: HapBridgeFs;
  event: HapBridgeEvent;
  hal(moduleName: string, functionName: string, params?: any): Promise<any>;
}

declare const hap: HapBridge;
