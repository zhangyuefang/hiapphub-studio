export interface PluginManifest {
  id: string;
  name: string;
  names?: Record<string, string>;
  version: string;
  description: string;
  descriptions?: Record<string, string>;
  author: string;
  category: string;
  tags: string[];
  icon: string;
  entry: string;
  style?: string;
  minShellVersion: string;
  permissions: string[];
  wasm?: string | null;
  native?: Record<string, string> | null;
  _installPath?: string;
}

export interface PluginRecord {
  manifest: PluginManifest;
  installed: boolean;
  path?: string;
  loaded: boolean;
}

export type Theme = "light" | "dark";
