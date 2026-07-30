export interface ApiRequest {
  request_id: string;
  method: string;
  uri: string;
  headers: Record<string, string>;
  body: string;
  _params?: Record<string, string>;
  _query?: Record<string, string>;
}

export interface ApiResponse {
  status?: number;
  headers?: Record<string, string>;
  body: string;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

export interface RunningApp {
  appId: string;
  manifestPath?: string;
  pid?: number;
  devPort?: number;
  status: string;
  windows: string[];
}

export type RouteRegistrar = (method: string, path: string, handler: ApiHandler) => void;

export function killTrackedProcesses() {
  (window as any).hap?.system?.stopApp?.('*runners*');
}

export function setAppProvider(_provider: () => Promise<RunningApp[]>) {}
export function registerAllRoutes(_apiRoute: RouteRegistrar) {}
