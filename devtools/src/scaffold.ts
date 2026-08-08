
export type ProjectType = 'hap' | 'hpl';

export interface WorkspaceConfig {
  name: string;
  projects: { id: string; type: ProjectType; displayName?: string; path?: string }[];
  created: string;
}

export interface HapManifestData {
  name: string;
  id: string;
  version: string;
  hapType: string;
  description: string;
  author: string;
  license: string;
  icon?: string;
  windows?: { label: string; title: string; width: number; height: number; resizable: boolean; url: string }[];
  dependencies?: { name: string; uuid: string }[];
  singleInstance?: boolean;
  [key: string]: unknown;
}

const SEP = '/';

const fs = () => (window as any).hap?.fs;

export const ID_REGEX = /^[a-z][a-z0-9-]*$/;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type ProgressCallback = (msg: string) => void;

export async function createWorkspace(
  dir: string,
  displayName: string,
  onLog?: ProgressCallback,
): Promise<WorkspaceConfig> {
  const id = displayName.toLowerCase().replace(/\s+/g, '-');
  const cfg: WorkspaceConfig = { name: displayName, projects: [], created: new Date().toISOString() };

  await fs()?.createDir?.(dir, { recursive: true });
  await fs()?.createDir?.(`${dir}${SEP}apps`, { recursive: true });
  onLog?.(`mkdir ${dir}/apps`);

  await fs()?.writeTextFile?.(`${dir}${SEP}hap-workspace.json`, JSON.stringify(cfg, null, 2));
  onLog?.('write hap-workspace.json');

  await fs()?.writeTextFile?.(`${dir}${SEP}package.json`, JSON.stringify({
    name: id,
    version: '1.0.0',
    private: true,
    description: '',
    scripts: { dev: 'pnpm -r --parallel run dev', build: 'pnpm -r run build' },
    devDependencies: { '@hiapphub/hap-types': '^0.1.0', typescript: '^5.0.0' },
  }, null, 2));
  onLog?.('write package.json');

  await fs()?.writeTextFile?.(`${dir}${SEP}pnpm-workspace.yaml`, 'packages:\n  - "apps/*"\n');
  onLog?.('write pnpm-workspace.yaml');

  await fs()?.writeTextFile?.(`${dir}${SEP}.gitignore`, 'node_modules/\ndist/\n*.hap\n*.hpl\n.DS_Store\n');
  onLog?.('write .gitignore');

  return cfg;
}

export async function runPnpmInstall(dir: string, onLog?: ProgressCallback): Promise<boolean> {
  const hal = (window as any).hap?.hal;
  if (!hal) {
    onLog?.('错误: HAL process API 不可用');
    return false;
  }
  onLog?.(`$ pnpm install`);
  onLog?.(`cwd: ${dir}`);
  try {
    const handle = await hal('process', 'spawn', { command: 'pnpm', args: ['install'], cwd: dir });
    const pid = handle?.pid ?? handle;
    if (typeof pid !== 'number') {
      onLog?.('错误: spawn 返回非法 PID');
      return false;
    }
    onLog?.(`spawned PID: ${pid}`);

    let running = true;
    while (running) {
      await sleep(500);
      try {
        const out = await hal('process', 'read_output', { pid });
        if (out?.stdout) {
          for (const line of out.stdout.split('\n').filter((l: string) => l.trim())) {
            onLog?.(line);
          }
        }
        if (out?.stderr) {
          for (const line of out.stderr.split('\n').filter((l: string) => l.trim())) {
            onLog?.(line);
          }
        }
      } catch {}
      try {
        running = await hal('process', 'is_running', { pid });
      } catch {
        running = false;
      }
    }

    // final flush
    try {
      const out = await hal('process', 'read_output', { pid });
      if (out?.stdout) {
        for (const line of out.stdout.split('\n').filter((l: string) => l.trim())) {
          onLog?.(line);
        }
      }
      if (out?.stderr) {
        for (const line of out.stderr.split('\n').filter((l: string) => l.trim())) {
          onLog?.(line);
        }
      }
    } catch {}

    onLog?.('pnpm install 完成');
    return true;
  } catch (e: any) {
    const msg = e?.message || e?.stderr || String(e);
    onLog?.(`错误: ${msg}`);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function readWorkspace(dir: string): Promise<WorkspaceConfig | null> {
  try {
    const raw = await fs()?.readTextFile?.(`${dir}${SEP}hap-workspace.json`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveWorkspace(dir: string, cfg: WorkspaceConfig): Promise<void> {
  await fs()?.writeTextFile?.(`${dir}${SEP}hap-workspace.json`, JSON.stringify(cfg, null, 2));
}

export async function readManifest(projectDir: string): Promise<HapManifestData | null> {
  try {
    const raw = await fs()?.readTextFile?.(`${projectDir}${SEP}manifest.json`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveManifest(projectDir: string, data: HapManifestData): Promise<void> {
  await fs()?.writeTextFile?.(`${projectDir}${SEP}manifest.json`, JSON.stringify(data, null, 2));
}

export async function addProject(
  workspaceDir: string,
  projectId: string,
  ptype: ProjectType,
  displayName?: string,
  onLog?: ProgressCallback,
): Promise<string> {
  if (!ID_REGEX.test(projectId)) {
    throw new Error(`Invalid project ID: only a-z, 0-9, - allowed, must start with letter`);
  }

  const root = `${workspaceDir}${SEP}apps${SEP}${projectId}`;
  await fs()?.createDir?.(root, { recursive: true });
  await fs()?.createDir?.(`${root}${SEP}src`, { recursive: true });
  onLog?.(`mkdir apps/${projectId}/src`);

  const name = displayName || projectId;
  const uuid = generateUUID();

  if (ptype === 'hap') {
    await fs()?.writeTextFile?.(`${root}${SEP}manifest.json`, JSON.stringify({
      id: `com.developer.${projectId}`,
      uuid,
      name,
      names: { 'zh-CN': name, 'en-US': name },
      version: '1.0.0',
      description: '',
      descriptions: { 'zh-CN': '', 'en-US': '' },
      author: '',
      license: 'MIT',
      icon: 'icon.png',
      entry: 'index.html',
      category: 'developer',
      minShellVersion: '0.1.0',
      windows: [{
        label: 'main', title: name, icon: 'icon.png', entry: 'index.html',
        width: 800, height: 600, minWidth: 400, minHeight: 300,
        resizable: true, decorations: true, position: 'center',
        visible: true, shadow: true, closeBehavior: 'close',
      }],
      permissions: [],
      dependencies: [],
    }, null, 2));
    onLog?.('write manifest.json');
    await fs()?.writeTextFile?.(`${root}${SEP}package.json`, JSON.stringify({
      name: projectId, version: '1.0.0', private: true, type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: {
        '@hiapphub/hap-types': '^0.1.0', '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0', '@vitejs/plugin-react': '^4.0.0',
        vite: '^6.0.0', '@hiapphub/vite-plugin-hap-dev': '^0.1.0', typescript: '^5.0.0',
      },
    }, null, 2));
    onLog?.('write package.json');
    await fs()?.writeTextFile?.(`${root}${SEP}tsconfig.json`, JSON.stringify({
      compilerOptions: {
        target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler',
        strict: true, jsx: 'react-jsx', esModuleInterop: true,
        skipLibCheck: true, outDir: 'dist', baseUrl: '.',
      },
      include: ['src'],
    }, null, 2));
    onLog?.('write tsconfig.json');
    await fs()?.writeTextFile?.(`${root}${SEP}vite.config.ts`,
      `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport hapDev from 'vite-plugin-hap-dev';\n\nexport default defineConfig({\n  plugins: [react(), hapDev({ devtools: true, manifest: './manifest.json' })],\n  base: './',\n  build: { outDir: 'dist' },\n});\n`);
    onLog?.('write vite.config.ts');
    await fs()?.writeTextFile?.(`${root}${SEP}index.html`,
      `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>\n`);
    onLog?.('write index.html');
    await fs()?.writeTextFile?.(`${root}${SEP}src${SEP}main.tsx`,
      `import { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n`);
    onLog?.('write src/main.tsx');
    await fs()?.writeTextFile?.(`${root}${SEP}src${SEP}App.tsx`,
      `import { useState } from 'react';\n\nexport default function App() {\n  const [msg, setMsg] = useState('');\n\n  return (\n    <div style={{ padding: 24, fontFamily: 'system-ui' }}>\n      <h1>${name}</h1>\n      <button onClick={() => setMsg('Hello!')}>Test</button>\n      {msg && <p>{msg}</p>}\n    </div>\n  );\n}\n`);
    onLog?.('write src/App.tsx');
  } else {
    await fs()?.writeTextFile?.(`${root}${SEP}manifest.json`, JSON.stringify({
      uuid, name, version: '1.0.0', description: '', author: '',
      category: 'utility', permissions: [], min_shell_version: '0.1.0',
      functions: [{ name: 'hello', description: 'Returns a greeting', params: [{ name: 'name', type: 'string' }], returns: { type: 'string' } }],
    }, null, 2));
    onLog?.('write manifest.json');
    await fs()?.writeTextFile?.(`${root}${SEP}Cargo.toml`,
      `[package]\nname = "${projectId.replace(/-/g, '_')}"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n`);
    onLog?.('write Cargo.toml');
    await fs()?.writeTextFile?.(`${root}${SEP}src${SEP}lib.rs`,
      `use std::ffi::{CStr, CString};\nuse std::os::raw::c_char;\n\n#[no_mangle]\npub extern "C" fn hap_module_init(_ctx: *const std::ffi::c_void) -> *const c_char {\n    to_c_str(&format!("{{\\"name\\":\\"${name}\\",\\"status\\":\\"ok\\"}}"))\n}\n\nfn to_c_str(s: &str) -> *const c_char {\n    CString::new(s).map(|cs| cs.into_raw() as *const c_char).unwrap_or(std::ptr::null())\n}\n`);
    onLog?.('write src/lib.rs');
  }

  const ws = await readWorkspace(workspaceDir);
  if (ws) {
    ws.projects.push({ id: projectId, type: ptype, displayName });
    await saveWorkspace(workspaceDir, ws);
  }

  return root;
}
