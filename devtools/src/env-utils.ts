export interface EnvItem {
  name: string;
  ok: boolean;
  version: string;
  hint: string;
  installable?: boolean;
}

export async function checkCommand(cmd: string): Promise<{ ok: boolean; version: string }> {
  try {
    const r = await (window as any).hap?.hal?.('process', 'exec', { command: `${cmd} --version` });
    const out = typeof r === 'string' ? r : r?.stdout || r?.output || '';
    const ver = out.trim().split('\n')[0] || '';
    return { ok: true, version: ver };
  } catch { return { ok: false, version: '' }; }
}

export async function installTool(name: string): Promise<{ ok: boolean; msg: string }> {
  const hal = (m: string, f: string, p?: any) => (window as any).hap?.hal?.(m, f, p || {});
  try {
    if (name === 'Node.js') {
      const hasFnm = await checkCommand('fnm');
      if (hasFnm.ok) {
        await hal('process', 'exec', { command: 'fnm install --lts', timeout_ms: 120000 });
        await hal('process', 'exec', { command: 'fnm default lts-latest', timeout_ms: 10000 });
        return { ok: true, msg: 'Node.js installed via fnm' };
      }
      const hasNvm = await checkCommand('nvm');
      if (hasNvm.ok) {
        await hal('process', 'exec', { command: 'nvm install --lts', timeout_ms: 120000 });
        return { ok: true, msg: 'Node.js installed via nvm' };
      }
      const hasBrew = await checkCommand('brew');
      if (hasBrew.ok) {
        await hal('process', 'exec', { command: 'brew install node', timeout_ms: 300000 });
        return { ok: true, msg: 'Node.js installed via Homebrew' };
      }
      return { ok: false, msg: 'Please install fnm/nvm/Homebrew first, or download from https://nodejs.org' };
    }
    if (name === 'pnpm') {
      await hal('process', 'exec', { command: 'npm install -g pnpm', timeout_ms: 60000 });
      return { ok: true, msg: 'pnpm installed' };
    }
    return { ok: false, msg: `${name} cannot be auto-installed` };
  } catch (e: any) {
    return { ok: false, msg: e?.message || String(e) };
  }
}

export function initDragDialog(el: HTMLElement | null) {
  if (!el || el.dataset.dragInit) return;
  el.dataset.dragInit = '1';
  let ox = 0, oy = 0, sx = 0, sy = 0;
  const onMove = (e: MouseEvent) => { el.style.left = (sx + e.clientX - ox) + 'px'; el.style.top = (sy + e.clientY - oy) + 'px'; el.style.transform = 'none'; };
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  const title = el.querySelector('.dialog-title') as HTMLElement;
  if (title) title.addEventListener('mousedown', (e) => { ox = e.clientX; oy = e.clientY; const r = el.getBoundingClientRect(); sx = r.left; sy = r.top; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); });
}
