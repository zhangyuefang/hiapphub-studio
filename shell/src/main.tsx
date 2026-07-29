import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useAppStore } from "@/store/app-store";
import type { PluginRecord } from "@/types";
import { startAutomationClient } from "./automation-client";
import "./styles/index.css";

async function bootstrap() {
  try {
    const manifests = await hap.system.listPlugins();
    const plugins: PluginRecord[] = manifests.map((m: any) => ({
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
