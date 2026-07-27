import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { useAppStore } from "@/store/app-store";
import type { PluginManifest, PluginRecord } from "@/types";
import { startAutomationClient } from "./automation-client";
import "./styles/index.css";

async function bootstrap() {
  try {
    const manifests = await invoke<PluginManifest[]>("hap_list_plugins");
    const plugins: PluginRecord[] = manifests.map((m) => ({
      manifest: m,
      installed: true,
      loaded: false,
    }));
    useAppStore.getState().setPlugins(plugins);
  } catch (e) {
    console.warn("加载插件列表失败:", e);
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

bootstrap();
startAutomationClient();
