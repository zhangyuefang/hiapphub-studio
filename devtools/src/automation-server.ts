import type { RunningApp } from './automation-routes';

export async function startAutomationServer(_port?: number): Promise<boolean> {
  return true;
}

export async function stopAutomationServer() {}

export function getApiPort(): number { return 19769; }
export function getApiToken(): string | null { return null; }

let _getRunningApps: () => Promise<RunningApp[]> = async () => [];

export function setAppProvider(provider: () => Promise<RunningApp[]>) {
  _getRunningApps = provider;
}
