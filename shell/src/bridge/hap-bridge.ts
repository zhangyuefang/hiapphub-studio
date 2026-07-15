import { invoke } from "@tauri-apps/api/core";

/**
 * 根据插件 manifest.permissions 构建受限 Bridge 实例。
 * 未声明权限的 namespace 调用会抛出 PermissionDeniedError。
 */
export function createBridge(pluginId: string, permissions: string[]) {
  const allowed = new Set(permissions);

  function guard(perm: string) {
    if (!allowed.has(perm)) {
      throw new Error(`[PermissionDenied] 插件 ${pluginId} 未声明权限: ${perm}`);
    }
  }

  return {
    pluginId,

    fs: {
      async readFile(path: string): Promise<Uint8Array> {
        guard("fs:read");
        return invoke("fs_read_file", { path });
      },
      async readTextFile(path: string): Promise<string> {
        guard("fs:read");
        return invoke("fs_read_text_file", { path });
      },
      async writeFile(path: string, data: Uint8Array): Promise<void> {
        guard("fs:write");
        return invoke("fs_write_file", { path, data: Array.from(data) });
      },
      async writeTextFile(path: string, content: string): Promise<void> {
        guard("fs:write");
        return invoke("fs_write_text_file", { path, content });
      },
      async exists(path: string): Promise<boolean> {
        guard("fs:read");
        return invoke("fs_exists", { path });
      },
      async remove(path: string): Promise<void> {
        guard("fs:delete");
        return invoke("fs_remove", { path });
      },
      async readDir(path: string): Promise<unknown[]> {
        guard("fs:read");
        return invoke("fs_read_dir", { path });
      },
      async createDir(path: string): Promise<void> {
        guard("fs:write");
        return invoke("fs_create_dir", { path });
      },
    },

    clipboard: {
      async readText(): Promise<string> {
        guard("clipboard:read");
        return invoke("clipboard_read_text");
      },
      async writeText(text: string): Promise<void> {
        guard("clipboard:write");
        return invoke("clipboard_write_text", { text });
      },
    },

    http: {
      async fetch(url: string, options?: Record<string, unknown>): Promise<unknown> {
        guard("http:request");
        return invoke("http_fetch", { url, options });
      },
    },

    crypto: {
      async hash(algorithm: string, data: string): Promise<string> {
        guard("crypto");
        return invoke("crypto_hash", { algorithm, data });
      },
      async hmac(algorithm: string, key: string, data: string): Promise<string> {
        guard("crypto");
        return invoke("crypto_hmac", { algorithm, key, data });
      },
      async encrypt(algorithm: string, key: string, data: string): Promise<string> {
        guard("crypto");
        return invoke("crypto_encrypt", { algorithm, key, data });
      },
      async decrypt(algorithm: string, key: string, data: string): Promise<string> {
        guard("crypto");
        return invoke("crypto_decrypt", { algorithm, key, data });
      },
      async randomBytes(length: number): Promise<Uint8Array> {
        guard("crypto");
        return invoke("crypto_random_bytes", { length });
      },
    },

    storage: {
      async get<T>(key: string): Promise<T | null> {
        return invoke("db_plugin_get", { pluginId, key });
      },
      async set<T>(key: string, value: T): Promise<void> {
        return invoke("db_plugin_set", { pluginId, key, value: JSON.stringify(value) });
      },
      async remove(key: string): Promise<void> {
        return invoke("db_plugin_remove", { pluginId, key });
      },
      async clear(): Promise<void> {
        return invoke("db_plugin_clear", { pluginId });
      },
    },

    ui: {
      toast(message: string, type: "success" | "error" | "info" = "info") {
        window.dispatchEvent(
          new CustomEvent("hap-toast", { detail: { message, type } }),
        );
      },
      async copyToClipboard(text: string): Promise<void> {
        await invoke("clipboard_write_text", { text });
        this.toast("已复制", "success");
      },
      get theme() {
        return document.documentElement.getAttribute("data-theme") === "dark"
          ? ("dark" as const)
          : ("light" as const);
      },
    },

    i18n: {
      t(key: string, fallback?: string): string {
        // 从 shell 的 i18n store 中获取翻译
        const event = new CustomEvent("hap-i18n-get", {
          detail: { key, fallback },
        });
        window.dispatchEvent(event);
        return (event as CustomEvent).detail.result ?? fallback ?? key;
      },
      get locale(): string {
        return document.documentElement.lang || "zh-CN";
      },
    },
  };
}

export type HapBridge = ReturnType<typeof createBridge>;
