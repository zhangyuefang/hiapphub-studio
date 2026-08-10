import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FIXTURES_DIR = path.join(__dirname, '.fixtures');
const TPL_TGZ = path.resolve(__dirname, '../../../website/server/uploads/templates/blank-starter/blank-starter-1.0.0.tgz');

describe('create-project logic (offline simulation)', () => {
  const targetDir = path.join(FIXTURES_DIR, 'test-project');

  beforeEach(() => {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('extracts template .tgz correctly', () => {
    expect(fs.existsSync(TPL_TGZ)).toBe(true);
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });

    expect(fs.existsSync(path.join(targetDir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/App.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/main.tsx'))).toBe(true);
  });

  it('manifest.json has real values (no placeholders)', () => {
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });
    const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, 'manifest.json'), 'utf-8'));

    expect(manifest.id).toBe('blank-starter');
    expect(manifest.name).toBeTruthy();
    expect(manifest.name).not.toContain('{{');
    expect(manifest.entry).toBe('index.html');
    expect(manifest.icon).toBe('icon.png');
    expect(manifest.windows).toBeInstanceOf(Array);
  });

  it('replacement via original manifest values works', () => {
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });

    const manifestPath = path.join(targetDir, 'manifest.json');
    const origManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const origId = origManifest.id;
    const origName = origManifest.name;

    const replacements: Record<string, string> = {};
    if (origId) replacements[origId] = 'my-new-app';
    if (origName) replacements[origName] = 'My New App';

    const files = ['manifest.json', 'package.json', 'index.html'];
    for (const file of files) {
      const fp = path.join(targetDir, file);
      if (!fs.existsSync(fp)) continue;
      let content = fs.readFileSync(fp, 'utf-8');
      for (const [key, val] of Object.entries(replacements)) {
        content = content.replaceAll(key, val);
      }
      fs.writeFileSync(fp, content);
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-new-app');

    const html = fs.readFileSync(path.join(targetDir, 'index.html'), 'utf-8');
    expect(html).toContain('My New App');
  });

  it('matchesPattern correctly identifies replacement targets', () => {
    const patterns = ['**/*.json', '**/*.ts', '**/*.tsx', '**/*.html', '**/*.css'];
    const matchesPattern = (filename: string, pats: string[]) => {
      const ext = '.' + filename.split('.').pop();
      return pats.some(p => {
        const patExt = p.replace('**/*', '');
        return ext === patExt || p === '**/*' + ext;
      });
    };

    expect(matchesPattern('manifest.json', patterns)).toBe(true);
    expect(matchesPattern('App.tsx', patterns)).toBe(true);
    expect(matchesPattern('index.html', patterns)).toBe(true);
    expect(matchesPattern('style.css', patterns)).toBe(true);
    expect(matchesPattern('vite.config.ts', patterns)).toBe(true);
    expect(matchesPattern('icon.png', patterns)).toBe(false);
    expect(matchesPattern('photo.jpg', patterns)).toBe(false);
  });
});
