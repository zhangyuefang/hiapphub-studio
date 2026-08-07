import { create } from "zustand";
import { getApiBase } from "@/lib/api";

export type DownloadStatus = "queued" | "downloading" | "paused" | "done" | "error" | "cancelled";

export interface DownloadTask {
  uuid: string;
  appId: string;
  name: string;
  version: string;
  fileUrl: string;
  fileSize: number;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  localPath: string | null;
  error: string | null;
  isUpdate: boolean;
}

interface DownloadState {
  tasks: DownloadTask[];
  maxParallel: number;
  enqueue: (task: Omit<DownloadTask, "status" | "progress" | "downloadedBytes" | "localPath" | "error">) => void;
  cancel: (uuid: string) => void;
  retry: (uuid: string) => void;
  removeCompleted: () => void;
  getTask: (uuid: string) => DownloadTask | undefined;
}

const MAX_PARALLEL = 2;

async function getCacheDir(): Promise<string> {
  try {
    const result = await hap.system.callHalFunction("app_manager", "hap_app_manager_ensure_dirs", {});
    return result.cache_dir || result.cacheDir || "/tmp/hiapphub-cache";
  } catch {
    return "/tmp/hiapphub-cache";
  }
}

async function executeDownload(task: DownloadTask, set: any, get: any) {
  const cacheDir = await getCacheDir();
  const dest = `${cacheDir}/${task.appId}-${task.version}.hapk`;

  set((s: DownloadState) => ({
    tasks: s.tasks.map((t) => t.uuid === task.uuid ? { ...t, status: "downloading" as const, localPath: dest } : t),
  }));

  try {
    const url = task.fileUrl.startsWith("http") ? task.fileUrl : `${getApiBase()}${task.fileUrl}`;
    await hap.system.callHalFunction("http", "hap_http_download", { url, dest_path: dest });

    const current = (get() as DownloadState).tasks.find((t) => t.uuid === task.uuid);
    if (current?.status === "cancelled") { processQueue(set, get); return; }

    set((s: DownloadState) => ({
      tasks: s.tasks.map((t) => t.uuid === task.uuid ? { ...t, status: "done" as const, progress: 100, downloadedBytes: task.fileSize } : t),
    }));

    await installAfterDownload(task, dest, set);
  } catch (e: any) {
    set((s: DownloadState) => ({
      tasks: s.tasks.map((t) => t.uuid === task.uuid ? { ...t, status: "error" as const, error: e?.message || "Download failed" } : t),
    }));
  }

  processQueue(set, get);
}

async function installAfterDownload(task: DownloadTask, localPath: string, set: any) {
  try {
    if (task.isUpdate) {
      await hap.system.replaceHap(task.appId, localPath);
    } else {
      await hap.system.installPlugin(localPath);
    }
  } catch (e: any) {
    set((s: DownloadState) => ({
      tasks: s.tasks.map((t) => t.uuid === task.uuid ? { ...t, status: "error" as const, error: `Install failed: ${e?.message}` } : t),
    }));
  }
}

function processQueue(set: any, get: any) {
  const state: DownloadState = get();
  const active = state.tasks.filter((t) => t.status === "downloading").length;
  if (active >= state.maxParallel) return;

  const queued = state.tasks.filter((t) => t.status === "queued");
  const toStart = queued.slice(0, state.maxParallel - active);
  for (const task of toStart) {
    executeDownload(task, set, get);
  }
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],
  maxParallel: MAX_PARALLEL,

  enqueue: (task) => {
    const existing = get().tasks.find((t) => t.uuid === task.uuid && (t.status === "downloading" || t.status === "queued"));
    if (existing) return;

    const newTask: DownloadTask = { ...task, status: "queued", progress: 0, downloadedBytes: 0, localPath: null, error: null };
    set((s) => ({ tasks: [...s.tasks.filter((t) => t.uuid !== task.uuid), newTask] }));
    setTimeout(() => processQueue(set, get), 0);
  },

  cancel: (uuid) => {
    set((s) => ({
      tasks: s.tasks.map((t) => t.uuid === uuid ? { ...t, status: "cancelled" as const } : t),
    }));
  },

  retry: (uuid) => {
    const task = get().tasks.find((t) => t.uuid === uuid);
    if (!task || (task.status !== "error" && task.status !== "cancelled")) return;
    set((s) => ({
      tasks: s.tasks.map((t) => t.uuid === uuid ? { ...t, status: "queued" as const, error: null, progress: 0 } : t),
    }));
    setTimeout(() => processQueue(set, get), 0);
  },

  removeCompleted: () => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled") }));
  },

  getTask: (uuid) => get().tasks.find((t) => t.uuid === uuid),
}));
