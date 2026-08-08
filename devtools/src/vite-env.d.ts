/// <reference types="vite/client" />

interface HapBridgeSystem {
  openApp: (id: string, params?: any) => Promise<any>;
  stopApp: (id: string) => Promise<void>;
  capabilities: () => Promise<{ platform: string; [key: string]: any }>;
}

interface Window {
  hap?: {
    hal?: (mod: string, fn: string, params?: any) => Promise<any>;
    fs?: any;
    db?: { get: (k: string) => Promise<string | null>; set: (k: string, v: string) => Promise<void> };
    window?: any;
    system?: HapBridgeSystem;
    app?: { id?: string };
  };
  __devtools__?: any;
  __hapWindowState?: { isFullscreen: boolean };
}
