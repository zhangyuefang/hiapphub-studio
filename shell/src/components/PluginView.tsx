import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PluginRecord } from "../types";

interface Props {
  plugin: PluginRecord | null;
  onBack: () => void;
}

export function PluginView({ plugin, onBack }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plugin?.manifest._installPath) return;
    invoke<string>("hap_load_plugin_html", {
      installPath: plugin.manifest._installPath,
    })
      .then(setHtml)
      .catch((e) => setError(String(e)));
  }, [plugin?.manifest._installPath]);

  if (!plugin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>插件未找到</p>
        <button className="ml-4 text-blue-500 underline" onClick={onBack}>
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header
        className="flex items-center px-4 h-10 border-b shrink-0"
        style={{ borderColor: "var(--fs-border)" }}
      >
        <button
          className="text-sm text-blue-500 hover:underline mr-4"
          onClick={onBack}
        >
          ← 返回首页
        </button>
        <span className="font-semibold">{plugin.manifest.name}</span>
        <span className="ml-2 text-xs text-gray-400">
          v{plugin.manifest.version}
        </span>
      </header>
      <main className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">
            <p>{error}</p>
          </div>
        ) : html ? (
          <iframe
            srcDoc={html}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts"
            title={plugin.manifest.name}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <p>加载中...</p>
          </div>
        )}
      </main>
    </div>
  );
}
